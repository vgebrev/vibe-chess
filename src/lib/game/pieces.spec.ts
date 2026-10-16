import { describe, expect, it } from 'vitest';
import { piecesFromFen } from './pieces.ts';

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
