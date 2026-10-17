// Calibrates the human-like move choice (SPEC §4.6.2): plays games between Elo tiers, and
// against Stockfish's own strength limit (`UCI_Elo`), and reports each match's score and the
// Elo difference it implies. A manual tuning tool, not part of the build or the tests.
//
//   node scripts/calibrate.ts [--games 100] [--movetime 300] [--parallel 9] bot:1350-sf:1350 …
//
// A side is `bot:<elo>` (the app's move choice at that target) or `sf:<elo>` (Stockfish with
// UCI_LimitStrength). Expected results: a tier scores 50% against Stockfish at the same Elo,
// and about 7% against a tier 450 above it (the Elo formula for a 450-point gap).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { Chess } from 'chess.js';
import { Engine, type EngineWorker } from '../src/lib/engine/engine.ts';
import { chooseMove, hash, multiPv } from '../src/lib/engine/humanize.ts';
import { seeded } from '../src/lib/engine/thinkTime.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		games: { type: 'string', default: '100' },
		movetime: { type: 'string', default: '300' },
		parallel: { type: 'string', default: '9' },
		maxPlies: { type: 'string', default: '400' }
	}
});
const GAMES = Number(values.games);
const MOVETIME = Number(values.movetime);
const PARALLEL = Number(values.parallel);
const MAX_PLIES = Number(values.maxPlies);
/** A game is adjudicated once one side's evaluation stays beyond this for ADJUDICATE_PLIES. */
const ADJUDICATE_CP = 2000;
const ADJUDICATE_PLIES = 10;

const script = createRequire(import.meta.url).resolve('stockfish/bin/stockfish-19-lite-single.js');

/** Stockfish in a child process, speaking UCI line by line, shaped like the app's Worker. */
function processWorker(): EngineWorker {
	const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'inherit'] });
	const worker: EngineWorker = {
		onmessage: null,
		onerror: null,
		postMessage: (command) => child.stdin.write(command + '\n'),
		terminate: () => child.kill()
	};
	let buffer = '';
	child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
		buffer += chunk;
		let nl;
		while ((nl = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (line) worker.onmessage?.({ data: line } as MessageEvent<string>);
		}
	});
	return worker;
}

type Side = { kind: 'bot' | 'sf'; elo: number };

function parseSide(text: string): Side {
	const match = /^(bot|sf):(\d+)$/.exec(text);
	if (!match) throw new Error(`Expected bot:<elo> or sf:<elo>, got ${text}`);
	return { kind: match[1] as Side['kind'], elo: Number(match[2]) };
}

const label = (side: Side) => `${side.kind}:${side.elo}`;

interface Player {
	/** The move to play, and the evaluation (cp, side to move) it was based on. */
	move(fen: string): Promise<{ uci: string; cp: number | null }>;
	quit(): void;
}

async function player(side: Side, gameSeed: number): Promise<Player> {
	const engine = await Engine.start(processWorker());
	if (side.kind === 'sf') await engine.setOptions({ UCI_LimitStrength: 'true', UCI_Elo: side.elo });
	return {
		async move(fen) {
			const legal = new Chess(fen).moves().length;
			const lines = side.kind === 'bot' ? multiPv(side.elo, legal) : 1;
			const result = (await engine.search(fen, MOVETIME, lines))!;
			const best = result.candidates[0]?.cp ?? null;
			if (side.kind === 'sf') {
				const { from, to, promotion } = result.move!;
				return { uci: from + to + (promotion ?? ''), cp: best };
			}
			const choice = chooseMove(fen, result.candidates, side.elo, seeded(hash(fen, gameSeed)));
			if (choice) return { uci: choice.uci, cp: best };
			const { from, to, promotion } = result.move!;
			return { uci: from + to + (promotion ?? ''), cp: best };
		},
		quit: () => engine.terminate()
	};
}

