import { describe, expect, it } from 'vitest';
import type { ResultImages } from '#lib/skins/schema.ts';
import { outcome, resultImage } from './outcome.ts';

const both = (name: string) => ({ w: `${name}-w`, b: `${name}-b` });
const ALL: ResultImages = {
	win: both('win'),
	loss: both('loss'),
	resign: both('resign'),
	draw: 'draw',
	stalemate: 'stalemate'
};

describe('outcome', () => {
	it("is the player's win or loss vs the computer, and always a win in hot-seat", () => {
		const mate = { winner: 'b', reason: 'checkmate' } as const;
		expect(outcome(mate, 'b')).toEqual({ kind: 'win', winner: 'b', human: 'b' });
		expect(outcome(mate, 'w')).toEqual({ kind: 'loss', winner: 'b', human: 'w' });
		expect(outcome(mate, null)).toEqual({ kind: 'win', winner: 'b', human: null });
	});

	it('tells resignation, stalemate and other draws apart', () => {
		expect(outcome({ winner: 'w', reason: 'resignation' }, 'b').kind).toBe('resign');
		expect(outcome({ winner: 'draw', reason: 'stalemate' }, 'w').kind).toBe('stalemate');
		expect(outcome({ winner: 'draw', reason: 'repetition' }, null)).toEqual({
			kind: 'draw',
			winner: null,
			human: null
		});
	});
});

describe('resultImage', () => {
	it("picks the picture in the winner's colours", () => {
		expect(resultImage(ALL, outcome({ winner: 'w', reason: 'checkmate' }, 'w'))).toBe('win-w');
		expect(resultImage(ALL, outcome({ winner: 'b', reason: 'checkmate' }, 'w'))).toBe('loss-b');
		expect(resultImage(ALL, outcome({ winner: 'b', reason: 'resignation' }, 'w'))).toBe('resign-b');
		expect(resultImage(ALL, outcome({ winner: 'draw', reason: 'stalemate' }, 'w'))).toBe(
			'stalemate'
		);
		expect(resultImage(ALL, outcome({ winner: 'draw', reason: 'fifty-move' }, 'w'))).toBe('draw');
	});

	it('falls back: stalemate to draw, resignation to loss (vs computer) or win (hot-seat)', () => {
		const some: ResultImages = { ...ALL, resign: null, stalemate: null };
		expect(resultImage(some, outcome({ winner: 'draw', reason: 'stalemate' }, 'w'))).toBe('draw');
		expect(resultImage(some, outcome({ winner: 'b', reason: 'resignation' }, 'w'))).toBe('loss-b');
		expect(resultImage(some, outcome({ winner: 'b', reason: 'resignation' }, null))).toBe('win-b');
	});

	it('is null without the picture', () => {
		const mate = outcome({ winner: 'w', reason: 'checkmate' }, 'w');
		expect(resultImage(null, mate)).toBeNull();
		expect(resultImage({ ...ALL, win: null }, mate)).toBeNull();
		expect(
			resultImage(
				{ ...ALL, draw: null, stalemate: null },
				outcome({ winner: 'draw', reason: 'stalemate' }, 'w')
			)
		).toBeNull();
	});
});
