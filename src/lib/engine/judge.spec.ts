import { describe, expect, it } from 'vitest';
import { BAD_MOVE_CP, judge } from './judge.ts';
import { MATE } from './uci.ts';

describe('judge (§4.11)', () => {
	const expected = { score: 30, reply: 'g1f3' };

	it('finds a move bad when it hands the computer much more than it expected', () => {
		expect(judge(expected, 'a2a3', 30 + BAD_MOVE_CP)).toBe('bad');
		expect(judge(expected, 'a2a3', 30 + BAD_MOVE_CP - 1)).toBe('neutral');
		expect(judge({ score: -MATE + 3 }, 'a2a3', 0)).toBe('bad'); // a mate let slip
	});

	it('finds the reply the computer expected good, and anything else neutral', () => {
		expect(judge(expected, 'g1f3', 20)).toBe('good');
		expect(judge(expected, 'b1c3', 20)).toBe('neutral');
		expect(judge({ score: 30 }, 'g1f3', 20)).toBe('neutral');
	});
});
