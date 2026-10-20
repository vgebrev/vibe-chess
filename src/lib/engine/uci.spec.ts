import { describe, expect, it } from 'vitest';
import { MATE, parseBestMove, parseInfo } from './uci.ts';

describe('parseBestMove', () => {
	it('reads the move, ignoring the ponder move', () => {
		expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ from: 'e2', to: 'e4' });
		expect(parseBestMove('bestmove g1f3')).toEqual({ from: 'g1', to: 'f3' });
	});

	it('reads a promotion suffix', () => {
		expect(parseBestMove('bestmove e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
		expect(parseBestMove('bestmove b2a1n ponder h7h6')).toEqual({
			from: 'b2',
			to: 'a1',
			promotion: 'n'
		});
	});

	it('is null when there is no move', () => {
		expect(parseBestMove('bestmove (none)')).toBeNull();
		expect(parseBestMove('info depth 1')).toBeNull();
	});
});

describe('parseInfo', () => {
	it('reads depth and speed', () => {
		expect(
			parseInfo(
				'info depth 12 seldepth 16 multipv 1 score cp 31 nodes 81234 nps 412345 hashfull 21 tbhits 0 time 197 pv e2e4'
			)
		).toEqual({ depth: 12, nps: 412345, score: 31, pv: ['e2e4'] });
	});

	it('reads the score for the side to move, a mate as worth more than any material', () => {
		const score = (text: string) => parseInfo(`info depth 9 ${text} pv g1f3 g8f6`)?.score;
		expect(score('score cp -45')).toBe(-45);
		expect(score('score mate 3')).toBe(MATE - 3);
		expect(score('score mate -2')).toBe(-MATE + 2);
		expect(score('score mate 0')).toBe(-MATE);
		expect(score('score cp 31 lowerbound')).toBeUndefined();
		expect(score('score cp 31 upperbound')).toBeUndefined();
		expect(parseInfo('info depth 9 score cp 12 pv g1f3 g8f6')?.pv).toEqual(['g1f3', 'g8f6']);
	});

	it("ignores a multi-line search's alternatives", () => {
		expect(parseInfo('info depth 9 multipv 2 score cp 12 pv d2d4')).toBeNull();
	});

	it('ignores info lines without a depth and score', () => {
		expect(parseInfo('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull();
		expect(parseInfo('info string NNUE evaluation using nn.nnue enabled')).toBeNull();
		expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull();
	});
});
