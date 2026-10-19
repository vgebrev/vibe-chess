// Captured pieces and material balance for the player strips (§4.10). Both are derived from
// the game, so undo, new game and resume need no bookkeeping.
import type { Color, Move, PieceSymbol } from 'chess.js';
import type { BoardPiece } from './pieces.ts';

const PIECE_VALUES: Record<PieceSymbol, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };

/** Display order of captured pieces. */
const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

/**
 * The pieces each side has captured, in display order. chess.js records the captured piece as
 * it stood on the board (en passant included), so a captured promoted piece shows as what it
 * had become.
 */
export function capturedBy(
	moves: Pick<Move, 'color' | 'captured'>[]
): Record<Color, PieceSymbol[]> {
	const captured: Record<Color, PieceSymbol[]> = { w: [], b: [] };
	for (const m of moves) if (m.captured) captured[m.color].push(m.captured);
	for (const list of Object.values(captured))
		list.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
	return captured;
}

/** Captured pieces in display order as one entry per type, with how many (§4.10). */
export function countByType(captured: PieceSymbol[]): { type: PieceSymbol; count: number }[] {
	const groups: { type: PieceSymbol; count: number }[] = [];
	for (const type of captured) {
		const last = groups.at(-1);
		if (last?.type === type) last.count++;
		else groups.push({ type, count: 1 });
	}
	return groups;
}

/** White's material minus Black's, counted on the board so promotions count correctly. */
export function materialBalance(pieces: Pick<BoardPiece, 'color' | 'type'>[]): number {
	let balance = 0;
	for (const p of pieces) balance += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
	return balance;
}
