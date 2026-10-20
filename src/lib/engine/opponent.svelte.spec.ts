import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '#lib/game/game.svelte.ts';
import { Engine } from './engine.ts';
import { FakeWorker } from '#lib/testing/fakeWorker.ts';
import { Opponent } from './opponent.svelte.ts';

const beginner = { kind: 'preset', id: 'p0' } as const;
const custom = { kind: 'custom', elo: 2500 } as const;

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
		expect(worker.sent).toContain('setoption name Skill Level value 0');
		expect(game.moves).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		await playing;
		expect(game.lastMove?.san).toBe('e5');
		expect(opponent.status).toBe('idle');
	});

	it('holds the reply until told, such as when a taunt ends', async () => {
		const worker = new FakeWorker();
		worker.instant = true;
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		const opponent = new Opponent(
			() => Engine.start(worker),
			() => held
		);
		const game = new Game();
		game.move({ from: 'e2', to: 'e4' });
		const playing = opponent.play(game, beginner);
		await vi.advanceTimersByTimeAsync(5000);
		expect(game.moves).toHaveLength(1);
		expect(opponent.status).toBe('thinking');
		release();
		await playing;
		expect(game.lastMove?.san).toBe('e5');
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

	it('sets a Skill Level for a preset and a limited Elo for custom, only when they change', async () => {
		const { worker, opponent, game } = setup();
		const reply = async (difficulty: Parameters<Opponent['play']>[1]) => {
			const playing = opponent.play(game, difficulty);
			await vi.advanceTimersByTimeAsync(5000);
			await playing;
			game.undo();
		};
		await reply(beginner);
		await reply(beginner);
		await reply(custom);
		await reply(beginner);
		expect(worker.sent.filter((c) => c.startsWith('setoption'))).toEqual([
			'setoption name UCI_LimitStrength value false',
			'setoption name Skill Level value 0',
			'setoption name UCI_LimitStrength value true',
			'setoption name UCI_Elo value 2500',
			'setoption name UCI_LimitStrength value false'
		]);
	});

	it("judges the player's move by what it expected and its search for a reply (§4.11)", async () => {
		const { worker, opponent, game } = setup();
		const reply = async () => {
			const playing = opponent.play(game, beginner);
			await vi.advanceTimersByTimeAsync(5000);
			await playing;
		};
		// It answers 1.e4 with e5 as it found best, expecting Nf3 at +20 for itself.
		worker.infos.push({ score: 20, pv: ['e7e5', 'g1f3'] });
		await reply();
		game.move({ from: 'g1', to: 'f3' });
		const good = opponent.judge(game.lastMove!);
		worker.infos.push({ score: 15, pv: ['g8f6', 'b1c3'] }, { score: 400, pv: ['f6e4'] });
		await reply(); // Nf6, best, expecting Nc3
		expect(await good).toBe('good');
		game.move({ from: 'f1', to: 'c4' }); // which hangs e4
		const bad = opponent.judge(game.lastMove!);
		await reply();
		expect(await bad).toBe('bad');
		// Without a reply of its own just before, it can't tell.
		game.undo();
		expect(await opponent.judge(game.lastMove!)).toBe('neutral');
	});

	it('reports a failure to start', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const opponent = new Opponent(() => Promise.reject(new Error('no engine')));
		expect(await opponent.load()).toBeNull();
		expect(opponent.status).toBe('failed');
	});
});
