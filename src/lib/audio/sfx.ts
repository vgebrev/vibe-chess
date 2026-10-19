// Which generic sound a move gets (§4.11): one per move, the most important that applies.
import type { Move } from 'chess.js';
import type { Result } from '#lib/game/game.svelte.ts';
import type { SfxName } from '#lib/skins/schema.ts';

/** The SFX for a move just played, given the game's result after it. */
export function moveSfx(move: Move, result: Result | null): SfxName {
	if (result?.reason === 'checkmate') return 'checkmate';
	if (result?.winner === 'draw') return 'draw';
	if (move.san.includes('+')) return 'check';
	if (move.isPromotion()) return 'promotion';
	if (move.isKingsideCastle() || move.isQueensideCastle()) return 'castle';
	if (move.captured) return 'capture';
	return 'move';
}
