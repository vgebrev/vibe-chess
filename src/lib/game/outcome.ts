// How a finished game turned out for the game-over overlay (§4.7.1): which picture it shows.
import type { Color } from 'chess.js';
import type { ResultImages } from '#lib/skins/schema.ts';
import type { Result } from './game.svelte.ts';

export type OutcomeKind = 'win' | 'loss' | 'resign' | 'draw' | 'stalemate';

export interface Outcome {
	kind: OutcomeKind;
	/** The winning side, null for a draw. */
	winner: Color | null;
	/** The player's side vs the computer, null in hot-seat. */
	human: Color | null;
}

/**
 * A checkmate is a win, unless the computer delivered it. A resignation is its own outcome,
 * whoever resigned (only the player can, vs the computer).
 */
export function outcome(result: Result, human: Color | null): Outcome {
	if (result.winner === 'draw')
		return { kind: result.reason === 'stalemate' ? 'stalemate' : 'draw', winner: null, human };
	const kind =
		result.reason === 'resignation'
			? 'resign'
			: human === null || result.winner === human
				? 'win'
				: 'loss';
	return { kind, winner: result.winner, human };
}

/**
 * The outcome's picture in the winning side's colours, or null for none. Stalemate falls back
 * to the draw picture, and a resignation to the loss picture vs the computer (the player
 * resigned) or the win picture in hot-seat.
 */
export function resultImage(images: ResultImages | null, o: Outcome): string | null {
	if (!images) return null;
	if (o.kind === 'draw') return images.draw;
	if (o.kind === 'stalemate') return images.stalemate ?? images.draw;
	const winner = o.winner!;
	if (o.kind === 'resign')
		return (images.resign ?? (o.human ? images.loss : images.win))?.[winner] ?? null;
	return images[o.kind]?.[winner] ?? null;
}
