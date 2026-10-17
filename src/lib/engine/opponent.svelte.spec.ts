import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '#lib/game/game.svelte.ts';
import { Engine } from './engine.ts';
import { FakeWorker } from './fakeWorker.ts';
import { Opponent } from './opponent.svelte.ts';

const beginner = { kind: 'preset', id: 'p0' } as const;
const expert = { kind: 'preset', id: 'p4' } as const;
const master = { kind: 'custom', elo: 3000 } as const;

function setup() {
	const worker = new FakeWorker();
	worker.instant = true;
	const opponent = new Opponent(() => Engine.start(worker));
	const game = new Game();
	game.move({ from: 'e2', to: 'e4' });
	return { worker, opponent, game };
}

describe('Opponent', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('thinks for the whole budget, even when the engine answers at once, then plays', async () => {
		const { worker, opponent, game } = setup();
		const playing = opponent.play(game, beginner);
		expect(opponent.status).toBe('thinking');
		await vi.advanceTimersByTimeAsync(400);
		// The engine has answered, but the reply waits out the opening budget (≥ 500 ms).
		// A beginner might play any move, so every one is scored.
		expect(worker.sent).toContain('setoption name MultiPV value 20');
		expect(game.moves).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		await playing;
		expect(game.lastMove?.san).toBe('e5');
		expect(opponent.status).toBe('idle');
	});

	it('drops the reply when cancelled', async () => {
		const { opponent, game } = setup();
		const playing = opponent.play(game, beginner);
		await vi.advanceTimersByTimeAsync(100);
		opponent.cancel();
		expect(opponent.status).toBe('idle');
		await vi.advanceTimersByTimeAsync(2000);
		await playing;
		expect(game.moves).toHaveLength(1);
	});

	it('drops the reply if the position changed meanwhile', async () => {
		const { opponent, game } = setup();
		const playing = opponent.play(game, beginner);
		await vi.advanceTimersByTimeAsync(100);
		game.undo();
		await vi.advanceTimersByTimeAsync(2000);
		await playing;
		expect(game.moves).toHaveLength(0);
	});

	it('scores every move for a weak player, and only the top few for a strong one', async () => {
		const { worker, opponent, game } = setup();
		const reply = async (difficulty: Parameters<Opponent['play']>[1]) => {
			const playing = opponent.play(game, difficulty);
			await vi.advanceTimersByTimeAsync(5000);
			await playing;
			game.undo();
		};
		await reply(beginner);
		await reply(beginner);
		await reply(master);
		expect(worker.sent.filter((c) => c.startsWith('setoption'))).toEqual([
			'setoption name MultiPV value 20',
			'setoption name MultiPV value 6'
		]);
	});

	it('plays the move the human-like choice picks from the scored moves', async () => {
		const { worker, opponent, game } = setup();
		worker.bestMoves = ['g8f6'];
		worker.lines = [
			'info depth 12 multipv 1 score cp 10 nodes 9000 pv c7c5 g1f3',
			'info depth 12 multipv 2 score cp -900 nodes 9000 pv f7f6 d1h5'
		];
		const playing = opponent.play(game, expert);
		await vi.advanceTimersByTimeAsync(5000);
		await playing;
		expect(game.lastMove?.san).toBe('c5');
	});

	it('reports a failure to start', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const opponent = new Opponent(() => Promise.reject(new Error('no engine')));
		expect(await opponent.load()).toBeNull();
		expect(opponent.status).toBe('failed');
	});
});
