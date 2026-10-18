// The Stockfish Web Worker (§4.6). The single-threaded lite WASM build is emitted as hashed
// assets and only fetched when the first engine starts.
import scriptUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import wasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';
import type { EngineWorker } from './engine.ts';

export async function createWorker(): Promise<EngineWorker> {
	const wasm = new URL(wasmUrl, location.href).href;
	// A failed WASM download never reaches the worker's error event, so check it can be
	// fetched before relying on the start timeout.
	const head = await fetch(wasm, { method: 'HEAD' });
	if (!head.ok) throw new Error(`The engine could not be downloaded (${head.status})`);
	// The script finds its WASM through the URL fragment.
	return new Worker(`${scriptUrl}#${encodeURIComponent(wasm)}`);
}
