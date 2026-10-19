import { Chess, DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { moveSfx } from './sfx.ts';

const play = (fen: string, san: string) => new Chess(fen).move(san);

describe('moveSfx (§4.11)', () => {
	it('picks the most important sound that applies', () => {
		expect(moveSfx(play(DEFAULT_POSITION, 'e4'), null)).toBe('move');
		const takes = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
		expect(moveSfx(play(takes, 'exd5'), null)).toBe('capture');
		const enPassant = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
		expect(moveSfx(play(enPassant, 'exf6'), null)).toBe('capture');
		expect(moveSfx(play('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'O-O'), null)).toBe('castle');
		expect(moveSfx(play('8/P7/8/8/8/8/8/4k2K w - - 0 1', 'a8=Q'), null)).toBe('promotion');
		// A promotion that gives check is heard as the check.
		expect(moveSfx(play('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a8=Q+'), null)).toBe('check');
		expect(moveSfx(play('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'Rh8+'), null)).toBe('check');
		const mate = play('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#');
		expect(moveSfx(mate, { winner: 'w', reason: 'checkmate' })).toBe('checkmate');
		expect(moveSfx(play(DEFAULT_POSITION, 'e4'), { winner: 'draw', reason: 'repetition' })).toBe(
			'draw'
		);
	});
});
