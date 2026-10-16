import { describe, expect, it } from 'vitest';
import { Game } from './game.svelte.ts';

describe('Game', () => {
	it('lists one target per square, flagging promotions and captures', () => {
		const game = new Game('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		expect(game.targets('a7')).toEqual([
			{ square: 'a8', capture: false, promotion: true },
			{ square: 'b8', capture: true, promotion: true }
		]);
	});

	it('rejects an illegal move without changing anything', () => {
		const game = new Game();
		const fen = game.fen;
		expect(game.move({ from: 'e2', to: 'e5' })).toBeNull();
		expect(game.fen).toBe(fen);
		expect(game.lastMove).toBeNull();
	});

	it('plays a move and updates the render pieces, turn and last move', () => {
		const game = new Game();
		expect(game.move({ from: 'g1', to: 'f3' })?.san).toBe('Nf3');
		expect(game.turn).toBe('b');
		expect(game.lastMove?.to).toBe('f3');
		expect(game.pieces.find((p) => p.id === 'wn-g1')?.square).toBe('f3');
	});

	it('reports check and checkmate', () => {
		const game = new Game();
		for (const [from, to] of [
			['f2', 'f3'],
			['e7', 'e5'],
			['g2', 'g4'],
			['d8', 'h4']
		] as const) {
			game.move({ from, to });
		}
		expect(game.checkSquare).toBe('e1');
		expect(game.isGameOver).toBe(true);
	});
});
