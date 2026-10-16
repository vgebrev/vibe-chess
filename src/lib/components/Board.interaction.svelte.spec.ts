import type { Color } from 'chess.js';
import { tick } from 'svelte';
import { beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Game } from '#lib/game/game.svelte.ts';
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

interface Options {
	fen: string;
	skin: LoadedSkin;
	showLegalMoves: boolean;
	locked: boolean;
	canMove: (color: Color) => boolean;
}

function setup({ fen, ...props }: Partial<Options> = {}) {
	const game = new Game(fen);
	const screen = render(Board, { skin: fixture, game, orientation: 'white', ...props });
	const root = screen.container;
	const q = (selector: string) => root.querySelector<HTMLElement>(selector);
	const cell = (square: string) => {
		const el = q(`[data-cell="${square}"]`);
		if (!el) throw new Error(`no cell ${square}`);
		return el;
	};
	return {
		game,
		root,
		cell,
		click: (square: string) => userEvent.click(cell(square)),
		piece: (square: string) =>
			q(`[data-piece][data-square="${square}"]:not([inert])`)?.dataset.piece ?? null,
		indicators: () =>
			[...root.querySelectorAll<HTMLElement>('[data-indicator]')]
				.map((el) => `${el.dataset.indicator}:${el.dataset.square}`)
				.sort(),
		highlights: (kind: string) =>
			[...root.querySelectorAll<HTMLElement>(`[data-highlight="${kind}"]`)]
				.map((el) => el.dataset.square)
				.sort(),
		picker: () => q('[data-promotion-picker]')
	};
}

describe('click-to-move', () => {
	it('selects a piece, shows its legal moves, and moves it', async () => {
		const b = setup();
		await b.click('e2');
		expect(b.highlights('selected')).toEqual(['e2']);
		expect(b.indicators()).toEqual(['move:e3', 'move:e4']);

		await b.click('e4');
		expect(b.piece('e4')).toBe('wp');
		expect(b.piece('e2')).toBeNull();
		expect(b.game.turn).toBe('b');
		expect(b.indicators()).toEqual([]);
		expect(b.highlights('last-move')).toEqual(['e2', 'e4']);
	});

	it('deselects on a second click of the piece or a click on a non-target square', async () => {
		const b = setup();
		await b.click('g1');
		expect(b.indicators()).toEqual(['move:f3', 'move:h3']);
		await b.click('g1');
		expect(b.highlights('selected')).toEqual([]);

		await b.click('g1');
		await b.click('e5');
		expect(b.highlights('selected')).toEqual([]);
		expect(b.game.turn).toBe('w');
	});

	it('switches the selection to another piece of the side to move', async () => {
		const b = setup();
		await b.click('e2');
		await b.click('d2');
		expect(b.highlights('selected')).toEqual(['d2']);
		expect(b.indicators()).toEqual(['move:d3', 'move:d4']);
	});

	it("only selects the side to move's pieces", async () => {
		const b = setup();
		await b.click('e7');
		expect(b.highlights('selected')).toEqual([]);
		expect(b.indicators()).toEqual([]);
	});

	it('respects canMove and locked', async () => {
		const human = setup({ canMove: (c) => c === 'b' });
		await human.click('e2');
		expect(human.indicators()).toEqual([]);

		const locked = setup({ locked: true });
		await locked.click('e2');
		expect(locked.indicators()).toEqual([]);
	});
});

