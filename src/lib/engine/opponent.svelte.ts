// The computer opponent: starts the engine on first use, times each reply with the think-time
// model, searches at the chosen difficulty and plays the reply into the game (§4.6).
import type { Game } from '#lib/game/game.svelte.ts';
import { uciOptions, type Difficulty } from './difficulty.ts';
import { Engine } from './engine.ts';
import { thinkTime } from './thinkTime.ts';
import { createWorker } from './worker.ts';

export type OpponentStatus = 'idle' | 'thinking' | 'failed';

export class Opponent {
	status = $state<OpponentStatus>('idle');
	#start: () => Promise<Engine>;
	#engine: Promise<Engine | null> | null = null;
	/** Bumped by every request and cancel; replies for an older one are dropped (§4.6). */
	#request = 0;

	constructor(start: () => Promise<Engine> = async () => Engine.start(await createWorker())) {
		this.#start = start;
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
		const started = performance.now();
		const result = await engine.search(fen, budget, uciOptions(difficulty));
		if (!result || !current()) return;
		// A forced line can come back early; the pause stays as long as planned.
		const remaining = budget - (performance.now() - started);
		if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
		if (!current() || game.fen !== fen) return;

		this.status = 'idle';
		if (import.meta.env?.DEV && result.info) {
			const { depth, nps } = result.info;
			console.debug(
				`[engine] ${budget} ms, depth ${depth}, ${Math.round(nps / 1000)}k nodes/s, ` +
					JSON.stringify(uciOptions(difficulty))
			);
		}
		if (result.move) game.move(result.move);
	}

	/** Drop the pending reply, if any. */
	cancel() {
		this.#request++;
		if (this.status === 'thinking') this.status = 'idle';
		void this.#engine?.then((engine) => engine?.stop());
	}
}
