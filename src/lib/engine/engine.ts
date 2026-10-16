// A Promise-based UCI client for Stockfish in a Web Worker (§4.6). The single-threaded lite WASM
// build is emitted as hashed assets and only fetched when the first engine starts.
import scriptUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import wasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';
import type { MoveInput } from '#lib/game/game.svelte.ts';
import { ELO_RANGE, eloRange, uciOptions, type Difficulty } from './difficulty.ts';
import { parseBestMove, parseInfo, parseSpinOption, type SearchInfo } from './uci.ts';

/** The part of a Worker the client uses, so tests can stand in a fake engine. */
export interface EngineWorker {
	postMessage(command: string): void;
	onmessage: ((e: MessageEvent<string>) => void) | null;
	onerror: ((e: ErrorEvent) => void) | null;
	terminate(): void;
}

export async function createWorker(): Promise<EngineWorker> {
	const wasm = new URL(wasmUrl, location.href).href;
	// A failed WASM download never reaches the worker's error event, so check it can be
	// fetched before relying on the start timeout.
	const head = await fetch(wasm, { method: 'HEAD' });
	if (!head.ok) throw new Error(`The engine could not be downloaded (${head.status})`);
	// The script finds its WASM through the URL fragment.
	return new Worker(`${scriptUrl}#${encodeURIComponent(wasm)}`);
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
}

export class Engine {
	#worker: EngineWorker;
	#listeners = new Set<(line: string) => void>();
	/** Searches waiting for their `bestmove`, oldest first. Each `go` gets exactly one. */
	#searches: Search[] = [];
	/** The custom Elo range the engine supports (§4.6). */
	eloRange = ELO_RANGE;

	private constructor(worker: EngineWorker) {
		this.#worker = worker;
		worker.onmessage = (e) => {
			const line = String(e.data);
			this.#line(line);
			for (const listener of this.#listeners) listener(line);
		};
	}

	/** Start an engine: `uci` → `uciok` (recording the Elo range) → `isready` → `readyok`. */
	static async start(worker?: EngineWorker, timeoutMs = 30_000): Promise<Engine> {
		worker ??= await createWorker();
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
			for (const line of await Promise.race([options, failed])) {
				const option = parseSpinOption(line);
				if (option?.name === 'UCI_Elo') engine.eloRange = eloRange(option);
			}
			await Promise.race([engine.#ready(), failed]);
			return engine;
		} catch (error) {
			worker.terminate();
			throw error;
		}
	}

	/** Apply a difficulty. Waits for any search to finish first, since UCI forbids changing
	 *  options mid-search. */
	async configure(difficulty: Difficulty): Promise<void> {
		await this.#idle();
		for (const [name, value] of uciOptions(difficulty, this.eloRange)) {
			this.#send(`setoption name ${name} value ${value}`);
		}
		await this.#ready();
	}

	/** Search `fen` for `movetime` ms. Resolves null if stopped by `stop()` meanwhile. */
	search(fen: string, movetime: number): Promise<SearchResult | null> {
		return new Promise((resolve) => {
			this.#searches.push({ resolve, cancelled: false, info: null });
			this.#send(`position fen ${fen}`);
			this.#send(`go movetime ${Math.round(movetime)}`);
		});
	}

	/** Abandon every pending search: their replies are discarded (§4.6). */
	stop() {
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
			search.resolve(search.cancelled ? null : { move: parseBestMove(line), info: search.info });
			return;
		}
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