describe('move guidance', () => {
	// White to move: exd5 captures, and e5 is blocked so only d5 is a target for the e4 pawn.
	const CAPTURE = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';

	it('marks captures and falls back to the upscaled move indicator', async () => {
		const b = setup({ fen: CAPTURE });
		await b.click('e4');
		expect(b.indicators()).toEqual(['capture:d5']);
		const inner = b.root.querySelector<HTMLElement>('[data-indicator="capture"] > div')!;
		expect(inner.style.backgroundImage).toContain('indicator-move.webp');
		expect(parseFloat(inner.style.width)).toBeCloseTo(
			fixture.manifest.moveIndicator.captureScale * 100
		);
	});

	it("uses the skin's capture indicator when it has one", async () => {
		const b = setup({ fen: CAPTURE, skin: pirate });
		await b.click('e4');
		const indicator = b.root.querySelector<HTMLElement>('[data-indicator="capture"]')!;
		expect(indicator.querySelector<HTMLElement>('div')!.style.backgroundImage).toContain(
			'indicator-capture.webp'
		);
		expect(Number(indicator.style.opacity)).toBe(pirate.manifest.captureIndicator!.opacity);
	});

	it('counts en passant as a capture on the destination square', async () => {
		const b = setup({ fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3' });
		await b.click('e5');
		expect(b.indicators()).toEqual(['capture:f6', 'move:e6']);
		await b.click('f6');
		expect(b.piece('f5')).toBeNull();
		expect(b.piece('f6')).toBe('wp');
	});

	it('shows the hovered target at the hover opacity', async () => {
		const b = setup();
		await b.click('e2');
		await userEvent.hover(b.cell('e4'));
		const opacity = (sq: string) =>
			Number(
				b.root.querySelector<HTMLElement>(`[data-indicator][data-square="${sq}"]`)!.style.opacity
			);
		expect(opacity('e4')).toBe(fixture.manifest.moveIndicator.hoverOpacity);
		expect(opacity('e3')).toBe(fixture.manifest.moveIndicator.opacity);
	});

	it('hides indicators when legal-move guidance is off but still enforces legality', async () => {
		const b = setup({ showLegalMoves: false });
		await b.click('e2');
		expect(b.indicators()).toEqual([]);
		await b.click('e5');
		expect(b.piece('e2')).toBe('wp');
		await b.click('e2');
		await b.click('e4');
		expect(b.piece('e4')).toBe('wp');
	});

	it('highlights the king in check', () => {
		const b = setup({ fen: 'rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3' });
		expect(b.highlights('check')).toEqual(['e1']);
	});
});

describe('drag-and-drop', () => {
	it('moves a piece dropped on a legal square', async () => {
		const b = setup();
		await userEvent.dragAndDrop(b.cell('g1'), b.cell('f3'));
		expect(b.piece('f3')).toBe('wn');
		expect(b.game.turn).toBe('b');
	});

	it('returns a piece dropped on an illegal square and keeps it selected', async () => {
		const b = setup();
		await userEvent.dragAndDrop(b.cell('g1'), b.cell('g3'));
		expect(b.piece('g1')).toBe('wn');
		expect(b.game.turn).toBe('w');
		expect(b.highlights('selected')).toEqual(['g1']);
		// …so click-to-move still works.
		await b.click('h3');
		expect(b.piece('h3')).toBe('wn');
	});
});

describe('promotion', () => {
	const PROMO = '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1';

	it('asks for the piece and promotes to it', async () => {
		const b = setup({ fen: PROMO });
		await b.click('a7');
		await b.click('a8');
		expect(b.picker()).not.toBeNull();
		const choices = [...b.root.querySelectorAll<HTMLElement>('[data-promote]')].map(
			(el) => el.dataset.promote
		);
		expect(choices).toEqual(['q', 'n', 'r', 'b']);

		await userEvent.click(b.root.querySelector('[data-promote="n"]')!);
		expect(b.picker()).toBeNull();
		expect(b.piece('a8')).toBe('wn');
		expect(b.game.turn).toBe('b');
	});

	it('promotes when capturing, after a drag', async () => {
		const b = setup({ fen: PROMO });
		await userEvent.dragAndDrop(b.cell('a7'), b.cell('b8'));
		await userEvent.click(b.root.querySelector('[data-promote="q"]')!);
		expect(b.piece('b8')).toBe('wq');
	});

	it('cancels the move with Escape or a click outside the choices', async () => {
		const b = setup({ fen: PROMO });
		await b.click('a7');
		await b.click('a8');
		await userEvent.keyboard('{Escape}');
		expect(b.picker()).toBeNull();
		expect(b.piece('a7')).toBe('wp');
		expect(b.game.turn).toBe('w');

		await b.click('a7');
		await b.click('a8');
		await userEvent.click(b.picker()!, { position: { x: 300, y: 300 } });
		expect(b.picker()).toBeNull();
		expect(b.piece('a7')).toBe('wp');
	});
});

describe('keyboard', () => {
	it('selects and moves with Enter on the square buttons', async () => {
		const b = setup();
		b.cell('e2').focus();
		await userEvent.keyboard('{Enter}');
		expect(b.indicators()).toEqual(['move:e3', 'move:e4']);
		b.cell('e4').focus();
		await userEvent.keyboard('{Enter}');
		expect(b.piece('e4')).toBe('wp');
	});

	it('deselects with Escape', async () => {
		const b = setup();
		await b.click('e2');
		await userEvent.keyboard('{Escape}');
		expect(b.highlights('selected')).toEqual([]);
	});

	it('names each square and its piece', () => {
		const b = setup();
		expect(b.cell('e1').getAttribute('aria-label')).toBe('e1, White king');
		expect(b.cell('e4').getAttribute('aria-label')).toBe('e4');
	});
});

describe('animation', () => {
	const pieceEl = (b: ReturnType<typeof setup>, square: string) =>
		b.root.querySelector<HTMLElement>(`[data-piece][data-square="${square}"]:not([inert])`)!;
	const slides = (el: Element) => el.getAnimations().filter((a) => a.id === 'slide');
	const settle = () => Promise.all(document.getAnimations().map((a) => a.finished));

	it('slides a clicked move from its old square', async () => {
		const b = setup();
		await b.click('g1');
		await b.click('f3');
		const el = pieceEl(b, 'f3');
		expect(slides(el)).toHaveLength(1);
		expect(el.style.zIndex).toBe('1');
		await settle();
		expect(el.style.zIndex).toBe('');
	});

	it('snaps a dropped piece but slides one returned from an illegal drop', async () => {
		const b = setup();
		await userEvent.dragAndDrop(b.cell('g1'), b.cell('f3'));
		expect(slides(pieceEl(b, 'f3'))).toHaveLength(0);

		await b.click('e7');
		await b.click('e5');
		await settle();
		await userEvent.dragAndDrop(b.cell('f3'), b.cell('f5'));
		expect(slides(pieceEl(b, 'f3'))).toHaveLength(1);
	});

	it('starts the slide back from where the piece was dropped', async () => {
		document.documentElement.style.setProperty('--drag-scale', '1.15');
		const b = setup();
		const centre = (el: Element) => {
			const r = el.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		};
		// Below-right and above-left of the start square.
		for (const [from, to] of [
			['b1', 'd1'],
			['g1', 'e3']
		]) {
			await userEvent.dragAndDrop(b.cell(from), b.cell(to));
			const el = pieceEl(b, from);
			const [slide] = slides(el);
			slide.pause();
			slide.currentTime = 0;
			const start = centre(el);
			const drop = centre(b.cell(to));
			expect(start.x).toBeCloseTo(drop.x, 0);
			expect(start.y).toBeCloseTo(drop.y, 0);
			slide.finish();
			await userEvent.keyboard('{Escape}');
		}
	});

	it('slides both king and rook when castling', async () => {
		const b = setup({ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' });
		await b.click('e1');
		await b.click('g1');
		expect(slides(pieceEl(b, 'g1'))).toHaveLength(1);
		expect(slides(pieceEl(b, 'f1'))).toHaveLength(1);
	});

	it('fades out a captured piece on its own square, then removes it', async () => {
		const b = setup({ fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3' });
		await b.click('e5');
		await b.click('f6');
		const leaving = b.root.querySelector('[inert]')!;
		expect(leaving.getAttribute('data-square')).toBe('f5');
		await expect.poll(() => leaving.isConnected).toBe(false);
	});

	it('slides every piece when the board flips', async () => {
		const game = new Game();
		const screen = render(Board, { skin: fixture, game, orientation: 'white' });
		await screen.rerender({ orientation: 'black' });
		const pieces = [...screen.container.querySelectorAll('[data-piece]')];
		expect(pieces.every((el) => slides(el).length === 1)).toBe(true);
	});

	it('places the pieces of a new game without animation', async () => {
		const b = setup();
		await b.click('e2');
		await b.click('e4');
		await settle();
		const screen = render(Board, { skin: fixture, game: new Game(), orientation: 'white' });
		await screen.rerender({ game: new Game() });
		expect(screen.container.querySelectorAll('[inert]')).toHaveLength(0);
		expect(document.getAnimations()).toHaveLength(0);
	});

	it('shows the pawn on the promotion square while choosing, then crossfades it', async () => {
		const b = setup({ fen: '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1' });
		await b.click('a7');
		await b.click('a8');
		expect(pieceEl(b, 'a8').dataset.piece).toBe('wp');
		await settle();
		await userEvent.click(b.root.querySelector('[data-promote="q"]')!);
		const el = pieceEl(b, 'a8');
		expect(el.dataset.piece).toBe('wq');
		// The old and new sprites overlap while they crossfade.
		expect(el.querySelectorAll('.sprite')).toHaveLength(2);
		await expect.poll(() => el.querySelectorAll('.sprite').length).toBe(1);
	});

	it('crossfades a promotion that also slides only once the pawn has landed', async () => {
		const b = setup({ fen: '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1' });
		b.game.move({ from: 'a7', to: 'a8', promotion: 'q' });
		await new Promise((r) => setTimeout(r, 100));
		const [oldLayer, newLayer] = b.root.querySelectorAll<HTMLElement>('[data-piece="wq"] .layer');
		expect(Number(getComputedStyle(oldLayer).opacity)).toBe(1);
		expect(Number(getComputedStyle(newLayer).opacity)).toBe(0);
	});
});

describe('undo', () => {
	async function capture() {
		const b = setup();
		for (const [from, to] of [
			['e2', 'e4'],
			['d7', 'd5'],
			['e4', 'd5']
		]) {
			await b.click(from);
			await b.click(to);
		}
		return b;
	}
	const at = (b: ReturnType<typeof setup>, square: string) =>
		b.root.querySelectorAll(`[data-piece][data-square="${square}"]`);

	it('slides the mover back and fades the captured piece back in', async () => {
		const b = await capture();
		await expect.poll(() => b.root.querySelector('[inert]')).toBeNull();
		b.game.undo();
		await tick();
		expect(b.piece('e4')).toBe('wp');
		expect(b.piece('d5')).toBe('bp');
		expect(
			at(b, 'e4')[0]
				.getAnimations()
				.some((a) => a.id === 'slide')
		).toBe(true);
		expect(at(b, 'd5')[0].getAnimations()).not.toHaveLength(0);
		expect(b.highlights('last-move')).toEqual(['d5', 'd7']);
	});

	it('brings back a piece that is still fading out', async () => {
		const b = await capture();
		expect(b.root.querySelector('[inert]')).not.toBeNull();
		b.game.undo();
		await expect.poll(() => b.piece('d5')).toBe('bp');
		expect(at(b, 'd5')).toHaveLength(1);
	});
	it('clears the selection and cancels a pending promotion', async () => {
		const b = setup({ fen: '4k3/P7/8/8/8/8/8/4K2R b K - 0 1' });
		await b.click('e8');
		await b.click('d8');
		await b.click('a7');
		await b.click('a8');
		expect(b.picker()).not.toBeNull();
		b.game.undo();
		await tick();
		expect(b.picker()).toBeNull();
		expect(b.piece('a7')).toBe('wp');
		expect(b.game.turn).toBe('b');

		await b.click('e1');
		await b.click('d8');
		expect(b.highlights('selected')).toEqual([]);
	});
});
