// The computer opponent: starts the engine on first use, times each reply with the think-time
// model, searches at the chosen difficulty and plays the reply into the game (§4.6).
import type { Move } from 'chess.js';
import type { Judgement } from '#lib/audio/voices.ts';
import type { Game, MoveInput } from '#lib/game/game.svelte.ts';
import { uciOptions, type Difficulty } from './difficulty.ts';
import { Engine } from './engine.ts';
import { judge, type Expectation } from './judge.ts';
import { thinkTime } from './thinkTime.ts';
import { createWorker } from './worker.ts';

export type OpponentStatus = 'idle' | 'thinking' | 'failed';

/** How deep the search for a reply looks before the player's move is judged by it (§4.11). */
export const JUDGE_DEPTH = 8;

const uci = ({ from, to, promotion }: MoveInput) => `${from}${to}${promotion ?? ''}`;

/** A score still to come. */
interface Pending {
	score: Promise<number | null>;
	resolve: (score: number | null) => void;
}

export class Opponent {
	status = $state<OpponentStatus>('idle');
	#start: () => Promise<Engine>;
	#hold: () => Promise<void>;
	#engine: Promise<Engine | null> | null = null;
	/** Bumped by every request and cancel; replies for an older one are dropped (§4.6). */
	#request = 0;
	/** What the search expected when the computer last moved, and the position it left. */
	#expected: { fen: string; expectation: Expectation } | null = null;
	/** The score of a position the computer is to search (or is searching), once deep enough. */
	#pending: { fen: string } & Pending = { fen: '', ...pending() };

	/** `hold`: what a reply waits for once found, such as a taunt still being said (§4.11). */
	constructor(
		start: () => Promise<Engine> = async () => Engine.start(await createWorker()),
		hold: () => Promise<void> = async () => {}
	) {
		this.#start = start;
		this.#hold = hold;
	}

	/** Start the engine if it isn't running. Resolves null, with status `failed`, if it can't. */
	load(): Promise<Engine | null> {
		this.#engine ??= this.#start().catch((error) => {
			console.error(error);
			this.status = 'failed';
			return null;
		});
		return this.#engine;
	}

	/** Think for the side to move and play its reply, unless cancelled or the game moves on. */
	async play(game: Game, difficulty: Difficulty): Promise<void> {
		const request = ++this.#request;
		const current = () => request === this.#request;
		const fen = game.fen;
		const budget = thinkTime({ fen, lastMove: game.lastMove }, difficulty);
		this.status = 'thinking';

		const engine = await this.load();
		if (!engine || !current()) return;
		const scored = this.#scoreOf(fen);
		const started = performance.now();
		const result = await engine.search(fen, budget, uciOptions(difficulty), (info) => {
			if (info.depth >= JUDGE_DEPTH) scored.resolve(info.score);
		});
		scored.resolve(result?.info?.score ?? null);
		if (!result || !current()) return;
		// A forced line can come back early; the pause stays as long as planned.
		const remaining = budget - (performance.now() - started);
		if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
		await this.#hold();
		if (!current() || game.fen !== fen) return;

		this.status = 'idle';
		if (import.meta.env?.DEV && result.info) {
			const { depth, nps } = result.info;
			console.debug(
				`[engine] ${budget} ms, depth ${depth}, ${Math.round(nps / 1000)}k nodes/s, ` +
					JSON.stringify(uciOptions(difficulty))
			);
		}
		if (!result.move) return;
		game.move(result.move);
		const { info } = result;
		const best = info?.pv[0] === uci(result.move);
		this.#expected = info && {
			fen: game.fen,
			expectation: { score: info.score, reply: best ? info.pv[1] : undefined }
		};
	}

	/**
	 * What the computer makes of the player's move, from what it expected when it last moved and
	 * its search for a reply (§4.11). Neutral if it can't tell; it may never resolve if no reply
	 * is searched for, so a caller waits only so long.
	 */
	async judge(move: Move): Promise<Judgement> {
		const expected = this.#expected;
		if (!expected || expected.fen !== move.before) return 'neutral';
		const score = await this.#scoreOf(move.after).score;
		return score === null ? 'neutral' : judge(expected.expectation, move.lan, score);
	}

	/** The score to come of the position `fen`, from the search of it for a reply. */
	#scoreOf(fen: string): Pending {
		if (this.#pending.fen !== fen) this.#pending = { fen, ...pending() };
		return this.#pending;
	}

	/** Drop the pending reply, if any. */
	cancel() {
		this.#request++;
		if (this.status === 'thinking') this.status = 'idle';
		void this.#engine?.then((engine) => engine?.stop());
	}
}

function pending(): Pending {
	let resolve!: Pending['resolve'];
	const score = new Promise<number | null>((r) => (resolve = r));
	return { score, resolve };
}
