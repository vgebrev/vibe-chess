// Board geometry: square ↔ grid mapping per orientation, sprite offsets, coordinate labels.
// Everything is in grid units or percentages so the board stays resolution-independent (§5.4).
import type { Square } from 'chess.js';
import type { Color, PieceType, SkinManifest } from '#lib/skins/schema.ts';

export type Orientation = 'white' | 'black';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** Grid cell of a square; col 0 is the left edge and row 0 the top edge as seen on screen. */
export function squareToGrid(
	square: Square,
	orientation: Orientation
): { col: number; row: number } {
	const file = square.charCodeAt(0) - 97; // a = 0
	const rank = Number(square[1]) - 1; // 1 = 0
	return orientation === 'white' ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

export function gridToSquare(col: number, row: number, orientation: Orientation): Square {
	const file = orientation === 'white' ? col : 7 - col;
	const rank = orientation === 'white' ? 7 - row : row;
	return `${FILES[file]}${RANKS[rank]}` as Square;
}

/** File letters left to right, as seen on screen. */
export function fileLabels(orientation: Orientation): string[] {
	return orientation === 'white' ? [...FILES] : [...FILES].reverse();
}

/** Rank digits top to bottom, as seen on screen. */
export function rankLabels(orientation: Orientation): string[] {
	return orientation === 'white' ? [...RANKS].reverse() : [...RANKS];
}

/**
 * CSS `background-position` for one sprite in the sheet, for use with
 * `background-size: columns×100% rows×100%`. Percent positions put cell i at i/(n−1).
 */
export function spritePosition(
	type: PieceType,
	color: Color,
	pieces: SkinManifest['pieces']
): string {
	const col = pieces.order.indexOf(type);
	const row = pieces.rowFor[color];
	const pct = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);
	return `${pct(col, pieces.columns)}% ${pct(row, pieces.rows)}%`;
}
