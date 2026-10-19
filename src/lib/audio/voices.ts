// Which voice line (if any) a move gets (§4.11). A move is voiced from the side of the player
// who made it; check and checkmate always speak; the computer's own moves stay silent, and it
// answers a player's move with an occasional taunt. Pure apart from the injected clock and random source, so the rules
// can be tested move by move.
import type { Color, Move, Square } from 'chess.js';
import type { Result } from '#lib/game/game.svelte.ts';
import type { PieceType, VoiceEvent } from '#lib/skins/schema.ts';

/** How often each kind of line is said (§4.11). */
export interface Odds {
	/** A player's quiet move. */
	move: number;
	/** A player's capture. */
	capture: number;
	/** When the computer captures, the player's piece's reaction. */
	reaction: number;
	/** Per player's quiet move vs Computer, the computer's taunt. */
	taunt: number;
}

/**
 * The chances first tuned by ear, for if the lines grow repetitive; the tests use them to
 * exercise the chance rules.
 */
export const TUNED_ODDS: Odds = {
	move: 0.35,
	capture: 0.8,
	reaction: 0.5,
	taunt: 0.07
};
/** The chances in use: every line is said (§4.11); only taunts are spaced out, by their wait. */
export const ODDS: Odds = { move: 1, capture: 1, reaction: 1, taunt: 1 };
/** At most one taunt in this long. */
export const TAUNT_COOLDOWN_MS = 30_000;

/** One line to say: the speaker and what about. */
export interface Line {
	side: Color;
	piece: PieceType;
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
	computerPieces: { square: Square; type: PieceType }[];
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** Every occupied square of a FEN's board, with its piece letter (`K`, `p`, …). */
function* occupied(fen: string): Generator<[Square, string]> {
	const ranks = fen.split(' ')[0].split('/');
	for (let r = 0; r < 8; r++) {
		let file = 0;
		for (const c of ranks[r] ?? '') {
			if (/\d/.test(c)) file += Number(c);
			else yield [`${'abcdefgh'[file++]}${8 - r}` as Square, c];
		}
	}
}

/** The square of a side's king in a FEN. */
export function kingSquare(fen: string, side: Color): Square | undefined {
	const king = side === 'w' ? 'K' : 'k';
	for (const [square, piece] of occupied(fen)) if (piece === king) return square;
	return undefined;
}

/** The piece letter on a square in a FEN, or '' for none. */
export function pieceOn(fen: string, square: Square): string {
	for (const [s, piece] of occupied(fen)) if (s === square) return piece;
	return '';
}

export class VoiceDirector {
	#lastTaunt = -Infinity;
	readonly has: (line: Line) => boolean;
	readonly now: () => number;
	readonly random: () => number;
	readonly odds: Odds;

	/** `has`: whether the skin has lines for this speaker and event. */
	constructor(
		has: (line: Line) => boolean,
		now: () => number = () => performance.now(),
		random: () => number = Math.random,
		odds: Odds = ODDS
	) {
		this.has = has;
		this.now = now;
		this.random = random;
		this.odds = odds;
	}

	/**
	 * The lines for a move just played: none or one. Any move may speak (a newer line cuts off an
	 * older one), but taunts are spaced out; a taunt is assumed to play, so it starts that wait.
	 */
	move(move: Move, { result, human, computerPieces }: MoveContext): Line[] {
		const mover = move.color;
		const lines = this.#pick(move, result, mover, human, computerPieces);
		if (lines[0]?.event === 'taunt') this.#lastTaunt = this.now();
		return lines;
	}

	/** A resigning side's king concedes, always (§4.11 rule 1). */
	resign(side: Color, square?: Square): Line[] {
		const line: Line = { side, piece: 'k', event: 'defeat', square };
		if (!this.has(line)) return [];
		return [line];
	}

	#pick(
		move: Move,
		result: Result | null,
		mover: Color,
		human: Color | null,
		computerPieces: MoveContext['computerPieces']
	): Line[] {
		const opponent = other(mover);
		const say = (line: Line) => (this.has(line) ? [line] : []);
		const chance = (p: number) => this.random() < p;
		const odds = this.odds;
		const king = (event: VoiceEvent): Line => ({
			side: opponent,
			piece: 'k',
			event,
			square: kingSquare(move.after, opponent)
		});

		// 1–2: check and checkmate always speak, from the king concerned.
		if (result?.reason === 'checkmate') return say(king('defeat'));
		if (result) return []; // a draw has no line
		if (move.san.includes('+')) return say(king('check'));

		// 3–4: a player's capture or other move, from the piece that moved (castling is the
		// king's, promotion the pawn's). The captured piece doesn't answer. vs Computer, a quiet
		// move may get a computer piece's taunt instead, so the taunt answers the player.
		if (human === null || mover === human) {
			if (human !== null && !move.captured) {
				const taunt = this.#taunt(opponent, computerPieces);
				if (taunt) return [taunt];
			}
			const [event, p] = move.captured
				? (['capture', odds.capture] as const)
				: (['move', odds.move] as const);
			const line: Line = { side: mover, piece: move.piece, event, square: move.to };
			return this.has(line) && chance(p) ? [line] : [];
		}

		// 5–6: the computer's capture: the player's piece reacts. Its other moves are silent.
		if (move.captured) {
			const line: Line = { side: opponent, piece: move.captured as PieceType, event: 'captured' };
			return this.has(line) && chance(odds.reaction) ? [line] : [];
		}
		return [];
	}

	/**
	 * Now and then, at most every 30 s, a taunt from a computer piece that has one: each kind of
	 * piece is as likely, then one of that kind.
	 */
	#taunt(computer: Color, computerPieces: MoveContext['computerPieces']): Line | null {
		if (this.now() - this.#lastTaunt < TAUNT_COOLDOWN_MS) return null;
		if (!(this.random() < this.odds.taunt)) return null;
		const kinds = [...new Set(computerPieces.map((p) => p.type))].filter((piece) =>
			this.has({ side: computer, piece, event: 'taunt' })
		);
		if (kinds.length === 0) return null;
		const piece = kinds[Math.floor(this.random() * kinds.length)];
		const squares = computerPieces.filter((p) => p.type === piece);
		const { square } = squares[Math.floor(this.random() * squares.length)];
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
