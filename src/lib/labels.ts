// Display names, with skin labels falling back to generic text (§4.8).
import type { Color, PieceSymbol, Square } from 'chess.js';
import type { Labels } from '#lib/skins/schema.ts';

export const PIECE_NAMES: Record<PieceSymbol, string> = {
	k: 'king',
	q: 'queen',
	r: 'rook',
	b: 'bishop',
	n: 'knight',
	p: 'pawn'
};

export function sideName(color: Color, labels: Labels): string {
	return color === 'w' ? (labels.white ?? 'White') : (labels.black ?? 'Black');
}

/** Accessible name of a board square, e.g. "e4, Red Crew pawn" (§6.5). */
export function squareLabel(
	square: Square,
	piece: { color: Color; type: PieceSymbol } | null,
	labels: Labels
): string {
	return piece ? `${square}, ${sideName(piece.color, labels)} ${PIECE_NAMES[piece.type]}` : square;
}
