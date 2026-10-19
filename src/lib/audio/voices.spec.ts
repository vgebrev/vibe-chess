import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Result } from '#lib/game/game.svelte.ts';
import {
	kingSquare,
	pieceOn,
	pickVariation,
	TAUNT_FLOOR_MS,
	TAUNT_GAP,
	VoiceDirector,
	type Line,
	type MoveContext
} from './voices.ts';

const play = (fen: string, san: string) => new Chess(fen).move(san);

/** 1.e4 d5: White can take with exd5. */
const WHITE_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** 1.e4 d5 2.Nc3: Black can take with dxe4. */
const BLACK_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2';
const BLACK_QUIET = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
/** White can check with Rh8+ or castle. */
const ROOK = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';

/** Random numbers from a script (taunt gaps, and which taunting piece speaks), then 0.99. */
const rolls =
	(...values: number[]) =>
	() =>
		values.shift() ?? 0.99;

function director(random: () => number, has: (line: Line) => boolean = () => true) {
	const clock = { now: 0 };
	return { voices: new VoiceDirector(has, () => clock.now, random), clock };
}

/** Black's pieces after 1.e4, by type. */
const BLACK: Record<PieceSymbol, Square[]> = {
	k: ['e8'],
	q: ['d8'],
	b: ['c8', 'f8'],
	n: ['b8', 'g8'],
	r: ['a8', 'h8'],
	p: ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7']
};
const vsComputer = (human: Color, types: PieceSymbol[] = ['k', 'q', 'b', 'n', 'r', 'p']) =>
	({
		result: null,
		human,
		computerPieces: types.flatMap((type) => BLACK[type].map((square) => ({ square, type })))
	}) satisfies MoveContext;
/** As in Pirate: knights and rooks have no taunts. */
const has = (line: Line) => line.event !== 'taunt' || !['n', 'r'].includes(line.piece);
const hotseat: MoveContext = { result: null, human: null, computerPieces: [] };

/** The player's quiet move Nf3 vs Computer, with the computer's pieces of `types` left. */
const quiet = (voices: VoiceDirector, types?: PieceSymbol[]) =>
	voices.move(play(DEFAULT_POSITION, 'Nf3'), vsComputer('w', types));
/** The quiet moves before a taunt `gap` moves away is due, and the lines each got. */
const beforeTaunt = (voices: VoiceDirector, gap: number = TAUNT_GAP.min) =>
	Array.from({ length: gap - 1 }, () => quiet(voices));

