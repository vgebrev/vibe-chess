// Which voice line (if any) a move gets (§4.11). A move is voiced from the side of the player
// who made it; the computer's own moves stay silent, and it answers a player's move with a
// taunt every few moves. Pure apart from the injected clock and random source, so the rules can
// be tested move by move.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { other } from '#lib/game/color.ts';
import type { Result } from '#lib/game/game.svelte.ts';
import type { BoardPiece } from '#lib/game/pieces.ts';
import type { VoiceEvent } from '#lib/skins/schema.ts';

/** A taunt answers one of every this many of the player's quiet moves, chosen at random. */
export const TAUNT_GAP = { min: 3, max: 6 };
/** And never comes sooner than this after the last one, so quick play doesn't bunch them. */
export const TAUNT_FLOOR_MS = 10_000;

/** One line to say: the speaker and what about. */
export interface Line {
	side: Color;
	piece: PieceSymbol;
	event: VoiceEvent;
	/** Where the speaker stands, if on the board (a captured piece has left it). */
	square?: Square;
}

export interface MoveContext {
	/** The result after the move, if it ended the game. */
	result: Result | null;
	/** vs Computer, the player's colour; null in hot-seat, where both sides are players. */
	human: Color | null;
	/** The computer's pieces still on the board, for a taunt. */
	computerPieces: Pick<BoardPiece, 'square' | 'type'>[];
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

	/**
	 * The lines for a move just played, in the order said: none, one, or the player's line and
	 * then the computer's taunt in answer.
	 */
	move(move: Move, { result, human, computerPieces }: MoveContext): Line[] {
		const mover = move.color;
		const opponent = other(mover);
		const king = (event: VoiceEvent): Line => ({
			side: opponent,
			piece: 'k',
			event,
			square: kingSquare(move.after, opponent)
		});

		// 1–2: check and checkmate always speak, from the king concerned.
		if (result?.reason === 'checkmate') return this.#say(king('defeat'));
		if (result) return []; // a draw has no line
		if (move.san.includes('+')) return this.#say(king('check'));

		// 3–4: a player's capture or other move, from the piece that moved (castling is the
		// king's, promotion the pawn's). The captured piece doesn't answer. vs Computer, a quiet
		// move may get a computer piece's taunt after it, so the taunt answers the player.
		if (human === null || mover === human) {
			const event = move.captured ? 'capture' : 'move';
			const own = this.#say({ side: mover, piece: move.piece, event, square: move.to });
			const taunt = human !== null && !move.captured && this.#taunt(opponent, computerPieces);
			return taunt ? [...own, taunt] : own;
		}

		// 5–6: the computer's capture: the player's piece reacts. Its other moves are silent.
		if (move.captured)
			return this.#say({ side: opponent, piece: move.captured, event: 'captured' });
		return [];
	}

	/** A new game: the count to the first taunt starts again. */
	reset() {
		this.#lastTaunt = -Infinity;
		this.#untilTaunt = this.#gap();
	}

	/** A resigning side's king concedes, always (§4.11 rule 1). */
	resign(side: Color, square?: Square): Line[] {
		return this.#say({ side, piece: 'k', event: 'defeat', square });
	}

	/** The line, if the skin has it. */
	#say(line: Line): Line[] {
		return this.#has(line) ? [line] : [];
	}

	/**
	 * Every few quiet moves, a taunt from a computer piece that has one: each kind of piece is as
	 * likely, then one of that kind. A taunt is assumed to play, so it starts the next count. One
	 * that is due but can't be said yet (too soon, or no piece to say it) waits for a later move.
	 */
	#taunt(computer: Color, computerPieces: MoveContext['computerPieces']): Line | null {
		this.#untilTaunt--;
		if (this.#untilTaunt > 0 || this.#now() - this.#lastTaunt < TAUNT_FLOOR_MS) return null;
		const kinds = [...new Set(computerPieces.map((p) => p.type))].filter((piece) =>
			this.#has({ side: computer, piece, event: 'taunt' })
		);
		if (kinds.length === 0) return null;
		const pick = <T>(items: T[]) => items[Math.floor(this.#random() * items.length)];
		const piece = pick(kinds);
		const { square } = pick(computerPieces.filter((p) => p.type === piece));
		this.#lastTaunt = this.#now();
		this.#untilTaunt = this.#gap();
		return { side: computer, piece, event: 'taunt', square };
	}

	/** A random count of quiet moves to the next taunt. */
	#gap(): number {
		const { min, max } = TAUNT_GAP;
		return min + Math.floor(this.#random() * (max - min + 1));
	}
}

/**
 * A variation from a pool, never the one played last when there is a choice. `last` is the
 * index played last for this pool, if any.
 */
export function pickVariation(
	size: number,
	last: number | undefined,
	random: () => number
): number {
	if (size <= 1 || last === undefined) return Math.floor(random() * size);
	const i = Math.floor(random() * (size - 1));
	return i >= last ? i + 1 : i;
}
