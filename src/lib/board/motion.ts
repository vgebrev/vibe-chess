// Animation durations (§4.5). Reading them inside a reactive context tracks the user's
// reduced-motion preference, which turns every animation off.
import { prefersReducedMotion } from 'svelte/motion';

export const MOVE_MS = 200;
export const CAPTURE_MS = 200;

export const motion = {
	/** Slides: moves, castling rooks, flips, a piece returning from an illegal drop. */
	get move(): number {
		return prefersReducedMotion.current ? 0 : MOVE_MS;
	},
	/** Fades: captures, promotion crossfades, pieces restored by undo. */
	get capture(): number {
		return prefersReducedMotion.current ? 0 : CAPTURE_MS;
	}
};
