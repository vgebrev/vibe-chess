import { describe, expect, it, vi } from 'vitest';
import { Engine } from './engine.ts';
import { FakeWorker } from '#lib/testing/fakeWorker.ts';

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

	it('searches for the given time, with its options set first, and returns the best move', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		const search = engine.search(START, 750, { 'Skill Level': 2 });
		await vi.waitFor(() => expect(worker.sent.at(-1)).toBe('go movetime 750'));
		expect(worker.sent.slice(2)).toEqual([
			'setoption name Skill Level value 2',
			'isready',
			`position fen ${START}`,
			'go movetime 750'
		]);
		worker.finish();
		const result = await search;
		expect(result?.move).toEqual({ from: 'e7', to: 'e5' });
		expect(result?.info).toEqual({ depth: 9, nps: 250000 });
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
		const searching = engine.search(START, 2000, { MultiPV: 3 });
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
