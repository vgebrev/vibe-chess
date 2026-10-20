import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Result } from '#lib/game/game.svelte.ts';
import {
	kingSquare,
	pieceOn,
	Shuffler,
	TAUNT_FLOOR_MS,
	TAUNT_GAP,
	VoiceDirector,
	type Line,
	type MoveContext,
	type Voicing
} from './voices.ts';

const play = (fen: string, san: string) => new Chess(fen).move(san);

/** 1.e4 d5: White can take with exd5. */
const WHITE_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** 1.e4 d5 2.Nc3: Black can take with dxe4. */
const BLACK_TAKES = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2';
const BLACK_QUIET = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
/** White can check with Rh8+, or castle with a quiet move. */
const ROOK = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
/** White castles with check: the rook lands on f1, facing the king on f8. */
const CASTLE_CHECK = '5k2/8/8/8/8/8/8/4K2R w K - 0 1';
/** White's knight on e2 uncovers the rook on e1 (Nc3+), or the bishop on e2 does too (Bb5++). */
const DISCOVERED = '4k3/8/8/8/8/8/4N3/4R1K1 w - - 0 1';
const DOUBLE = '4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1';
/** White promotes on a8, quietly; on the second, with check. */
const PROMOTE = '8/P7/8/8/8/8/8/4k2K w - - 0 1';
const PROMOTE_CHECK = '8/P7/8/8/8/8/8/k6K w - - 0 1';

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
const has = (line: Line) => !line.event.startsWith('taunt') || !['n', 'r'].includes(line.piece);
/** Lines only, no taunt. */
const said = (lines: Line[]): Voicing => ({ lines, taunt: false });
const hotseat: MoveContext = { result: null, human: null, computerPieces: [] };

/** The player's quiet move Nf3 vs Computer, with the computer's pieces of `types` left. */
const quiet = (voices: VoiceDirector, types?: PieceSymbol[]) =>
	voices.move(play(DEFAULT_POSITION, 'Nf3'), vsComputer('w', types));
/** The quiet moves before a taunt `gap` moves away is due, and what each got. */
const beforeTaunt = (voices: VoiceDirector, gap: number = TAUNT_GAP.min) =>
	Array.from({ length: gap - 1 }, () => quiet(voices));

