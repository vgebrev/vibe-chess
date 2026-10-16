import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfo, parseSpinOption } from './uci.ts';

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

describe('parseSpinOption', () => {
	it('reads the UCI_Elo range', () => {
		expect(parseSpinOption('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual(
			{ name: 'UCI_Elo', default: 1320, min: 1320, max: 3190 }
		);
	});

	it('handles names with spaces and ignores other option types', () => {
		expect(parseSpinOption('option name Skill Level type spin default 20 min 0 max 20')?.name).toBe(
			'Skill Level'
		);
		expect(parseSpinOption('option name UCI_LimitStrength type check default false')).toBeNull();
	});
});

describe('parseInfo', () => {
	it('reads depth, nodes, speed and time', () => {
		expect(
			parseInfo(
				'info depth 12 seldepth 16 multipv 1 score cp 31 nodes 81234 nps 412345 hashfull 21 tbhits 0 time 197 pv e2e4'
			)
		).toEqual({ depth: 12, nodes: 81234, nps: 412345, time: 197 });
	});

	it('ignores info lines without a depth', () => {
		expect(parseInfo('info string NNUE evaluation using nn.nnue enabled')).toBeNull();
		expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull();
	});
});
