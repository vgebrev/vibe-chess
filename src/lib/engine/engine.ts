// A Promise-based UCI client for Stockfish (§4.6): in the app a Web Worker (worker.ts), in
// the calibration script a Node child process. It plays at full strength and reports every
// scored move, for the human-like move choice (§4.6.2).
import type { MoveInput } from '#lib/game/game.svelte.ts';
import { Analysis, type Candidate } from './analysis.ts';
import { parseBestMove, parseInfo, type SearchInfo } from './uci.ts';

/** The part of a Worker the client uses, so tests can stand in a fake engine. */
export interface EngineWorker {
	postMessage(command: string): void;
	onmessage: ((e: MessageEvent<string>) => void) | null;
	onerror: ((e: ErrorEvent) => void) | null;
	terminate(): void;
}

export interface SearchResult {
	/** Null if the engine has no legal move. */
	move: MoveInput | null;
	/** The deepest search statistics reported. */
	info: SearchInfo | null;
	/** The moves scored (`MultiPV`), best first. */
	candidates: Candidate[];
}

interface Search {
	resolve: (result: SearchResult | null) => void;
	cancelled: boolean;
	info: SearchInfo | null;
	analysis: Analysis;
}

export class Engine {
	#worker: EngineWorker;
	#listeners = new Set<(line: string) => void>();
	/** Searches waiting for their `bestmove`, oldest first. Each `go` gets exactly one. */
	#searches: Search[] = [];
	/** Option values last sent, so unchanged ones aren't sent again. */
	#options = new Map<string, string>();
	/** Bumped by `stop()`, so a search still waiting to start is dropped too. */
	#stops = 0;

	private constructor(worker: EngineWorker) {
		this.#worker = worker;
		worker.onmessage = (e) => {
			const line = String(e.data);
			this.#line(line);
			for (const listener of this.#listeners) listener(line);
		};
	}

	/** Start an engine: `uci` → `uciok` → `isready` → `readyok`. */
	static async start(worker: EngineWorker, timeoutMs = 30_000): Promise<Engine> {
		const engine = new Engine(worker);
		const failed = new Promise<never>((_, reject) => {
			const timer = setTimeout(() => reject(new Error('The engine did not start')), timeoutMs);
			worker.onerror = (e) => {
				clearTimeout(timer);
				reject(new Error(e.message || 'The engine failed to load'));
			};
		});
		try {
			const options = engine.#collect((line) => line === 'uciok');
			engine.#send('uci');
			await Promise.race([options, failed]);
			await Promise.race([engine.#ready(), failed]);
			return engine;
		} catch (error) {
			worker.terminate();
			throw error;
		}
	}

	/**
	 * Set UCI options, sending only those that changed. Waits for any search to finish first,
	 * since UCI forbids changing options mid-search.
	 */
	async setOptions(options: Record<string, string | number>): Promise<void> {
		const changed = Object.entries(options)
			.map(([name, value]) => [name, String(value)] as const)
			.filter(([name, value]) => this.#options.get(name) !== value);
		if (!changed.length) return;
		await this.#idle();
		for (const [name, value] of changed) {
			this.#options.set(name, value);
			this.#send(`setoption name ${name} value ${value}`);
		}
		await this.#ready();
	}

	/**
	 * Search `fen` for `movetime` ms, scoring the best `lines` moves (`MultiPV`). Resolves null
	 * if stopped by `stop()` meanwhile.
	 */
	async search(fen: string, movetime: number, lines = 1): Promise<SearchResult | null> {
		const stops = this.#stops;
		await this.setOptions({ MultiPV: lines });
		if (stops !== this.#stops) return null;
		return new Promise((resolve) => {
			this.#searches.push({ resolve, cancelled: false, info: null, analysis: new Analysis() });
			this.#send(`position fen ${fen}`);
			this.#send(`go movetime ${Math.round(movetime)}`);
		});
	}

	/** Abandon every pending search: their replies are discarded (§4.6). */
	stop() {
		this.#stops++;
		if (!this.#searches.length) return;
		for (const search of this.#searches) search.cancelled = true;
		this.#send('stop');
	}

	terminate() {
		this.stop();
		this.#worker.terminate();
	}

	#line(line: string) {
		const search = this.#searches[0];
		if (!search) return;
		if (line.startsWith('bestmove')) {
			this.#searches.shift();
			const { info, analysis } = search;
			const result = { move: parseBestMove(line), info, candidates: analysis.candidates };
			search.resolve(search.cancelled ? null : result);
			return;
		}
		search.analysis.add(line);
		const info = parseInfo(line);
		if (info && info.depth >= (search.info?.depth ?? 0)) search.info = info;
	}

	#send(command: string) {
		this.#worker.postMessage(command);
	}

	/** Lines up to and including the first one that matches. */
	#collect(done: (line: string) => boolean): Promise<string[]> {
		const lines: string[] = [];
		return new Promise((resolve) => {
			const listener = (line: string) => {
				lines.push(line);
				if (!done(line)) return;
				this.#listeners.delete(listener);
				resolve(lines);
			};
			this.#listeners.add(listener);
		});
	}

	async #ready() {
		const ready = this.#collect((line) => line === 'readyok');
		this.#send('isready');
		await ready;
	}

	async #idle() {
		while (this.#searches.length) await this.#collect((line) => line.startsWith('bestmove'));
	}
}
