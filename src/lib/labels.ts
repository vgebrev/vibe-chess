// Display names and status text. Templates are fixed here; skins only supply side names,
// which fall back to generic text (§4.8).
import type { Color, PieceSymbol, Square } from 'chess.js';
import type { Result } from '#lib/game/game.svelte.ts';
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

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** How a finished game ended, e.g. "Checkmate — Red Crew wins". */
export function resultText(result: Result, labels: Labels): string {
	const winner = result.winner === 'draw' ? '' : sideName(result.winner, labels);
	switch (result.reason) {
		case 'checkmate':
			return `Checkmate — ${winner} wins`;
		case 'resignation':
			return `${sideName(other(result.winner as Color), labels)} resigns — ${winner} wins`;
		case 'stalemate':
			return 'Stalemate — draw';
		case 'repetition':
			return 'Threefold repetition — draw';
		case 'fifty-move':
			return '50-move rule — draw';
		case 'insufficient-material':
			return 'Insufficient material — draw';
	}
}

/** The status line: whose turn it is, check, or the result (§4.7). */
export function statusText(
	state: { turn: Color; inCheck: boolean; result: Result | null },
	labels: Labels
): string {
	if (state.result) return resultText(state.result, labels);
	const side = sideName(state.turn, labels);
	return state.inCheck ? `${side} is in check` : `${side} to move`;
}

/** Text equivalent of a player strip, e.g. "Red Crew captured: queen, 2 pawns. +7" (§4.10). */
export function capturesLabel(
	color: Color,
	captured: PieceSymbol[],
	advantage: number,
	labels: Labels
): string {
	const counts = new Map<PieceSymbol, number>();
	for (const type of captured) counts.set(type, (counts.get(type) ?? 0) + 1);
	const list = [...counts].map(([type, n]) =>
		n === 1 ? PIECE_NAMES[type] : `${n} ${PIECE_NAMES[type]}s`
	);
	const text = `${sideName(color, labels)} captured: ${list.join(', ') || 'nothing'}`;
	return advantage > 0 ? `${text}. +${advantage}` : text;
}
