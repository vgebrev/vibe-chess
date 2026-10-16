// Animation durations (§4.5). Reading them inside a reactive context tracks the user's
// reduced-motion preference, which turns every animation off.
import { prefersReducedMotion } from 'svelte/motion';

export const MOVE_MS = 200;
export const CAPTURE_MS = 200;
export const DRAWER_MS = 250;
/**
 * Hot-seat auto-flip waits this long after a move, so the move is seen landing before the
 * board turns. It is a pause rather than motion, so reduced motion keeps it.
 */
export const AUTO_FLIP_DELAY_MS = MOVE_MS + 400;

export const motion = {
	/** Slides: moves, castling rooks, flips, a piece returning from an illegal drop. */
	get move(): number {
		return prefersReducedMotion.current ? 0 : MOVE_MS;
	},
	/** Fades: captures, promotion crossfades, pieces restored by undo. */
	get capture(): number {
		return prefersReducedMotion.current ? 0 : CAPTURE_MS;
	},
	/** Drawers sliding in and out, and their backdrop fading (§6.4). */
	get drawer(): number {
		return prefersReducedMotion.current ? 0 : DRAWER_MS;
	}
};