describe('VoiceDirector (§4.11)', () => {
	const knight: Line = { side: 'w', piece: 'n', event: 'move', square: 'f3' };

	it("voices a player's quiet move from the piece that moved", () => {
		expect(director(rolls()).voices.move(play(DEFAULT_POSITION, 'Nf3'), hotseat)).toEqual(
			said([knight])
		);
	});

	it("voices a player's capture from the capturing piece, and never the captured one", () => {
		const capture = said([{ side: 'w', piece: 'p', event: 'capture', square: 'd5' }]);
		expect(director(rolls()).voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual(capture);
		expect(director(rolls()).voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'))).toEqual(
			capture
		);
	});

	it("keeps the computer's capture silent and lets the player's piece react", () => {
		expect(director(rolls()).voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'))).toEqual(
			said([{ side: 'w', piece: 'p', event: 'captured' }])
		);
	});

	it('in hot-seat voices both sides as players', () => {
		expect(director(rolls()).voices.move(play(BLACK_TAKES, 'dxe4'), hotseat)).toEqual(
			said([{ side: 'b', piece: 'p', event: 'capture', square: 'e4' }])
		);
	});

	it("finds a taunt due at one of every few of the player's quiet moves, as judged", () => {
		// The first roll sets the gap: 0 is the shortest.
		const { voices, clock } = director(rolls(0, 0.99, 0.3, 0.99, 0), has);
		for (const voicing of beforeTaunt(voices)) expect(voicing).toEqual(said([knight]));
		expect(quiet(voices)).toEqual({ lines: [knight], taunt: true });
		// The roll picks among the kinds of piece with taunts only (k, q, b, p), so 0.99 is a pawn,
		// and the next roll which pawn.
		const pieces = vsComputer('w').computerPieces;
		expect(voices.taunt('bad', 'b', pieces)).toEqual({
			side: 'b',
			piece: 'p',
			event: 'taunt-bad',
			square: 'c7'
		});
		// 0.99 makes the next gap the longest.
		clock.now = 10 * TAUNT_FLOOR_MS;
		for (const voicing of beforeTaunt(voices, TAUNT_GAP.max)) expect(voicing.taunt).toBe(false);
		expect(quiet(voices, ['k']).taunt).toBe(true);
		expect(voices.taunt('good', 'b', vsComputer('w', ['k']).computerPieces)).toEqual({
			side: 'b',
			piece: 'k',
			event: 'taunt-good',
			square: 'e8'
		});
	});

	it('taunts with an ordinary line when no piece has one for the judgement', () => {
		const { voices } = director(rolls(0), (line) => line.event === 'taunt-neutral');
		for (const voicing of beforeTaunt(voices)) expect(voicing).toEqual(said([]));
		expect(quiet(voices, ['q'])).toEqual({ lines: [], taunt: true });
		expect(voices.taunt('bad', 'b', vsComputer('w', ['q']).computerPieces)).toEqual({
			side: 'b',
			piece: 'q',
			event: 'taunt-neutral',
			square: 'd8'
		});
	});

	it("counts only the player's quiet moves towards a taunt", () => {
		const { voices } = director(rolls(0));
		beforeTaunt(voices);
		voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'));
		voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w'));
		voices.move(play(BLACK_TAKES, 'dxe4'), vsComputer('w'));
		voices.move(play(ROOK, 'Rh8+'), vsComputer('w'));
		voices.move(play(PROMOTE, 'a8=Q'), vsComputer('w'));
		expect(quiet(voices).taunt).toBe(true);
	});

	it('holds a due taunt until the floor has passed, or a piece can say it', () => {
		const { voices, clock } = director(rolls(0, 0, 0, 0), has);
		beforeTaunt(voices);
		expect(quiet(voices).taunt).toBe(true);
		voices.taunt('neutral', 'b', vsComputer('w').computerPieces); // at 0 s
		beforeTaunt(voices);
		// Due again, but too soon after the last.
		clock.now = TAUNT_FLOOR_MS - 1;
		expect(quiet(voices).taunt).toBe(false);
		clock.now = TAUNT_FLOOR_MS;
		// Due, but nothing to taunt with: the player's line, and the taunt still waits.
		expect(quiet(voices, ['n'])).toEqual(said([knight]));
		expect(quiet(voices).taunt).toBe(true);
	});

	it('keeps a due taunt that went unsaid for the next quiet move', () => {
		const { voices } = director(rolls(0));
		beforeTaunt(voices);
		expect(quiet(voices).taunt).toBe(true);
		expect(quiet(voices).taunt).toBe(true);
	});

	it('starts the count to the first taunt again in a new game', () => {
		const { voices } = director(rolls(0, 0, 0, 0));
		beforeTaunt(voices);
		voices.reset();
		expect(quiet(voices).taunt).toBe(false);
	});

	it("never taunts in hot-seat, after a player's capture or on the computer's move", () => {
		const { voices } = director(() => 0);
		beforeTaunt(voices);
		// A taunt is due from here on.
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), vsComputer('w'))).toEqual(said([]));
		expect(voices.move(play(WHITE_TAKES, 'exd5'), vsComputer('w'))).toEqual(
			said([{ side: 'w', piece: 'p', event: 'capture', square: 'd5' }])
		);
		expect(voices.move(play(BLACK_QUIET, 'Nf6'), hotseat)).toEqual(
			said([{ side: 'b', piece: 'n', event: 'move', square: 'f6' }])
		);
		expect(quiet(voices).taunt).toBe(true);
	});

	it('taunts a slow player, at most once per floor, without touching the count', () => {
		const { voices, clock } = director(rolls(0, 0.99, 0), has);
		const pieces = vsComputer('w').computerPieces;
		expect(voices.slow('b', pieces)).toEqual({
			side: 'b',
			piece: 'p',
			event: 'taunt-slow',
			square: 'a7'
		});
		clock.now = TAUNT_FLOOR_MS - 1;
		expect(voices.slow('b', pieces)).toBeNull();
		expect(voices.slow('b', vsComputer('w', ['n', 'r']).computerPieces)).toBeNull();
		beforeTaunt(voices);
		clock.now = TAUNT_FLOOR_MS;
		expect(quiet(voices).taunt).toBe(true);
	});

	describe('check', () => {
		const rookCheck: Line = { side: 'w', piece: 'r', event: 'check', square: 'h8' };
		const checked: Line = { side: 'b', piece: 'k', event: 'checked', square: 'e8' };

		it("is the checking piece's in hot-seat", () => {
			expect(director(() => 0).voices.move(play(ROOK, 'Rh8+'), hotseat)).toEqual(said([rookCheck]));
		});

		it("is the player's checking piece's, answered by the computer's king", () => {
			expect(director(() => 0).voices.move(play(ROOK, 'Rh8+'), vsComputer('w'))).toEqual(
				said([rookCheck, checked])
			);
		});

		it("is the player's king's alone when the computer gives it", () => {
			expect(director(() => 0).voices.move(play(ROOK, 'Rh8+'), vsComputer('b'))).toEqual(
				said([checked])
			);
		});

		it('comes from the piece giving it: the rook when castling, the uncovered one, the moved one in a double check', () => {
			const voices = director(() => 0).voices;
			expect(voices.move(play(CASTLE_CHECK, 'O-O+'), hotseat)).toEqual(
				said([{ side: 'w', piece: 'r', event: 'check', square: 'f1' }])
			);
			expect(voices.move(play(DISCOVERED, 'Nc3+'), hotseat)).toEqual(
				said([{ side: 'w', piece: 'r', event: 'check', square: 'e1' }])
			);
			expect(voices.move(play(DOUBLE, 'Bb5+'), hotseat)).toEqual(
				said([{ side: 'w', piece: 'b', event: 'check', square: 'b5' }])
			);
		});

		it("falls back to the moved piece's line when the checking piece has none", () => {
			const voices = director(
				() => 0,
				(line) => line.event !== 'check'
			).voices;
			expect(voices.move(play(DISCOVERED, 'Nc3+'), vsComputer('w'))).toEqual(
				said([{ side: 'w', piece: 'n', event: 'move', square: 'c3' }, checked])
			);
		});
	});

	describe('promotion', () => {
		it('is the new piece speaking, before a check is answered', () => {
			const voices = director(() => 0).voices;
			const queen: Line = { side: 'w', piece: 'q', event: 'promotion', square: 'a8' };
			expect(voices.move(play(PROMOTE, 'a8=Q'), hotseat)).toEqual(said([queen]));
			expect(voices.move(play(PROMOTE_CHECK, 'a8=Q+'), vsComputer('w'))).toEqual(
				said([queen, { side: 'b', piece: 'k', event: 'checked', square: 'a1' }])
			);
		});

		it("falls back to the new piece's move, as for a knight or rook", () => {
			const voices = director(
				() => 0,
				(line) => line.event !== 'promotion'
			).voices;
			expect(voices.move(play(PROMOTE, 'a8=N'), hotseat)).toEqual(
				said([{ side: 'w', piece: 'n', event: 'move', square: 'a8' }])
			);
		});

		it('is silent from the computer', () => {
			expect(director(() => 0).voices.move(play(PROMOTE, 'a8=Q'), vsComputer('b'))).toEqual(
				said([])
			);
		});
	});

	it('gives checkmate to the losing king, and draws no line', () => {
		const { voices } = director(() => 0);
		const mate: Result = { winner: 'w', reason: 'checkmate' };
		expect(
			voices.move(play('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#'), { ...hotseat, result: mate })
		).toEqual(said([{ side: 'b', piece: 'k', event: 'checkmated', square: 'g8' }]));
		const draw: Result = { winner: 'draw', reason: 'stalemate' };
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), { ...hotseat, result: draw })).toEqual(
			said([])
		);
	});

	it('gives castling to the king', () => {
		expect(director(() => 0).voices.move(play(ROOK, 'O-O'), hotseat)).toEqual(
			said([{ side: 'w', piece: 'k', event: 'move', square: 'g1' }])
		);
	});

	it('voices every move, however quickly they come', () => {
		const { voices } = director(() => 0);
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), hotseat).lines).toHaveLength(1);
		expect(voices.move(play(BLACK_QUIET, 'e5'), hotseat).lines).toHaveLength(1);
	});

	it('says nothing the skin has no lines for', () => {
		const { voices } = director(
			() => 0,
			(line) => line.event === 'captured'
		);
		expect(voices.move(play(WHITE_TAKES, 'exd5'), hotseat)).toEqual(said([]));
		expect(voices.move(play(DEFAULT_POSITION, 'e4'), hotseat)).toEqual(said([]));
	});

	it("has a resigning side's king concede", () => {
		expect(director(() => 0.99).voices.resign('b', 'e8')).toEqual([
			{ side: 'b', piece: 'k', event: 'checkmated', square: 'e8' }
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

describe('Shuffler (§4.11)', () => {
	it("plays all of a pool's variations before any repeats, then reshuffles", () => {
		const shuffler = new Shuffler();
		for (let round = 0; round < 5; round++) {
			const seen = Array.from({ length: 6 }, () => shuffler.next('pool', 6));
			expect(seen.toSorted()).toEqual([0, 1, 2, 3, 4, 5]);
		}
	});

	it('never starts a new round with the one played last', () => {
		// Unshuffled (rolls 0) at first: 0, 1, 2. Then 2, 1, 0, which would repeat the 2, so the
		// 2 goes to the back.
		const shuffler = new Shuffler(rolls(0, 0, 0.99, 0));
		const seen = Array.from({ length: 6 }, () => shuffler.next('pool', 3));
		expect(seen).toEqual([0, 1, 2, 1, 0, 2]);
		expect(Array.from({ length: 3 }, () => shuffler.next('one', 1))).toEqual([0, 0, 0]);
	});

	it('keeps pools apart, and starts them afresh on reset', () => {
		const shuffler = new Shuffler(() => 0);
		expect([shuffler.next('a', 3), shuffler.next('b', 3), shuffler.next('a', 3)]).toEqual([
			0, 0, 1
		]);
		shuffler.reset();
		expect(shuffler.next('a', 3)).toBe(0);
	});
});
