import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { applyMove, piecesFromFen, type BoardPiece } from './pieces.ts';

describe('piecesFromFen', () => {
	it('gives every piece of the start position a stable id from its starting square', () => {
		const pieces = piecesFromFen();
		expect(pieces).toHaveLength(32);
		expect(new Set(pieces.map((p) => p.id)).size).toBe(32);
		expect(pieces).toContainEqual({ id: 'wk-e1', color: 'w', type: 'k', square: 'e1' });
		expect(pieces).toContainEqual({ id: 'bn-g8', color: 'b', type: 'n', square: 'g8' });
	});

	it('reads any FEN', () => {
		expect(piecesFromFen('8/8/8/4k3/8/8/8/4K2R w K - 0 1').map((p) => p.id)).toEqual([
			'bk-e5',
			'wk-e1',
			'wr-h1'
		]);
	});
});

describe('applyMove', () => {
	/** Play SAN moves from a FEN, reconciling pieces after each, and check against chess.js. */
	function play(fen: string | undefined, ...sans: string[]): BoardPiece[] {
		const chess = new Chess(fen);
		let pieces = piecesFromFen(fen);
		for (const san of sans) pieces = applyMove(pieces, chess.move(san));
		const expected = piecesFromFen(chess.fen()).map(({ color, type, square }) => ({
			color,
			type,
			square
		}));
		const actual = pieces.map(({ color, type, square }) => ({ color, type, square }));
		expect(actual).toEqual(expect.arrayContaining(expected));
		expect(actual).toHaveLength(expected.length);
		return pieces;
	}
	const at = (pieces: BoardPiece[], square: string) => pieces.find((p) => p.square === square);

	it('keeps the id of a quietly moving piece', () => {
		const pieces = play(undefined, 'e4', 'Nf6');
		expect(at(pieces, 'e4')?.id).toBe('wp-e2');
		expect(at(pieces, 'f6')?.id).toBe('bn-g8');
	});

	it('removes the captured piece and keeps the capturer', () => {
		const pieces = play(undefined, 'e4', 'd5', 'exd5');
		expect(at(pieces, 'd5')?.id).toBe('wp-e2');
		expect(pieces.some((p) => p.id === 'bp-d7')).toBe(false);
	});

	it('moves the rook when castling kingside and queenside', () => {
		const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
		const pieces = play(fen, 'O-O', 'O-O-O');
		expect(at(pieces, 'g1')?.id).toBe('wk-e1');
		expect(at(pieces, 'f1')?.id).toBe('wr-h1');
		expect(at(pieces, 'c8')?.id).toBe('bk-e8');
		expect(at(pieces, 'd8')?.id).toBe('br-a8');
	});

	it('removes the pawn captured en passant from its own square', () => {
		const pieces = play(undefined, 'e4', 'a6', 'e5', 'd5', 'exd6');
		expect(at(pieces, 'd6')?.id).toBe('wp-e2');
		expect(pieces.some((p) => p.id === 'bp-d7')).toBe(false);
	});

	it('keeps the id of a promoted pawn with its new type, also when capturing', () => {
		const fen = '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1';
		expect(at(play(fen, 'a8=Q'), 'a8')).toEqual({
			id: 'wp-a7',
			color: 'w',
			type: 'q',
			square: 'a8'
		});
		expect(at(play(fen, 'axb8=N'), 'b8')).toEqual({
			id: 'wp-a7',
			color: 'w',
			type: 'n',
			square: 'b8'
		});
	});
});