/** Play one game; returns White's score (1, ½ or 0). */
async function playGame(white: Side, black: Side, seed: number): Promise<number> {
	const players = { w: await player(white, seed), b: await player(black, seed ^ 0x5bd1e995) };
	const chess = new Chess();
	let streak = 0;
	let streakSign = 0;
	try {
		for (let ply = 0; ply < MAX_PLIES; ply++) {
			if (chess.isCheckmate()) return chess.turn() === 'w' ? 0 : 1;
			if (chess.isDraw()) return 0.5;
			const turn = chess.turn();
			const { uci, cp } = await players[turn].move(chess.fen());
			chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
			// Adjudicate a long-decided game: the evaluation, from White's side, stays one way.
			const white = cp === null ? 0 : turn === 'w' ? cp : -cp;
			const sign = Math.abs(white) >= ADJUDICATE_CP ? Math.sign(white) : 0;
			streak = sign !== 0 && sign === streakSign ? streak + 1 : sign !== 0 ? 1 : 0;
			streakSign = sign;
			if (streak >= ADJUDICATE_PLIES) return sign > 0 ? 1 : 0;
		}
		if (chess.isCheckmate()) return chess.turn() === 'w' ? 0 : 1;
		return 0.5;
	} finally {
		players.w.quit();
		players.b.quit();
	}
}

/** Elo difference implied by a score, with a ~95% interval from the per-game spread. */
function eloDiff(scores: number[]) {
	const n = scores.length;
	const mean = scores.reduce((a, b) => a + b, 0) / n;
	const sd = Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / Math.max(1, n - 1));
	const elo = (p: number) => -400 * Math.log10(1 / Math.min(0.999, Math.max(0.001, p)) - 1);
	const margin = (1.96 * sd) / Math.sqrt(n);
	return { mean, diff: elo(mean), low: elo(mean - margin), high: elo(mean + margin) };
}

/** Every game played, from a's side, for the rating fit. */
const results: { a: string; b: string; score: number }[] = [];

async function match(a: Side, b: Side) {
	const scores: number[] = [];
	let next = 0;
	const run = async () => {
		while (next < GAMES) {
			const game = next++;
			// Alternate colours; scores are kept from a's side.
			const aWhite = game % 2 === 0;
			const seed = (game * 2654435761) >>> 0;
			const white = await playGame(aWhite ? a : b, aWhite ? b : a, seed);
			scores.push(aWhite ? white : 1 - white);
			results.push({ a: label(a), b: label(b), score: scores.at(-1)! });
			process.stderr.write(`\r${label(a)} vs ${label(b)}: ${scores.length}/${GAMES}`);
		}
	};
	await Promise.all(Array.from({ length: PARALLEL }, run));
	process.stderr.write('\n');
	const wins = scores.filter((s) => s === 1).length;
	const draws = scores.filter((s) => s === 0.5).length;
	const { mean, diff, low, high } = eloDiff(scores);
	const expected = b.elo - a.elo;
	console.log(
		`${label(a)} vs ${label(b)}: +${wins} =${draws} -${scores.length - wins - draws}, ` +
			`score ${(mean * 100).toFixed(1)}%, Elo ${diff >= 0 ? '+' : ''}${Math.round(diff)} ` +
			`[${Math.round(low)}, ${Math.round(high)}] (target ${expected <= 0 ? '+' : ''}${-expected})`
	);
}

if (!positionals.length) {
	console.error('Usage: node scripts/calibrate.ts [options] bot:1350-sf:1350 …');
	process.exit(1);
}
for (const pair of positionals) {
	const [a, b] = pair.split('-').map(parseSide);
	await match(a, b);
}

/**
 * Fit every bot's actual rating from all games at once (Bradley–Terry, by gradient ascent on
 * the log-likelihood), holding the Stockfish sides at their nominal Elo. A ladder of tiers
 * 225 apart, tied to sf:1350 and sf:1800, resolves far better than single 450-point matches.
 */
function fit() {
	const players = [...new Set(results.flatMap((r) => [r.a, r.b]))];
	const fixed = (p: string) => p.startsWith('sf:');
	if (!players.some(fixed)) return;
	const rating = new Map(players.map((p) => [p, Number(p.split(':')[1])]));
	const expect = (a: string, b: string) =>
		1 / (1 + 10 ** ((rating.get(b)! - rating.get(a)!) / 400));
	for (let step = 0; step < 5000; step++) {
		const gradient = new Map(players.map((p) => [p, 0]));
		for (const { a, b, score } of results) {
			const surprise = score - expect(a, b);
			gradient.set(a, gradient.get(a)! + surprise);
			gradient.set(b, gradient.get(b)! - surprise);
		}
		for (const p of players) if (!fixed(p)) rating.set(p, rating.get(p)! + 2 * gradient.get(p)!);
	}
	console.log('Fitted ratings (Stockfish sides fixed):');
	for (const p of players.filter((p) => !fixed(p)).sort((x, y) => rating.get(x)! - rating.get(y)!))
		console.log(`  ${p} ≈ ${Math.round(rating.get(p)!)}`);
}
fit();
