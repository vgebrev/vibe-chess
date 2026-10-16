import { beforeAll, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../app.css';
import { loadSkin, type LoadedSkin } from '#lib/skins/loader.ts';
import Controls from './Controls.svelte';
import MoveList from './MoveList.svelte';
import PlayerStrip from './PlayerStrip.svelte';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let pirate: LoadedSkin;

beforeAll(async () => {
	pirate = await loadSkin('/skins/pirate/', 'pirate');
});

describe('PlayerStrip', () => {
	it('shows the side, its captures as the opponent’s sprites, and its lead', async () => {
		const screen = render(PlayerStrip, {
			color: 'w',
			skin: pirate,
			captured: ['q', 'p', 'p'],
			advantage: 7,
			active: true
		});
		const root = screen.container;
		expect(root.textContent).toContain('Red Crew');
		expect(
			[...root.querySelectorAll<HTMLElement>('[data-captured]')].map((el) => el.dataset.captured)
		).toEqual(['q', 'p', 'p']);
		expect(root.querySelector('[data-advantage]')?.textContent).toBe('+7');
		expect(root.querySelector('[data-strip]')?.hasAttribute('data-active')).toBe(true);
		await expect
			.element(page.getByRole('img', { name: 'Red Crew captured: queen, 2 pawns. +7' }))
			.toBeInTheDocument();
	});

	it('fits a full set of captures on a 360 px phone, squeezing same-type pieces', async () => {
		const all = ['q', 'r', 'r', 'b', 'b', 'n', 'n', ...Array(8).fill('p')] as const;
		const screen = render(PlayerStrip, {
			color: 'b',
			skin: pirate,
			captured: [...all],
			advantage: 39,
			active: true
		});
		screen.container.style.width = '328px'; // 360 px minus the page gutters
		const strip = screen.container.querySelector<HTMLElement>('[data-strip]')!;
		const right = (el: Element) => el.getBoundingClientRect().right;
		const boxes = [...strip.querySelectorAll('[data-captured]')];
		expect(strip.scrollWidth).toBeLessThanOrEqual(328);
		expect(right(strip.querySelector('[data-advantage]')!)).toBeLessThanOrEqual(right(strip));
		// Every piece still peeks out, and the last of each group is whole.
		for (const el of boxes) expect(el.getBoundingClientRect().width).toBeGreaterThanOrEqual(6);
		expect(boxes.at(-1)!.getBoundingClientRect().width).toBe(30);
	});

	it('shows no lead when behind or level', () => {
		const screen = render(PlayerStrip, {
			color: 'b',
			skin: pirate,
			captured: [],
			advantage: -3,
			active: false
		});
		expect(screen.container.querySelector('[data-advantage]')).toBeNull();
		expect(screen.container.querySelector('[data-active]')).toBeNull();
	});
});

describe('MoveList', () => {
	const cells = (root: Element) =>
		[...root.querySelectorAll('li')].map((li) =>
			[...li.children]
				.map((el) => el.textContent!.trim())
				.filter(Boolean)
				.join(' ')
		);

	it('lists moves in numbered pairs and marks the latest', async () => {
		const screen = render(MoveList, { startFen: START, moves: ['e4', 'e5', 'Nf3'] });
		expect(cells(screen.container)).toEqual(['1. e4 e5', '2. Nf3']);
		expect(screen.container.querySelector('[aria-current]')?.textContent).toBe('Nf3');
		await screen.rerender({ moves: ['e4', 'e5', 'Nf3', 'Nc6'] });
		expect(screen.container.querySelector('[aria-current]')?.textContent).toBe('Nc6');
	});

	it('keeps the latest move scrolled into view', async () => {
		const sans = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'Ng8' : 'Nf3'));
		const screen = render(MoveList, { startFen: START, moves: sans });
		const list = screen.container.querySelector('ol')!;
		expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
		expect(list.scrollTop + list.clientHeight).toBeCloseTo(list.scrollHeight, -1);
	});
});

describe('Controls', () => {
	function setup(props: { canUndo?: boolean; canResign?: boolean } = {}) {
		const handlers = {
			onnew: vi.fn(),
			onundo: vi.fn(),
			onflip: vi.fn(),
			onresign: vi.fn(),
			onmoves: vi.fn()
		};
		render(Controls, { canUndo: true, canResign: true, ...handlers, ...props });
		return handlers;
	}

	it('names each button in full, with short labels below lg', async () => {
		const h = setup();
		const flip = page.getByRole('button', { name: 'Flip board' });
		await expect.element(flip).toHaveTextContent(/Flip/);
		await page.getByRole('button', { name: 'Moves' }).click();
		expect(h.onmoves).toHaveBeenCalledOnce();
	});

	it('asks for a second tap before resigning', async () => {
		const h = setup();
		await page.getByRole('button', { name: 'Resign' }).click();
		expect(h.onresign).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'No, keep playing' }).click();
		// Focus goes back to Resign, which the confirmation had replaced.
		await expect.element(page.getByRole('button', { name: 'Resign' })).toHaveFocus();
		await page.getByRole('button', { name: 'Resign' }).click();
		await userEvent.keyboard('{Enter}');
		expect(h.onresign).toHaveBeenCalledOnce();
	});

	it('disables undo and resign when they don’t apply', async () => {
		setup({ canUndo: false, canResign: false });
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Resign' })).toBeDisabled();
	});
});
