import { describe, expect, it } from 'vitest';
import { sideName, squareLabel } from './labels.ts';

describe('labels', () => {
	it('uses skin side names and falls back to White/Black', () => {
		expect(sideName('w', { white: 'Red Crew' })).toBe('Red Crew');
		expect(sideName('b', { white: 'Red Crew' })).toBe('Black');
		expect(sideName('w', {})).toBe('White');
	});

	it('names squares with their piece', () => {
		expect(squareLabel('e4', { color: 'w', type: 'p' }, { white: 'Red Crew' })).toBe(
			'e4, Red Crew pawn'
		);
		expect(squareLabel('e5', null, {})).toBe('e5');
	});
});
