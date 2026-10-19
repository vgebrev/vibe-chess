// The engine's think budget: a cheap complexity estimate of the position, so it pauses like a
// player would. The budget is passed to the engine as `go movetime`, so it really searches
// that long (§4.6.1). Constants are tuned by feel.
import { Chess, type Move } from 'chess.js';
import { personality, type Difficulty } from './difficulty.ts';

const THINK = {
	forced: [350, 600],
	opening: [400, 900],
	/** Moves of the game (plies) played "by the book". */
	openingPlies: 8,
	/** The budget at complexity 0 and 1. */
	range: [600, 3000],
	/** σ of the log-normal jitter (median 1). */
	jitter: 0.25,
	recapture: 0.5,
	clamp: [500, 4500]
} as const;

/** The position before the engine moves, and the opponent's last move. */
export interface ThinkInput {
	fen: string;
	lastMove?: Pick<Move, 'to' | 'captured'> | null;
}

/** Complexity 0..1 from breadth, captures, checks and how much material is left. */
export function complexity(chess: Chess, lastMove?: ThinkInput['lastMove']): number {
	const moves = chess.moves({ verbose: true });
	const captures = moves.filter((m) => m.isCapture() || m.isEnPassant());
	const checks = moves.filter((m) => m.san.endsWith('+') || m.san.endsWith('#'));
	const nonPawnPieces = chess
		.board()
		.flat()
		.filter((p) => p && p.type !== 'p' && p.type !== 'k').length;
	let c = clamp01(
		0.4 * Math.min(moves.length / 40, 1) +
			0.3 * Math.min(captures.length / 6, 1) +
			0.15 * (chess.inCheck() || checks.length > 0 ? 1 : 0) +
			0.15 * Math.min(nonPawnPieces / 10, 1)
	);
	// The opponent just captured and we can take back on that square.
	if (lastMove?.captured && captures.some((m) => m.to === lastMove.to)) c *= THINK.recapture;
	return c;
}

/** The think budget in ms. `random` returns [0, 1), seeded in tests. */
export function thinkTime(
	{ fen, lastMove }: ThinkInput,
	difficulty: Difficulty,
	random: () => number = Math.random
): number {
	const chess = new Chess(fen);
	const legal = chess.moves().length;
	const ply = (chess.moveNumber() - 1) * 2 + (chess.turn() === 'b' ? 1 : 0);
	const between = ([lo, hi]: readonly [number, number]) => lo + random() * (hi - lo);

	let t: number;
	if (legal <= 1) t = between(THINK.forced);
	else if (ply < THINK.openingPlies) t = between(THINK.opening);
	else {
		const c = complexity(chess, lastMove);
		const [lo, hi] = THINK.range;
		t = (lo + (hi - lo) * c) * Math.exp(THINK.jitter * gaussian(random));
	}
	const [min, max] = THINK.clamp;
	return Math.round(Math.min(max, Math.max(min, t * personality(difficulty))));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A standard normal sample (Box–Muller). */
function gaussian(random: () => number): number {
	const u = 1 - random(); // (0, 1], so the log is finite
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}
