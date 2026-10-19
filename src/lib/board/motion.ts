// Animation durations (§4.5). Reading them inside a reactive context tracks the user's
// reduced-motion preference, which turns every animation off.
import { prefersReducedMotion } from 'svelte/motion';

export const MOVE_MS = 200;
export const CAPTURE_MS = 200;
const DRAWER_MS = 250;
/**
 * Hot-seat auto-flip waits this long after a move, so the move is seen landing before the
 * board turns. It is a pause rather than motion, so reduced motion keeps it.
 */
export const AUTO_FLIP_DELAY_MS = MOVE_MS + 400;
/**
 * The game-over overlay (§4.7.1) waits this long after the game ends, so the last move is seen
 * landing first. A pause, so reduced motion keeps it too.
 */
export const GAME_OVER_DELAY_MS = MOVE_MS + 800;

const unlessReduced = (ms: number) => (prefersReducedMotion.current ? 0 : ms);

export const motion = {
	/** Slides: moves, castling rooks, flips, a piece returning from an illegal drop. */
	get move(): number {
		return unlessReduced(MOVE_MS);
	},
	/** Fades: captures, promotion crossfades, pieces restored by undo. */
	get capture(): number {
		return unlessReduced(CAPTURE_MS);
	},
	/** Drawers sliding in and out, and their backdrop fading (§6.4). */
	get drawer(): number {
		return unlessReduced(DRAWER_MS);
	}
};
