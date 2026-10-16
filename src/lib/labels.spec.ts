import { describe, expect, it } from 'vitest';
import { capturesLabel, resultText, sideName, squareLabel, statusText } from './labels.ts';

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

	it('fills the status templates with side names', () => {
		const pirate = { white: 'Red Crew', black: 'Blue Crew' };
		const status = (turn: 'w' | 'b', inCheck = false) =>
			statusText({ turn, inCheck, result: null }, pirate);
		expect(status('w')).toBe('Red Crew to move');
		expect(status('b', true)).toBe('Blue Crew is in check');
		expect(statusText({ turn: 'w', inCheck: false, result: null }, {})).toBe('White to move');
		expect(statusText({ turn: 'b', inCheck: false, thinking: true, result: null }, pirate)).toBe(
			'Blue Crew is thinking…'
		);
		expect(statusText({ turn: 'b', inCheck: true, thinking: true, result: null }, pirate)).toBe(
			'Blue Crew is in check'
		);
		expect(
			statusText({ turn: 'b', inCheck: true, result: { winner: 'w', reason: 'checkmate' } }, pirate)
		).toBe('Checkmate — Red Crew wins');
	});

	it('describes every result', () => {
		expect(resultText({ winner: 'b', reason: 'resignation' }, {})).toBe(
			'White resigns — Black wins'
		);
		expect(resultText({ winner: 'draw', reason: 'stalemate' }, {})).toBe('Stalemate — draw');
		expect(resultText({ winner: 'draw', reason: 'repetition' }, {})).toBe(
			'Threefold repetition — draw'
		);
		expect(resultText({ winner: 'draw', reason: 'fifty-move' }, {})).toBe('50-move rule — draw');
		expect(resultText({ winner: 'draw', reason: 'insufficient-material' }, {})).toBe(
			'Insufficient material — draw'
		);
	});

	it('describes a player strip in words', () => {
		const labels = { white: 'Red Crew' };
		expect(capturesLabel('w', ['q', 'p', 'p'], 7, labels)).toBe(
			'Red Crew captured: queen, 2 pawns. +7'
		);
		expect(capturesLabel('b', [], 0, labels)).toBe('Black captured: nothing');
		expect(capturesLabel('b', ['n'], -2, labels)).toBe('Black captured: knight');
	});
});
