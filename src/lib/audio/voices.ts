// Which voice lines (if any) a move gets (§4.11). A move is voiced from the side of the player
// who made it; the computer's own moves stay silent unless they hurt the player, and it answers a
// player's move with a taunt every few moves, or a player who takes too long. Pure apart from the
// injected clock and random source, so the rules can be tested move by move.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { other } from '#lib/game/color.ts';
import type { Result } from '#lib/game/game.svelte.ts';
import type { BoardPiece } from '#lib/game/pieces.ts';
import type { TauntEvent, VoiceEvent } from '#lib/skins/schema.ts';

/** A taunt answers one of every this many of the player's quiet moves, chosen at random. */
export const TAUNT_GAP = { min: 3, max: 6 };
/** And never comes sooner than this after the last one, so quick play doesn't bunch them. */
export const TAUNT_FLOOR_MS = 10_000;
/** A player still thinking this long into their turn is taunted for it, once a turn. */
export const SLOW_TAUNT_MS = 30_000;

const TAUNTS: TauntEvent[] = ['taunt-good', 'taunt-neutral', 'taunt-bad', 'taunt-slow'];

/** What the computer made of the player's move, which decides how it taunts it. */
export type Judgement = 'good' | 'neutral' | 'bad';

/** One line to say: the speaker and what about. */
export interface Line {
	side: Color;
	piece: PieceSymbol;
	event: VoiceEvent;
	/** Where the speaker stands, if on the board (a captured piece has left it). */
	square?: Square;
}

/** Pieces on the board, by square and type. */
export type Pieces = Pick<BoardPiece, 'square' | 'type'>[];

export interface MoveContext {
	/** The result after the move, if it ended the game. */
	result: Result | null;
	/** vs Computer, the player's colour; null in hot-seat, where both sides are players. */
	human: Color | null;
	/** The computer's pieces still on the board, for a taunt. */
	computerPieces: Pieces;
}

/** A move's lines, in the order said, and whether the computer is to taunt it after them. */
export interface Voicing {
	lines: Line[];
	/** A taunt is due: once the move is judged, `taunt()` gives its line. */
	taunt: boolean;
}

/** The square of a side's king in a FEN. */
export function kingSquare(fen: string, side: Color): Square | undefined {
	return new Chess(fen).findPiece({ type: 'k', color: side })[0];
}

/** The piece on a square in a FEN, as colour and type (`wn`), or '' for none. */
export function pieceOn(fen: string, square: Square): string {
	const piece = new Chess(fen).get(square);
	return piece ? `${piece.color}${piece.type}` : '';
}

export class VoiceDirector {
	#lastTaunt = -Infinity;
	/** The player's quiet moves still to go before a taunt is due. */
	#untilTaunt: number;
	#has: (line: Line) => boolean;
	#now: () => number;
	/** How many moves until the next taunt, and which taunting piece speaks. */
	#random: () => number;

	/** `has`: whether the skin has lines for this speaker and event. */
	constructor(
		has: (line: Line) => boolean,
		now: () => number = () => performance.now(),
		random: () => number = Math.random
	) {
		this.#has = has;
		this.#now = now;
		this.#random = random;
		this.#untilTaunt = this.#gap();
	}

