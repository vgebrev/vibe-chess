import { Chess, type Color } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Result } from '#lib/game/game.svelte.ts';
import type { PieceType } from '#lib/skins/schema.ts';
import {
	COOLDOWN_MS,
	pickVariation,
	TAUNT_COOLDOWN_MS,
	VoiceDirector,
	type Line,
	type MoveContext
} from './voices.ts';

const play = (fen: string, san: string) => new Chess(fen).move(san);

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** 1.e4 d5: White can take with exd5. */
const WHITE_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** 1.e4 d5 2.Nc3: Black can take with dxe4. */
const BLACK_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2';
const BLACK_QUIET = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
/** White can check with Rh8+ or castle. */
const ROOK = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';

/** Random numbers from a script, then 0.99 (a miss for every chance). */
const rolls =
	(...values: number[]) =>
	() =>
		values.shift() ?? 0.99;

function director(random: () => number, has: (line: Line) => boolean = () => true) {
	const clock = { now: 0 };
	return { voices: new VoiceDirector(has, () => clock.now, random), clock };
}

const vsComputer = (human: Color, computerPieces: PieceType[] = ['k', 'q', 'b', 'n', 'r', 'p']) =>
	({ result: null, human, computerPieces }) satisfies MoveContext;
const hotseat: MoveContext = { result: null, human: null, computerPieces: [] };

describe('VoiceDirector (§4.11)', () => {
	it("voices a player's quiet move sometimes, from the piece that moved", () => {
		const { voices } = director(rolls(0.3, 0.4));
		expect(voices.move(play(START, 'Nf3'), hotseat)).toEqual([
			{ side: 'w', piece: 'n', event: 'move' }
		]);
		const { voices: other } = director(rolls(0.4));
		expect(other.move(play(START, 'Nf3'), hotseat)).toEqual([]);
	});

	it("follows a player's voiced capture with the captured piece's answer, half the time", () => {
		const capture = { side: 'w', piece: 'p', event: 'capture' };
		const answer = { side: 'b', piece: 'p', event: 'captured' };
		expect(director(rolls(0.1, 0.1)).voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([
			capture,
			answer
		]);
		expect(director(rolls(0.1, 0.6)).voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([
			capture
		]);
		// No capture line, no answer.
		expect(director(rolls(0.9, 0.1)).voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([]);
	});

	it("answers a player's capture from the computer's piece too", () => {
		const { voices } = director(rolls(0.1, 0.1));
		expect(voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'))).toEqual([
			{ side: 'w', piece: 'p', event: 'capture' },
			{ side: 'b', piece: 'p', event: 'captured' }
		]);
	});

	it("keeps the computer's capture silent and lets the player's piece react", () => {
		expect(director(rolls(0.4)).voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'))).toEqual([
			{ side: 'w', piece: 'p', event: 'captured' }
		]);
		expect(director(rolls(0.6)).voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'))).toEqual(
			[]
		);
	});

	it('in hot-seat voices both sides as players', () => {
		const { voices } = director(rolls(0.1, 0.9));
		expect(voices.move(play(BLACK_TAKES, 'dxe4'), hotseat)).toEqual([
			{ side: 'b', piece: 'p', event: 'capture' }
		]);
	});

	it('lets the computer taunt now and then, from a piece that has taunts, at most every 30 s', () => {
		const has = (line: Line) => line.event !== 'taunt' || !['n', 'r'].includes(line.piece);
		const { voices, clock } = director(rolls(0.05, 0.99, 0.05, 0.01, 0.05, 0), has);
		// The roll picks among the pieces with taunts only (k, q, b, p), so 0.99 is the pawn.
		expect(
			voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w', ['n', 'r', 'k', 'q', 'b', 'p']))
		).toEqual([{ side: 'b', piece: 'p', event: 'taunt' }]);
		clock.now = TAUNT_COOLDOWN_MS - 1;
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w'))).toEqual([]);
		clock.now = TAUNT_COOLDOWN_MS;
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w', ['k']))).toEqual([
			{ side: 'b', piece: 'k', event: 'taunt' }
		]);
		// Nothing to taunt with.
		clock.now = 3 * TAUNT_COOLDOWN_MS;
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w', ['n', 'r']))).toEqual([]);
	});

	it('never taunts in hot-seat, and never voices the computer moving', () => {
		const { voices } = director(() => 0); // every chance hits
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w', []))).toEqual([]);
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), hotseat)).toEqual([
			{ side: 'b', piece: 'n', event: 'move' }
		]);
	});

	it('always voices check, from the king in check, even in the cooldown or by the computer', () => {
		const { voices } = director(() => 0);
		voices.move(play(START, 'e4'), hotseat);
		expect(voices.move(play(ROOK, 'Rh8+'), hotseat)).toEqual([
			{ side: 'b', piece: 'k', event: 'check' }
		]);
		expect(voices.move(play(ROOK, 'Rh8+'), vsComputer('b'))).toEqual([
			{ side: 'b', piece: 'k', event: 'check' }
		]);
	});

	it('gives checkmate to the losing king, and draws no line', () => {
		const { voices } = director(() => 0);
		const mate: Result = { winner: 'w', reason: 'checkmate' };
		expect(
			voices.move(play('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#'), { ...hotseat, result: mate })
		).toEqual([{ side: 'b', piece: 'k', event: 'defeat' }]);
		const draw: Result = { winner: 'draw', reason: 'stalemate' };
		expect(voices.move(play(START, 'e4'), { ...hotseat, result: draw })).toEqual([]);
	});

	it('gives castling to the king and promotion to the pawn', () => {
		expect(director(() => 0).voices.move(play(ROOK, 'O-O'), hotseat)).toEqual([
			{ side: 'w', piece: 'k', event: 'move' }
		]);
		expect(
			director(() => 0).voices.move(play('8/P7/8/8/8/8/8/4k2K w - - 0 1', 'a8=Q'), hotseat)
		).toEqual([{ side: 'w', piece: 'p', event: 'move' }]);
	});

	it('keeps ordinary lines quiet within the cooldown of the last line', () => {
		const { voices, clock } = director(() => 0);
		expect(voices.move(play(START, 'e4'), hotseat)).toHaveLength(1);
		clock.now = COOLDOWN_MS - 1;
		expect(voices.move(play(BLACK_QUIET, 'e5'), hotseat)).toEqual([]);
		clock.now = COOLDOWN_MS;
		expect(voices.move(play(BLACK_QUIET, 'e5'), hotseat)).toHaveLength(1);
	});

	it('says nothing the skin has no lines for', () => {
		const { voices } = director(
			() => 0,
			(line) => line.event === 'captured'
		);
		expect(voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([]);
		expect(voices.move(play(START, 'e4'), hotseat)).toEqual([]);
	});

	it("has a resigning side's king concede", () => {
		expect(director(() => 0.99).voices.resign('b')).toEqual([
			{ side: 'b', piece: 'k', event: 'defeat' }
		]);
	});
});

describe('pickVariation', () => {
	it('never repeats the last variation when there is a choice', () => {
		for (const r of [0, 0.3, 0.6, 0.99]) {
			for (let last = 0; last < 3; last++) {
				const i = pickVariation(3, last, () => r);
				expect(i).not.toBe(last);
				expect(i).toBeGreaterThanOrEqual(0);
				expect(i).toBeLessThan(3);
			}
		}
		expect(pickVariation(1, 0, () => 0.5)).toBe(0);
		expect(pickVariation(2, undefined, () => 0.7)).toBe(1);
	});
});
