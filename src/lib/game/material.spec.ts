import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { capturedBy, materialBalance } from './material.ts';
import { piecesFromFen } from './pieces.ts';

const movesOf = (fen: string | undefined, ...sans: string[]) => {
	const chess = new Chess(fen);
	return sans.map((san) => chess.move(san));
};

describe('capturedBy', () => {
	it('lists each side’s captures, en passant included', () => {
		const moves = movesOf(
			undefined,
			...['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'e5', 'd5', 'c5', 'dxc6']
		);
		expect(capturedBy(moves)).toEqual({ w: ['p', 'p'], b: ['p'] });
	});

	it('orders captures queen, rook, bishop, knight, pawn', () => {
		const moves = (['p', 'n', 'q', 'b', 'r', 'p'] as const).map((captured) => ({
			color: 'w' as const,
			captured
		}));
		expect(capturedBy(moves).w).toEqual(['q', 'r', 'b', 'n', 'p', 'p']);
	});

	it('shows a captured promoted piece as what it had become', () => {
		expect(capturedBy(movesOf('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'axb8=Q+')).w).toEqual(['n']);
		expect(capturedBy(movesOf('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=Q', 'Rxa8')).b).toEqual([
			'q'
		]);
	});
});

describe('materialBalance', () => {
	it('is zero at the start and counts from White’s side', () => {
		expect(materialBalance(piecesFromFen())).toBe(0);
		expect(materialBalance(piecesFromFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'))).toBe(5);
		expect(materialBalance(piecesFromFen('4k3/8/8/8/8/8/8/n3K3 w - - 0 1'))).toBe(-3);
	});

	it('counts a promotion as a queen gained and a pawn lost', () => {
		const before = materialBalance(piecesFromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
		const after = materialBalance(piecesFromFen('Q3k3/8/8/8/8/8/8/4K3 b - - 0 1'));
		expect(after - before).toBe(8);
	});
});