	/** The lines for a move just played, and whether the computer is to taunt it. */
	move(move: Move, { result, human, computerPieces }: MoveContext): Voicing {
		const mover = move.color;
		const opponent = other(mover);
		const voiced = (lines: Line[]): Voicing => ({ lines, taunt: false });
		const king = (event: VoiceEvent): Line[] =>
			this.#say({ side: opponent, piece: 'k', event, square: kingSquare(move.after, opponent) });
		const check = move.san.includes('+');

		// 1: checkmate always speaks, from the losing king. A draw has no line.
		if (result?.reason === 'checkmate') return voiced(king('checkmated'));
		if (result) return voiced([]);

		// 5–6: the computer's moves are silent, unless they check or take a player's piece, which
		// then reacts.
		if (human !== null && mover !== human) {
			if (check) return voiced(king('checked'));
			if (move.captured)
				return voiced(this.#say({ side: opponent, piece: move.captured, event: 'captured' }));
			return voiced([]);
		}

		// 2–4: a player's promotion, check, capture or other move. vs Computer, a check is answered
		// by the king in check, and a quiet move may be taunted once it is judged.
		const lines = this.#own(move, check);
		if (check && human !== null) lines.push(...king('checked'));
		const quiet = !check && !move.captured && !move.promotion;
		return { lines, taunt: human !== null && quiet && this.#due(opponent, computerPieces) };
	}

	/**
	 * The computer's taunt at a move found due, as judged: from a computer piece that has one for
	 * the judgement (an ordinary one if none has), each kind of piece as likely, then one of that
	 * kind. It starts the count to the next. Null if no piece can say one.
	 */
	taunt(judgement: Judgement, computer: Color, pieces: Pieces): Line | null {
		const line =
			this.#taunter(`taunt-${judgement}`, computer, pieces) ??
			this.#taunter('taunt-neutral', computer, pieces);
		if (line) {
			this.#lastTaunt = this.#now();
			this.#untilTaunt = this.#gap();
		}
		return line;
	}

	/**
	 * The computer's taunt at a player still thinking after SLOW_TAUNT_MS, if the last taunt was
	 * long enough ago. It leaves the count to the next taunt as it is.
	 */
	slow(computer: Color, pieces: Pieces): Line | null {
		if (this.#now() - this.#lastTaunt < TAUNT_FLOOR_MS) return null;
		const line = this.#taunter('taunt-slow', computer, pieces);
		if (line) this.#lastTaunt = this.#now();
		return line;
	}

	/** A new game: the count to the first taunt starts again. */
	reset() {
		this.#lastTaunt = -Infinity;
		this.#untilTaunt = this.#gap();
	}

	/** A resigning side's king concedes, always (§4.11 rule 1). */
	resign(side: Color, square?: Square): Line[] {
		return this.#say({ side, piece: 'k', event: 'checkmated', square });
	}

	/** The line, if the skin has it. */
	#say(line: Line): Line[] {
		return this.#has(line) ? [line] : [];
	}

	/**
	 * A player's own line for their move: the promoted piece's `promotion`, else the checking
	 * piece's `check` (the moved one in a double check; the uncovered one in a discovered check, or
	 * the rook when castling gives check), else the moved piece's `capture` or `move` (castling is
	 * the king's move). The first the skin has.
	 */
	#own(move: Move, check: boolean): Line[] {
		const side = move.color;
		if (move.promotion) {
			const line = this.#say({ side, piece: move.promotion, event: 'promotion', square: move.to });
			if (line.length > 0) return line;
		}
		if (check) {
			const after = new Chess(move.after);
			const checkers = after.attackers(kingSquare(move.after, other(side))!, side);
			const square = checkers.includes(move.to) ? move.to : checkers[0];
			const piece = square && after.get(square)?.type;
			const line = piece ? this.#say({ side, piece, event: 'check', square }) : [];
			if (line.length > 0) return line;
		}
		const event = move.captured ? 'capture' : 'move';
		return this.#say({ side, piece: move.promotion ?? move.piece, event, square: move.to });
	}

	/**
	 * Every few quiet moves a taunt is due, if a computer piece can say one. One that is due but
	 * can't be said yet (too soon, or no piece to say it) waits for a later move.
	 */
	#due(computer: Color, pieces: Pieces): boolean {
		this.#untilTaunt--;
		if (this.#untilTaunt > 0 || this.#now() - this.#lastTaunt < TAUNT_FLOOR_MS) return false;
		return pieces.some(({ type: piece }) =>
			TAUNTS.some((event) => this.#has({ side: computer, piece, event }))
		);
	}

	/** A computer piece with a line for `event`: each kind of piece as likely, then one of them. */
	#taunter(event: TauntEvent, computer: Color, pieces: Pieces): Line | null {
		const kinds = [...new Set(pieces.map((p) => p.type))].filter((piece) =>
			this.#has({ side: computer, piece, event })
		);
		if (kinds.length === 0) return null;
		const pick = <T>(items: T[]) => items[Math.floor(this.#random() * items.length)];
		const piece = pick(kinds);
		const { square } = pick(pieces.filter((p) => p.type === piece));
		return { side: computer, piece, event, square };
	}

	/** A random count of quiet moves to the next taunt. */
	#gap(): number {
		const { min, max } = TAUNT_GAP;
		return min + Math.floor(this.#random() * (max - min + 1));
	}
}
