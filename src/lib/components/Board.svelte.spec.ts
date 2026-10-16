import { beforeAll, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { piecesFromFen } from '#lib/game/pieces.ts';
import { loadSkin, type LoadedSkin } from '#lib/skins/loader.ts';
import Board from './Board.svelte';

let fixture: LoadedSkin;
let pirate: LoadedSkin;

beforeAll(async () => {
	[fixture, pirate] = await Promise.all([
		loadSkin('/tests/fixtures/skins/test/', 'test'),
		loadSkin('/skins/pirate/', 'pirate')
	]);
});

const rect = (el: Element | null) => {
	if (!el) throw new Error('element not found');
	return el.getBoundingClientRect();
};
const centre = (el: Element | null) => {
	const r = rect(el);
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

function setup(
	props: Partial<{
		skin: LoadedSkin;
		orientation: 'white' | 'black';
		showCoordinates: boolean;
	}> = {}
) {
	const screen = render(Board, {
		skin: fixture,
		pieces: piecesFromFen(),
		orientation: 'white',
		...props
	});
	const root = screen.container;
	return {
		root,
		frame: root.querySelector('.frame')!,
		board: root.querySelector('.board')!,
		piece: (square: string) => root.querySelector(`[data-square="${square}"]`),
		file: (f: string) => root.querySelector(`[data-file="${f}"]`),
		rank: (r: string) => root.querySelector(`[data-rank="${r}"]`),
		rerender: screen.rerender
	};
}

describe('Board', () => {
	it('renders all 32 pieces of the start position with their sprites', () => {
		const { root, piece } = setup();
		expect(root.querySelectorAll('[data-piece]')).toHaveLength(32);
		expect(piece('e1')?.getAttribute('data-piece')).toBe('wk');
		expect(getComputedStyle(piece('e8')!.querySelector('.sprite')!).backgroundPosition).toBe(
			'0% 100%'
		);
	});

	it('places a1 bottom-left from White and h8 bottom-left from Black', async () => {
		const { piece, rerender } = setup();
		const a1 = centre(piece('a1'));
		const h8 = centre(piece('h8'));
		expect(a1.x).toBeLessThan(h8.x);
		expect(a1.y).toBeGreaterThan(h8.y);

		await rerender({ orientation: 'black' });
		expect(centre(piece('h8'))).toEqual(a1);
		expect(centre(piece('a1'))).toEqual(h8);
	});

	it('draws coordinates in a gutter outside a frameless board, mirrored when flipped', async () => {
		const { frame, board, file, rank, rerender } = setup();
		const f = rect(frame);
		const b = rect(board);
		// Board + gutter fill the square box: the board shrinks by gutter/(8 + gutter).
		expect(b.width / f.width).toBeCloseTo(8 / 8.35, 3);
		expect(b.right).toBeCloseTo(f.right, 0);
		expect(b.top).toBeCloseTo(f.top, 0);

		expect(centre(file('a')).y).toBeGreaterThan(b.bottom);
		expect(centre(rank('1')).x).toBeLessThan(b.left);
		expect(centre(file('a')).x).toBeLessThan(centre(file('h')).x);
		expect(centre(rank('8')).y).toBeLessThan(centre(rank('1')).y);

		await rerender({ orientation: 'black' });
		expect(centre(file('h')).x).toBeLessThan(centre(file('a')).x);
		expect(centre(rank('1')).y).toBeLessThan(centre(rank('8')).y);
	});

	it('uses the skin font and coordinate colour for labels', () => {
		document.documentElement.style.setProperty('--skin-font', '"Fixture Serif"');
		document.documentElement.style.setProperty('--coord-text', '#ff00ff');
		const { file } = setup();
		const style = getComputedStyle(file('a')!);
		expect(style.fontFamily).toMatch(/^"Fixture Serif"/);
		expect(style.color).toBe('rgb(255, 0, 255)');
	});

	it('lets a frameless board fill the box when coordinates are hidden', () => {
		const { root, frame, board } = setup({ showCoordinates: false });
		expect(root.querySelectorAll('[data-file], [data-rank]')).toHaveLength(0);
		expect(rect(board).width).toBeCloseTo(rect(frame).width, 0);
	});

	it('draws coordinates in the frame of a framed board', () => {
		const { board, piece, file, rank } = setup({ skin: pirate });
		const b = rect(board);
		expect(b.width).toBeCloseTo(rect(board.parentElement).width, 0);

		const a = centre(file('a'));
		const one = centre(rank('1'));
		// Inside the image, in the bottom and left frame strips…
		expect(a.y).toBeLessThan(b.bottom);
		expect(a.y).toBeGreaterThan(b.bottom - 0.064 * b.height);
		expect(one.x).toBeGreaterThan(b.left);
		expect(one.x).toBeLessThan(b.left + 0.06 * b.width);
		// …centred on the a-file and the first rank.
		expect(a.x).toBeCloseTo(centre(piece('a1')).x, 0);
		expect(one.y).toBeCloseTo(rect(piece('a1')).top + rect(piece('a1')).height / 2, 0);
	});
});
