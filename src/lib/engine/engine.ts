// A Promise-based UCI client for Stockfish in a Web Worker (worker.ts) (§4.6).
import type { MoveInput } from '#lib/game/game.svelte.ts';
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
}

interface Search {
	resolve: (result: SearchResult | null) => void;
	cancelled: boolean;
	info: SearchInfo | null;
	oninfo?: (info: SearchInfo) => void;
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
			const uciok = engine.#waitFor((line) => line === 'uciok');
			engine.#send('uci');
			await Promise.race([uciok, failed]);
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
	 * Search `fen` for `movetime` ms with `options` set first, telling `oninfo` of each depth
	 * reached. Resolves null if stopped by `stop()` meanwhile.
	 */
	async search(
		fen: string,
		movetime: number,
		options: Record<string, string | number> = {},
		oninfo?: (info: SearchInfo) => void
	): Promise<SearchResult | null> {
		const stops = this.#stops;
		await this.setOptions(options);
		if (stops !== this.#stops) return null;
		return new Promise((resolve) => {
			this.#searches.push({ resolve, cancelled: false, info: null, oninfo });
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
			const result = { move: parseBestMove(line), info: search.info };
			search.resolve(search.cancelled ? null : result);
			return;
		}
		const info = parseInfo(line);
		if (!info || info.depth < (search.info?.depth ?? 0)) return;
		search.info = info;
		if (!search.cancelled) search.oninfo?.(info);
	}

	#send(command: string) {
		this.#worker.postMessage(command);
	}

	/** Resolves on the first line that matches. */
	#waitFor(match: (line: string) => boolean): Promise<void> {
		return new Promise((resolve) => {
			const listener = (line: string) => {
				if (!match(line)) return;
				this.#listeners.delete(listener);
				resolve();
			};
			this.#listeners.add(listener);
		});
	}

	async #ready() {
		const ready = this.#waitFor((line) => line === 'readyok');
		this.#send('isready');
		await ready;
	}

	async #idle() {
		while (this.#searches.length) await this.#waitFor((line) => line.startsWith('bestmove'));
	}
}
