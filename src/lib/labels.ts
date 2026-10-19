// Display names and status text. Templates are fixed here; skins only supply side names,
// which fall back to generic text (§4.8).
import type { Color, PieceSymbol, Square } from 'chess.js';
import { other } from '#lib/game/color.ts';
import type { Result } from '#lib/game/game.svelte.ts';
import type { Outcome } from '#lib/game/outcome.ts';
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

/** Accessible name of a board square, e.g. "e4, Blue Crew pawn" (§6.5). */
export function squareLabel(
	square: Square,
	piece: { color: Color; type: PieceSymbol } | null,
	labels: Labels
): string {
	return piece ? `${square}, ${sideName(piece.color, labels)} ${PIECE_NAMES[piece.type]}` : square;
}

/** Why a finished game ended, e.g. "Checkmate" or "Red Crew resigns". */
export function reasonText(result: Result, labels: Labels): string {
	switch (result.reason) {
		case 'checkmate':
			return 'Checkmate';
		case 'resignation':
			return `${sideName(other(result.winner as Color), labels)} resigns`;
		case 'stalemate':
			return 'Stalemate';
		case 'repetition':
			return 'Threefold repetition';
		case 'fifty-move':
			return '50-move rule';
		case 'insufficient-material':
			return 'Insufficient material';
	}
}

/** How a finished game ended, e.g. "Checkmate — Blue Crew wins". */
export function resultText(result: Result, labels: Labels): string {
	const reason = reasonText(result, labels);
	return result.winner === 'draw'
		? `${reason} — draw`
		: `${reason} — ${sideName(result.winner, labels)} wins`;
}

/** The game-over overlay's headline (§4.7.1): the player's view vs the computer, else the winner. */
export function outcomeTitle(o: Outcome, labels: Labels): string {
	if (o.winner === null) return 'Draw';
	if (o.human === null) return `${sideName(o.winner, labels)} wins!`;
	return o.winner === o.human ? 'Victory!' : 'Defeat';
}

/** The status line: whose turn it is, check, the engine thinking, or the result (§4.7). */
export function statusText(
	state: { turn: Color; inCheck: boolean; thinking?: boolean; result: Result | null },
	labels: Labels
): string {
	if (state.result) return resultText(state.result, labels);
	const side = sideName(state.turn, labels);
	if (state.inCheck) return `${side} is in check`;
	return state.thinking ? `${side} is thinking…` : `${side} to move`;
}

/** Text equivalent of a player strip, e.g. "Blue Crew captured: queen, 2 pawns. +7" (§4.10). */
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
