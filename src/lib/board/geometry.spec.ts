import { readFileSync } from 'node:fs';
import type { Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { validateSkin, type SkinManifest } from '#lib/skins/schema.ts';
import { fileLabels, gridToSquare, rankLabels, spritePosition, squareToGrid } from './geometry.ts';

describe('squareToGrid', () => {
	it.each([
		['a1', 'white', 0, 7],
		['h1', 'white', 7, 7],
		['a8', 'white', 0, 0],
		['e4', 'white', 4, 4],
		['a1', 'black', 7, 0],
		['h8', 'black', 0, 7],
		['e4', 'black', 3, 3]
	] as const)('%s from %s is col %i row %i', (square, orientation, col, row) => {
		expect(squareToGrid(square, orientation)).toEqual({ col, row });
	});

	it('round-trips through gridToSquare for every square and orientation', () => {
		for (const orientation of ['white', 'black'] as const) {
			for (const f of 'abcdefgh') {
				for (const r of '12345678') {
					const square = `${f}${r}` as Square;
					const { col, row } = squareToGrid(square, orientation);
					expect(gridToSquare(col, row, orientation)).toBe(square);
				}
			}
		}
	});

	it('puts h8 at the bottom-left when flipped', () => {
		expect(gridToSquare(0, 7, 'black')).toBe('h8');
	});
});

describe('coordinate labels', () => {
	it('read left to right and top to bottom as seen from each side', () => {
		expect(fileLabels('white').join('')).toBe('abcdefgh');
		expect(rankLabels('white').join('')).toBe('87654321');
		expect(fileLabels('black').join('')).toBe('hgfedcba');
		expect(rankLabels('black').join('')).toBe('12345678');
	});
});

describe('spritePosition', () => {
	const result = validateSkin(JSON.parse(readFileSync('static/skins/pirate/skin.json', 'utf8')));
	const pieces = (result as { skin: SkinManifest }).skin.pieces;

	it.each([
		['k', 'w', '0% 100%'],
		['q', 'w', '20% 100%'],
		['b', 'w', '40% 100%'],
		['n', 'w', '60% 100%'],
		['r', 'w', '80% 100%'],
		['p', 'w', '100% 100%'],
		['k', 'b', '0% 0%'],
		['q', 'b', '20% 0%'],
		['b', 'b', '40% 0%'],
		['n', 'b', '60% 0%'],
		['r', 'b', '80% 0%'],
		['p', 'b', '100% 0%']
	] as const)('%s%s is at %s', (type, color, expected) => {
		expect(spritePosition(type, color, pieces)).toBe(expected);
	});

	it('follows the manifest order and row mapping', () => {
		const swapped = {
			...pieces,
			order: ['p', 'r', 'n', 'b', 'q', 'k'] as SkinManifest['pieces']['order'],
			rowFor: { w: 0, b: 1 }
		};
		expect(spritePosition('k', 'w', swapped)).toBe('100% 0%');
		expect(spritePosition('p', 'b', swapped)).toBe('0% 100%');
	});
});
