import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { moveRows, numberedMove } from './notation.ts';

const BLACK_TO_MOVE = '4k3/8/8/8/8/8/8/4K3 b - - 3 17';

describe('moveRows', () => {
	it('pairs moves under their numbers', () => {
		expect(moveRows(DEFAULT_POSITION, [])).toEqual([]);
		expect(moveRows(DEFAULT_POSITION, ['e4', 'e5', 'Nf3'])).toEqual([
			{ number: 1, white: 'e4', black: 'e5' },
			{ number: 2, white: 'Nf3', black: null }
		]);
	});

	it('leaves White’s first slot empty when Black moved first', () => {
		expect(moveRows(BLACK_TO_MOVE, ['Kd7', 'Kd2'])).toEqual([
			{ number: 17, white: null, black: 'Kd7' },
			{ number: 18, white: 'Kd2', black: null }
		]);
	});
});

describe('numberedMove', () => {
	it('numbers White moves with a dot and Black moves with an ellipsis', () => {
		expect(numberedMove(DEFAULT_POSITION, 0, 'e4')).toBe('1. e4');
		expect(numberedMove(DEFAULT_POSITION, 3, 'Nc6')).toBe('2… Nc6');
		expect(numberedMove(BLACK_TO_MOVE, 0, 'Kd7')).toBe('17… Kd7');
		expect(numberedMove(BLACK_TO_MOVE, 1, 'Kd2')).toBe('18. Kd2');
	});
});
