import { describe, expect, it } from 'vitest';
import { outcome } from '#lib/game/outcome.ts';
import {
	capturesLabel,
	outcomeTitle,
	resultText,
	sideName,
	squareLabel,
	statusText
} from './labels.ts';

describe('labels', () => {
	it('uses skin side names and falls back to White/Black', () => {
		expect(sideName('w', { white: 'Blue Crew' })).toBe('Blue Crew');
		expect(sideName('b', { white: 'Blue Crew' })).toBe('Black');
		expect(sideName('w', {})).toBe('White');
	});

	it('names squares with their piece', () => {
		expect(squareLabel('e4', { color: 'w', type: 'p' }, { white: 'Blue Crew' })).toBe(
			'e4, Blue Crew pawn'
		);
		expect(squareLabel('e5', null, {})).toBe('e5');
	});

	it('fills the status templates with side names', () => {
		const pirate = { white: 'Blue Crew', black: 'Red Crew' };
		const status = (turn: 'w' | 'b', inCheck = false) =>
			statusText({ turn, inCheck, result: null }, pirate);
		expect(status('w')).toBe('Blue Crew to move');
		expect(status('b', true)).toBe('Red Crew is in check');
		expect(statusText({ turn: 'w', inCheck: false, result: null }, {})).toBe('White to move');
		expect(statusText({ turn: 'b', inCheck: false, thinking: true, result: null }, pirate)).toBe(
			'Red Crew is thinking…'
		);
		expect(statusText({ turn: 'b', inCheck: true, thinking: true, result: null }, pirate)).toBe(
			'Red Crew is in check'
		);
		expect(
			statusText({ turn: 'b', inCheck: true, result: { winner: 'w', reason: 'checkmate' } }, pirate)
		).toBe('Checkmate — Blue Crew wins');
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
		const labels = { white: 'Blue Crew' };
		expect(capturesLabel('w', ['q', 'p', 'p'], 7, labels)).toBe(
			'Blue Crew captured: queen, 2 pawns. +7'
		);
		expect(capturesLabel('b', [], 0, labels)).toBe('Black captured: nothing');
		expect(capturesLabel('b', ['n'], -2, labels)).toBe('Black captured: knight');
	});

	it("heads the game-over overlay from the player's side, or with the winner in hot-seat", () => {
		const labels = { white: 'Blue Crew' };
		const mate = { winner: 'w', reason: 'checkmate' } as const;
		expect(outcomeTitle(outcome(mate, 'w'), labels)).toBe('Victory!');
		expect(outcomeTitle(outcome(mate, 'b'), labels)).toBe('Defeat');
		expect(outcomeTitle(outcome({ winner: 'w', reason: 'resignation' }, 'b'), labels)).toBe(
			'Defeat'
		);
		expect(outcomeTitle(outcome(mate, null), labels)).toBe('Blue Crew wins!');
		expect(outcomeTitle(outcome({ winner: 'draw', reason: 'stalemate' }, null), labels)).toBe(
			'Draw'
		);
	});
});
