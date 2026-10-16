import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Difficulty } from './difficulty.ts';
import { complexity, seeded, thinkTime, type ThinkInput } from './thinkTime.ts';

const firstMate: Difficulty = { kind: 'preset', id: 'p3' }; // personality 1
const budgets = (input: ThinkInput, difficulty: Difficulty = firstMate, n = 200) => {
	const random = seeded(42);
	return Array.from({ length: n }, () => thinkTime(input, difficulty, random));
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

// Middlegame positions, past the opening plies.
const SHARP = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p1N1/2B1P3/2NP4/PPP2PPP/R1BQK2R w KQ - 0 7';
const QUIET_ENDGAME = '8/5k2/8/3p4/3P4/8/5K2/8 w - - 0 40';

describe('thinkTime', () => {
	it('answers a forced move quickly', () => {
		// The king has one square.
		for (const t of budgets({ fen: '7k/8/8/8/8/8/5q2/7K w - - 0 40' })) {
			expect(t).toBeGreaterThanOrEqual(500);
			expect(t).toBeLessThanOrEqual(600);
		}
	});

	it('plays the opening at book-like speed', () => {
		for (const t of budgets({ fen: new Chess().fen() })) {
			expect(t).toBeGreaterThanOrEqual(500);
			expect(t).toBeLessThanOrEqual(900);
		}
	});

	it('takes longer over a sharp middlegame than a quiet endgame', () => {
		expect(median(budgets({ fen: SHARP }))).toBeGreaterThan(
			median(budgets({ fen: QUIET_ENDGAME })) * 1.5
		);
	});

	it('halves the complexity of an obvious recapture', () => {
		// White's bishop just took on c6; Black can take back.
		const fen = 'r1bqkbnr/pppp1ppp/2B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4';
		const chess = new Chess(fen);
		const recapture = { to: 'c6', captured: 'n' } as const;
		expect(complexity(chess, recapture)).toBeCloseTo(complexity(chess) / 2);
		expect(complexity(chess, { to: 'c6' })).toBe(complexity(chess));
	});

	it('gives stronger opponents a longer median budget', () => {
		const cabinBoy = median(budgets({ fen: SHARP }, { kind: 'preset', id: 'p0' }));
		const captain = median(budgets({ fen: SHARP }, { kind: 'preset', id: 'p4' }));
		const low = median(budgets({ fen: SHARP }, { kind: 'custom', elo: 1350 }));
		const high = median(budgets({ fen: SHARP }, { kind: 'custom', elo: 3150 }));
		expect(captain).toBeGreaterThan(cabinBoy);
		expect(high).toBeGreaterThan(low);
	});

	it('always stays within 500–4500 ms', () => {
		const fens = [SHARP, QUIET_ENDGAME, new Chess().fen(), '7k/8/8/8/8/8/5q2/7K w - - 0 40'];
		const levels: Difficulty[] = [
			{ kind: 'preset', id: 'p0' },
			{ kind: 'preset', id: 'p4' },
			{ kind: 'custom', elo: 3150 }
		];
		for (const fen of fens) {
			for (const level of levels) {
				for (const t of budgets({ fen }, level, 100)) {
					expect(t).toBeGreaterThanOrEqual(500);
					expect(t).toBeLessThanOrEqual(4500);
				}
			}
		}
	});
});
