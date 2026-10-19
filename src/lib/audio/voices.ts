// Which voice line (if any) a move gets (§4.11). A move is voiced from the side of the player
// who made it; the computer's own moves stay silent, and it answers a player's move with a
// taunt at most every 30 s. Pure apart from the injected clock and random source, so the rules
// can be tested move by move.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { other } from '#lib/game/color.ts';
import type { Result } from '#lib/game/game.svelte.ts';
import type { BoardPiece } from '#lib/game/pieces.ts';
import type { VoiceEvent } from '#lib/skins/schema.ts';

/** At most one taunt in this long. */
export const TAUNT_COOLDOWN_MS = 30_000;

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
	#has: (line: Line) => boolean;
	#now: () => number;
	/** Which taunting piece speaks. */
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
	}

	/**
	 * The lines for a move just played: none or one. Every move that has a line says it, but
	 * taunts are spaced out; a taunt is assumed to play, so it starts that wait.
	 */
	move(move: Move, context: MoveContext): Line[] {
		const lines = this.#pick(move, context);
		if (lines[0]?.event === 'taunt') this.#lastTaunt = this.#now();
		return lines;
	}

	/** A resigning side's king concedes, always (§4.11 rule 1). */
	resign(side: Color, square?: Square): Line[] {
		return this.#say({ side, piece: 'k', event: 'defeat', square });
	}

	/** The line, if the skin has it. */
	#say(line: Line): Line[] {
		return this.#has(line) ? [line] : [];
	}

	#pick(move: Move, { result, human, computerPieces }: MoveContext): Line[] {
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
		// move may get a computer piece's taunt instead, so the taunt answers the player.
		if (human === null || mover === human) {
			if (human !== null && !move.captured) {
				const taunt = this.#taunt(opponent, computerPieces);
				if (taunt) return [taunt];
			}
			const event = move.captured ? 'capture' : 'move';
			return this.#say({ side: mover, piece: move.piece, event, square: move.to });
		}

		// 5–6: the computer's capture: the player's piece reacts. Its other moves are silent.
		if (move.captured)
			return this.#say({ side: opponent, piece: move.captured, event: 'captured' });
		return [];
	}

	/**
	 * At most every 30 s, a taunt from a computer piece that has one: each kind of piece is as
	 * likely, then one of that kind.
	 */
	#taunt(computer: Color, computerPieces: MoveContext['computerPieces']): Line | null {
		if (this.#now() - this.#lastTaunt < TAUNT_COOLDOWN_MS) return null;
		const kinds = [...new Set(computerPieces.map((p) => p.type))].filter((piece) =>
			this.#has({ side: computer, piece, event: 'taunt' })
		);
		if (kinds.length === 0) return null;
		const pick = <T>(items: T[]) => items[Math.floor(this.#random() * items.length)];
		const piece = pick(kinds);
		const { square } = pick(computerPieces.filter((p) => p.type === piece));
		return { side: computer, piece, event: 'taunt', square };
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
