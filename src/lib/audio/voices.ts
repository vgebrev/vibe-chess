// Which voice line (if any) a move gets (§4.11). A move is voiced from the side of the player
// who made it; check and checkmate always speak; the computer's own moves stay silent except
// for an occasional taunt. Pure apart from the injected clock and random source, so the rules
// can be tested move by move.
import type { Color, Move } from 'chess.js';
import type { Result } from '#lib/game/game.svelte.ts';
import type { PieceType, VoiceEvent } from '#lib/skins/schema.ts';

/** A player's quiet move is voiced this often. */
export const P_MOVE = 0.35;
/** A player's capture is voiced this often. */
export const P_CAPTURE = 0.8;
/** After a voiced capture, the captured piece answers this often (so 0.5 × P_CAPTURE overall). */
export const P_ANSWER = 0.5;
/** When the computer captures, the player's piece reacts this often. */
export const P_REACTION = 0.5;
/** Per computer move, a chance of a taunt. */
export const P_TAUNT = 0.07;
/** Ordinary lines (rules 3–6) stay silent this long after the last line started. */
export const COOLDOWN_MS = 3000;
/** At most one taunt in this long. */
export const TAUNT_COOLDOWN_MS = 30_000;

/** One line to say: the speaker and what about. */
export interface Line {
	side: Color;
	piece: PieceType;
	event: VoiceEvent;
}

export interface MoveContext {
	/** The result after the move, if it ended the game. */
	result: Result | null;
	/** vs Computer, the player's colour; null in hot-seat, where both sides are players. */
	human: Color | null;
	/** The computer's piece types still on the board, for a taunt. */
	computerPieces: PieceType[];
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export class VoiceDirector {
	#lastLine = -Infinity;
	#lastTaunt = -Infinity;
	readonly has: (line: Line) => boolean;
	readonly now: () => number;
	readonly random: () => number;

	/** `has`: whether the skin has lines for this speaker and event. */
	constructor(
		has: (line: Line) => boolean,
		now: () => number = () => performance.now(),
		random: () => number = Math.random
	) {
		this.has = has;
		this.now = now;
		this.random = random;
	}

	/**
	 * The lines for a move just played, in order: none, one, or a capture and its answer.
	 * Assumes they will be played, so they start the cooldowns.
	 */
	move(move: Move, { result, human, computerPieces }: MoveContext): Line[] {
		const mover = move.color;
		const lines = this.#pick(move, result, mover, human, computerPieces);
		if (lines.length > 0) this.#lastLine = this.now();
		if (lines[0]?.event === 'taunt') this.#lastTaunt = this.now();
		return lines;
	}

	/** A resigning side's king concedes, always (§4.11 rule 1). */
	resign(side: Color): Line[] {
		const line: Line = { side, piece: 'k', event: 'defeat' };
		if (!this.has(line)) return [];
		this.#lastLine = this.now();
		return [line];
	}

	#pick(
		move: Move,
		result: Result | null,
		mover: Color,
		human: Color | null,
		computerPieces: PieceType[]
	): Line[] {
		const opponent = other(mover);
		const say = (line: Line) => (this.has(line) ? [line] : []);
		const chance = (p: number) => this.random() < p;

		// 1–2: check and checkmate always speak, from the king concerned.
		if (result?.reason === 'checkmate') return say({ side: opponent, piece: 'k', event: 'defeat' });
		if (result) return []; // a draw has no line
		if (move.san.includes('+')) return say({ side: opponent, piece: 'k', event: 'check' });

		if (this.now() - this.#lastLine < COOLDOWN_MS) return [];
		const captured = move.captured as PieceType | undefined;
		const byPlayer = human === null || mover === human;

		if (byPlayer) {
			// 3: the capturing piece, then perhaps the captured piece's answer.
			if (captured) {
				const capture: Line = { side: mover, piece: move.piece, event: 'capture' };
				if (!this.has(capture) || !chance(P_CAPTURE)) return [];
				const answer: Line = { side: opponent, piece: captured, event: 'captured' };
				return this.has(answer) && chance(P_ANSWER) ? [capture, answer] : [capture];
			}
			// 4: any other move (castling is the king's, promotion the pawn's).
			const line: Line = { side: mover, piece: move.piece, event: 'move' };
			return this.has(line) && chance(P_MOVE) ? [line] : [];
		}

		// 5: the computer's capture: the player's piece reacts.
		if (captured) {
			const line: Line = { side: opponent, piece: captured, event: 'captured' };
			return this.has(line) && chance(P_REACTION) ? [line] : [];
		}
		// 6: otherwise an occasional taunt from a computer piece that has one.
		if (this.now() - this.#lastTaunt < TAUNT_COOLDOWN_MS || !chance(P_TAUNT)) return [];
		const taunts = [...new Set(computerPieces)]
			.map((piece): Line => ({ side: mover, piece, event: 'taunt' }))
			.filter(this.has);
		if (taunts.length === 0) return [];
		return [taunts[Math.floor(this.random() * taunts.length)]];
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
