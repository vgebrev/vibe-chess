import { describe, expect, it, vi } from 'vitest';
import { Engine } from './engine.ts';
import { FakeWorker } from './fakeWorker.ts';

const START = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('Engine', () => {
	it('starts with uci and isready', async () => {
		const worker = new FakeWorker();
		await Engine.start(worker);
		expect(worker.sent).toEqual(['uci', 'isready']);
	});

	it('sets options once, and only those that changed', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		await engine.setOptions({ MultiPV: 5, Hash: 16 });
		await engine.setOptions({ MultiPV: 5, Hash: 32 });
		expect(worker.sent.slice(2)).toEqual([
			'setoption name MultiPV value 5',
			'setoption name Hash value 16',
			'isready',
			'setoption name Hash value 32',
			'isready'
		]);
	});

	it('searches for the given time and returns the moves it scored', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		const search = engine.search(START, 750, 2);
		await vi.waitFor(() => expect(worker.sent.at(-1)).toBe('go movetime 750'));
		expect(worker.sent.slice(2)).toEqual([
			'setoption name MultiPV value 2',
			'isready',
			`position fen ${START}`,
			'go movetime 750'
		]);
		worker.reply(
			'info depth 1 multipv 1 score cp 20 nodes 20 pv e7e5',
			'info depth 1 multipv 2 score cp 10 nodes 20 pv c7c5',
			'info depth 2 multipv 1 score cp 15 nodes 90 pv c7c5 g1f3',
			'info depth 2 multipv 2 score cp 5 upperbound nodes 90 pv e7e5'
		);
		worker.finish();
		const result = await search;
		expect(result?.move).toEqual({ from: 'e7', to: 'e5' });
		expect(result?.info).toEqual({ depth: 9, nodes: 5000, nps: 250000, time: 20 });
		// e7e5's depth-2 score was only a bound, so its exact depth-1 score stands.
		expect(result?.candidates.map((c) => [c.uci, c.cp, c.depth, c.shallowCp])).toEqual([
			['e7e5', 20, 1, 20],
			['c7c5', 15, 2, 10]
		]);
	});

	it('discards the reply to a stopped search, and drops one still waiting to start', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		const waiting = engine.search(START, 2000);
		engine.stop();
		expect(await waiting).toBeNull();

		const stale = engine.search(START, 2000);
		await vi.waitFor(() => expect(worker.searching).toHaveLength(1));
		engine.stop();
		const fresh = engine.search(START, 2000);
		expect(await stale).toBeNull();
		await vi.waitFor(() => expect(worker.searching).toHaveLength(1));
		worker.finish();
		expect((await fresh)?.move).toEqual({ from: 'g8', to: 'f6' });
	});

	it('changes options only once a search has finished', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		void engine.search(START, 2000);
		await vi.waitFor(() => expect(worker.searching).toHaveLength(1));
		const searching = engine.search(START, 2000, 3);
		await new Promise((resolve) => setTimeout(resolve));
		expect(worker.sent).not.toContain('setoption name MultiPV value 3');
		worker.finish();
		await vi.waitFor(() => expect(worker.searching).toHaveLength(1));
		expect(worker.sent.slice(-4, -2)).toEqual(['setoption name MultiPV value 3', 'isready']);
		worker.finish();
		await searching;
	});

	it('fails, and frees the worker, when the engine does not load', async () => {
		const worker = new FakeWorker();
		worker.postMessage = () =>
			queueMicrotask(() => worker.onerror?.({ message: 'no wasm' } as ErrorEvent));
		await expect(Engine.start(worker)).rejects.toThrow('no wasm');
		expect(worker.terminated).toBe(true);
	});

	it('times out if the engine never answers', async () => {
		const worker = new FakeWorker();
		worker.postMessage = () => {};
		await expect(Engine.start(worker, 10)).rejects.toThrow('did not start');
	});
});