describe('VoiceDirector (§4.11)', () => {
	it("voices a player's quiet move from the piece that moved", () => {
		expect(director(rolls()).voices.move(play(DEFAULT_POSITION, 'Nf3'), hotseat)).toEqual([
			{ side: 'w', piece: 'n', event: 'move', square: 'f3' }
		]);
	});

	it("voices a player's capture from the capturing piece, and never the captured one", () => {
		const capture = { side: 'w', piece: 'p', event: 'capture', square: 'd5' };
		expect(director(rolls()).voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([capture]);
		expect(director(rolls()).voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'))).toEqual([
			capture
		]);
	});

	it("keeps the computer's capture silent and lets the player's piece react", () => {
		expect(director(rolls()).voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'))).toEqual([
			{ side: 'w', piece: 'p', event: 'captured' }
		]);
	});

	it('in hot-seat voices both sides as players', () => {
		expect(director(rolls()).voices.move(play(BLACK_TAKES, 'dxe4'), hotseat)).toEqual([
			{ side: 'b', piece: 'p', event: 'capture', square: 'e4' }
		]);
	});

	it("answers one of every few of the player's quiet moves with a taunt, after its line", () => {
		// The first roll sets the gap: 0 is the shortest.
		const { voices, clock } = director(rolls(0, 0.99, 0.3, 0.99, 0), has);
		const knight = { side: 'w', piece: 'n', event: 'move', square: 'f3' };
		for (const lines of beforeTaunt(voices)) expect(lines).toEqual([knight]);
		// The roll picks among the kinds of piece with taunts only (k, q, b, p), so 0.99 is a pawn,
		// and the next roll which pawn.
		expect(quiet(voices, ['n', 'r', 'k', 'q', 'b', 'p'])).toEqual([
			knight,
			{ side: 'b', piece: 'p', event: 'taunt', square: 'c7' }
		]);
		// 0.99 makes the next gap the longest.
		clock.now = 10 * TAUNT_FLOOR_MS;
		for (const lines of beforeTaunt(voices, TAUNT_GAP.max)) expect(lines).toEqual([knight]);
		expect(quiet(voices, ['k'])).toEqual([
			knight,
			{ side: 'b', piece: 'k', event: 'taunt', square: 'e8' }
		]);
	});

	it('taunts alone when the moved piece has no line', () => {
		const { voices } = director(rolls(0), (line) => line.event === 'taunt');
		for (const lines of beforeTaunt(voices)) expect(lines).toEqual([]);
		expect(quiet(voices, ['q'])).toEqual([{ side: 'b', piece: 'q', event: 'taunt', square: 'd8' }]);
	});

	it("counts only the player's quiet moves towards a taunt", () => {
		const { voices } = director(rolls(0));
		beforeTaunt(voices);
		voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'));
		voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w'));
		voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'));
		expect(quiet(voices)).toHaveLength(2);
	});

	it('holds a due taunt until the floor has passed, or a piece can say it', () => {
		const { voices, clock } = director(rolls(0, 0, 0, 0), has);
		beforeTaunt(voices);
		expect(quiet(voices)).toHaveLength(2); // the first taunt, at 0 s
		beforeTaunt(voices);
		// Due again, but too soon after the last.
		clock.now = TAUNT_FLOOR_MS - 1;
		expect(quiet(voices)).toHaveLength(1);
		clock.now = TAUNT_FLOOR_MS;
		// Due, but nothing to taunt with: the player's line, and the taunt still waits.
		expect(quiet(voices, ['n'])).toEqual([{ side: 'w', piece: 'n', event: 'move', square: 'f3' }]);
		expect(quiet(voices)).toHaveLength(2);
	});

	it('starts the count to the first taunt again in a new game', () => {
		const { voices } = director(rolls(0, 0, 0, 0));
		beforeTaunt(voices);
		voices.reset();
		expect(quiet(voices)).toHaveLength(1);
	});

	it("never taunts in hot-seat, after a player's capture or on the computer's move", () => {
		const { voices } = director(() => 0);
		beforeTaunt(voices);
		// A taunt is due from here on.
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w'))).toEqual([]);
		expect(voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'))).toEqual([
			{ side: 'w', piece: 'p', event: 'capture', square: 'd5' }
		]);
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), hotseat)).toEqual([
			{ side: 'b', piece: 'n', event: 'move', square: 'f6' }
		]);
		expect(quiet(voices)).toHaveLength(2);
	});

	it('always voices check, from the king in check, even by the computer', () => {
		const { voices } = director(() => 0);
		voices.move(play(DEFAULT_POSITION, 'e4'), hotseat);
		expect(voices.move(play(ROOK, 'Rh8+'), hotseat)).toEqual([
			{ side: 'b', piece: 'k', event: 'check', square: 'e8' }
		]);
		expect(voices.move(play(ROOK, 'Rh8+'), vsComputer('b'))).toEqual([
			{ side: 'b', piece: 'k', event: 'check', square: 'e8' }
		]);
	});

	it('gives checkmate to the losing king, and draws no line', () => {
		const { voices } = director(() => 0);
		const mate: Result = { winner: 'w', reason: 'checkmate' };
		expect(
			voices.move(play('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#'), { ...hotseat, result: mate })
		).toEqual([{ side: 'b', piece: 'k', event: 'defeat', square: 'g8' }]);
		const draw: Result = { winner: 'draw', reason: 'stalemate' };
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), { ...hotseat, result: draw })).toEqual([]);
	});

	it('gives castling to the king and promotion to the pawn', () => {
		expect(director(() => 0).voices.move(play(ROOK, 'O-O'), hotseat)).toEqual([
			{ side: 'w', piece: 'k', event: 'move', square: 'g1' }
		]);
		expect(
			director(() => 0).voices.move(play('8/P7/8/8/8/8/8/4k2K w - - 0 1', 'a8=Q'), hotseat)
		).toEqual([{ side: 'w', piece: 'p', event: 'move', square: 'a8' }]);
	});

	it('voices every move, however quickly they come', () => {
		const { voices } = director(() => 0);
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), hotseat)).toHaveLength(1);
		expect(voices.move(play(BLACK_QUIET, 'e5'), hotseat)).toHaveLength(1);
	});

	it('says nothing the skin has no lines for', () => {
		const { voices } = director(
			() => 0,
			(line) => line.event === 'captured'
		);
		expect(voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual([]);
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), hotseat)).toEqual([]);
	});

	it("has a resigning side's king concede", () => {
		expect(director(() => 0.99).voices.resign('b', 'e8')).toEqual([
			{ side: 'b', piece: 'k', event: 'defeat', square: 'e8' }
		]);
	});
});

describe('kingSquare', () => {
	it("finds a side's king in a FEN", () => {
		expect(kingSquare(DEFAULT_POSITION, 'w')).toBe('e1');
		expect(kingSquare(DEFAULT_POSITION, 'b')).toBe('e8');
		expect(kingSquare('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'b')).toBe('g8');
	});

	it('reads the piece on a square, or none', () => {
		expect(pieceOn(DEFAULT_POSITION, 'd8')).toBe('bq');
		expect(pieceOn(DEFAULT_POSITION, 'g1')).toBe('wn');
		expect(pieceOn(DEFAULT_POSITION, 'e4')).toBe('');
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
