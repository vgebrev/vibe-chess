import { describe, expect, it } from 'vitest';
import { Engine } from './engine.ts';
import { FakeWorker } from './fakeWorker.ts';

const START = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('Engine', () => {
	it('starts with uci and isready, reading the Elo range', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		expect(worker.sent).toEqual(['uci', 'isready']);
		expect(engine.eloRange).toEqual({ min: 1350, max: 3150 });
	});

	it('applies a difficulty and waits for readyok', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		await engine.configure({ kind: 'custom', elo: 1600 });
		expect(worker.sent.slice(2)).toEqual([
			'setoption name UCI_LimitStrength value true',
			'setoption name UCI_Elo value 1600',
			'isready'
		]);
	});

	it('searches for the given time and returns the move with its statistics', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		const search = engine.search(START, 750);
		expect(worker.sent.slice(-2)).toEqual([`position fen ${START}`, 'go movetime 750']);
		worker.finish();
		expect(await search).toEqual({
			move: { from: 'e7', to: 'e5' },
			info: { depth: 9, nodes: 5000, nps: 250000, time: 20 }
		});
	});

	it('discards the reply to a stopped search, but not to the one after it', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		const stale = engine.search(START, 2000);
		engine.stop();
		const fresh = engine.search(START, 2000);
		worker.finish();
		expect(await stale).toBeNull();
		expect((await fresh)?.move).toEqual({ from: 'g8', to: 'f6' });
	});

	it('changes options only once a search has finished', async () => {
		const worker = new FakeWorker();
		const engine = await Engine.start(worker);
		void engine.search(START, 2000);
		const configured = engine.configure({ kind: 'preset', id: 'p0' });
		await Promise.resolve();
		expect(worker.sent.at(-1)).toBe('go movetime 2000');
		worker.finish();
		await configured;
		expect(worker.sent.slice(-3)).toEqual([
			'setoption name UCI_LimitStrength value false',
			'setoption name Skill Level value 0',
			'isready'
		]);
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
