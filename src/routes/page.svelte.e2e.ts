import { expect, test, type Locator, type Page } from '@playwright/test';
import { cell, enableAllSkins, hotseatAt, settings, settle } from './e2e-helpers.ts';

const centre = async (locator: Locator) => {
	const box = await locator.boundingBox();
	if (!box) throw new Error('not visible');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Most tests play both sides; the vs-Computer ones navigate again. Every skin is enabled, so
// play starts in the default skin with its White/Black labels; skins.e2e.ts covers the
// skins as shipped.
test.beforeEach(async ({ page }) => {
	await enableAllSkins(page);
	await page.goto('/?mode=hotseat');
	await expect(page).toHaveTitle('Vibe Chess');
});

test('renders the start position in the default skin', async ({ page }) => {
	await expect(page.locator('[data-skin="default"]')).toBeVisible();
	await expect(page.locator('[data-piece]')).toHaveCount(32);
	await expect(page.locator('[data-square="e1"]')).toHaveAttribute('data-piece', 'wk');
	await expect(page.locator('[data-file]')).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

const fitsWithoutScrolling = async (page: Page) => {
	const box = await page.locator('.frame').boundingBox();
	const viewport = page.viewportSize()!;
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
	expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
	const page_ = await page.evaluate(() => {
		const root = document.scrollingElement!;
		return { width: root.scrollWidth, height: root.scrollHeight };
	});
	expect(page_).toEqual(viewport);
	// The control bar is on screen too.
	const controls = (await page.locator('[data-controls]').boundingBox())!;
	expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
};

test('the board fits the viewport without scrolling', async ({ page }) => {
	await fitsWithoutScrolling(page);
});

test.describe('on a 360 px phone', () => {
	test.use({ viewport: { width: 360, height: 640 } });

	test('the page fits without scrolling', async ({ page }, info) => {
		test.skip(info.project.name !== 'phone', 'a phone size');
		await fitsWithoutScrolling(page);
	});
});

for (const how of ['button', 'F key'] as const) {
	test(`flipping with the ${how} puts h8 bottom-left and mirrors the coordinates`, async ({
		page
	}) => {
		const a1 = await centre(page.locator('[data-square="a1"]'));
		const fileA = await centre(page.locator('[data-file="a"]'));

		if (how === 'button') await page.getByRole('button', { name: 'Flip board' }).click();
		else await page.keyboard.press('f');

		await expect(page.locator('[data-orientation="black"]')).toBeVisible();
		await settle(page);
		expect(await centre(page.locator('[data-square="h8"]'))).toEqual(a1);
		expect(await centre(page.locator('[data-file="h"]'))).toEqual(fileA);
		const ranks = await page
			.locator('[data-rank]')
			.evaluateAll((els) =>
				els.map((el) => ({ rank: el.textContent!.trim(), y: el.getBoundingClientRect().y }))
			);
		expect(ranks.sort((a, b) => a.y - b.y).map((r) => r.rank)).toEqual([
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8'
		]);
	});
}

const pieceOn = (page: Page, square: string) =>
	page.locator(`[data-piece][data-square="${square}"]:not([inert])`);

test('moves by click and by drag', async ({ page }) => {
	await cell(page, 'e2').click();
	await expect(page.locator('[data-indicator]')).toHaveCount(2);
	await cell(page, 'e4').click();
	await expect(pieceOn(page, 'e4')).toHaveAttribute('data-piece', 'wp');

	await cell(page, 'g8').dragTo(cell(page, 'f6'));
	await expect(pieceOn(page, 'f6')).toHaveAttribute('data-piece', 'bn');
	await expect(page.locator('[data-status]')).toHaveText('White to move');
});

test('plays a promotion through the picker', async ({ page }) => {
	await page.goto(hotseatAt('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
	await cell(page, 'a7').click();
	await cell(page, 'a8').click();
	await expect(page.locator('[data-promote]')).toHaveCount(4);
	await page.getByRole('button', { name: 'Promote to knight' }).click();
	await expect(pieceOn(page, 'a8')).toHaveAttribute('data-piece', 'wn');
	await expect(page.locator('[data-promote]')).toHaveCount(0);
});

test("scholar's mate ends the game", async ({ page }) => {
	for (const [from, to] of [
		['e2', 'e4'],
		['e7', 'e5'],
		['f1', 'c4'],
		['b8', 'c6'],
		['d1', 'h5'],
		['g8', 'f6'],
		['h5', 'f7']
	]) {
		await cell(page, from).click();
		await cell(page, to).click();
	}
	await expect(page.locator('[data-status]')).toHaveText('Checkmate — White wins');

	// The game-over overlay follows; "View board" closes it (§4.7.1).
	const over = page.getByRole('dialog', { name: 'White wins!' });
	await expect(over).toBeVisible();
	await expect(over).toContainText('Checkmate');
	await over.getByRole('button', { name: 'View board' }).click();
	await expect(over).toBeHidden();

	await expect(page.locator('[data-highlight="check"]')).toHaveAttribute('data-square', 'e8');
	await expect(page.locator('[data-moves] [aria-current]')).toHaveText('Qxf7#');
	await cell(page, 'e8').click();
	await expect(page.locator('[data-indicator]')).toHaveCount(0);

	// The result offers a new game inline, set up like the last one.
	await page.locator('[data-status] + button', { hasText: 'New game' }).click();
	await expect(page.getByRole('radio', { name: 'Two players' })).toBeChecked();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('[data-status]')).toHaveText('White to move');
	await expect(pieceOn(page, 'd1')).toHaveAttribute('data-piece', 'wq');
});

const play = async (page: Page, ...moves: [string, string][]) => {
	for (const [from, to] of moves) {
		await cell(page, from).click();
		await cell(page, to).click();
	}
};

test('undo takes back moves, by button and by Ctrl+Z', async ({ page }) => {
	const undo = page.getByRole('button', { name: 'Undo' });
	await expect(undo).toBeDisabled();
	await play(page, ['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']);
	await expect(pieceOn(page, 'd5')).toHaveAttribute('data-piece', 'wp');

	await undo.click();
	await expect(pieceOn(page, 'e4')).toHaveAttribute('data-piece', 'wp');
	await expect(pieceOn(page, 'd5')).toHaveAttribute('data-piece', 'bp');
	await expect(page.locator('[data-status]')).toHaveText('White to move');

	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('[data-status]')).toHaveText('Black to move');
	await expect(page.locator('[data-last-move]')).toHaveText(/1\. e4/);
});

test('shows captures and material in the player strips, which follow the board', async ({
	page
}) => {
	await play(page, ['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['g8', 'f6'], ['f1', 'b5']);
	await play(page, ['c7', 'c6'], ['d5', 'c6'], ['d8', 'd2']);
	// Bottom strip is White's while White is at the bottom.
	const strips = page.locator('[data-strip]');
	await expect(strips.last()).toHaveAttribute('data-strip', 'w');
	await expect(page.getByRole('img', { name: 'White captured: 2 pawns' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Black captured: pawn' })).toBeVisible();
	await expect(page.locator('[data-strip="w"] [data-advantage]')).toHaveText('+1');
	await expect(page.locator('[data-status]')).toHaveText('White is in check');

	await page.keyboard.press('f');
	await expect(strips.last()).toHaveAttribute('data-strip', 'b');
});

test('resigning takes a second tap and ends the game', async ({ page }) => {
	await play(page, ['e2', 'e4']);
	await page.getByRole('button', { name: 'Resign' }).click();
	await expect(page.locator('[data-status]')).toHaveText('Black to move');
	await page.getByRole('button', { name: 'Yes, resign' }).click();
	await expect(page.locator('[data-status]')).toHaveText('Black resigns — White wins');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Resign' })).toBeDisabled();

	// The overlay's New game opens the New game drawer.
	const over = page.getByRole('dialog', { name: 'White wins!' });
	await expect(over).toContainText('Black resigns');
	await over.getByRole('button', { name: 'New game' }).click();
	await expect(over).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'New game' })).toBeVisible();
});

test('the game-over overlay closes on Esc, and goes on undo', async ({ page }) => {
	// Fool's mate.
	await play(page, ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']);
	const over = page.getByRole('dialog', { name: 'Black wins!' });
	await expect(over).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(over).toBeHidden();

	await page.getByRole('button', { name: 'Undo' }).click();
	await play(page, ['d8', 'h4']);
	await expect(over).toBeVisible();
	await page
		.getByRole('dialog')
		.locator('[data-scrim]')
		.click({ position: { x: 5, y: 5 } });
	await expect(over).toBeHidden();
});

test('a stalemate shows a draw', async ({ page }) => {
	await page.goto(hotseatAt('7k/8/6Q1/8/8/8/8/K7 w - - 0 1'));
	await play(page, ['g6', 'f7']);
	const over = page.getByRole('dialog', { name: 'Draw' });
	await expect(over).toContainText('Stalemate');
});

test('auto-flip turns the board to the side to move', async ({ page }) => {
	const drawer = await settings(page);
	await drawer.getByLabel('Auto-flip').check();
	await page.keyboard.press('Escape');
	await expect(drawer).toBeHidden();
	await play(page, ['e2', 'e4']);
	await expect(page.locator('[data-orientation="black"]')).toBeVisible();
	await settle(page);
	await play(page, ['e7', 'e5']);
	await expect(page.locator('[data-orientation="white"]')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('[data-orientation="black"]')).toBeVisible();
});

test('the move list is in a drawer below lg, and inline from lg', async ({ page }, info) => {
	await play(page, ['e2', 'e4']);
	const toggle = page.getByRole('button', { name: 'Moves' });
	if (info.project.name === 'desktop') {
		await expect(page.locator('[data-moves]')).toBeVisible();
		await expect(toggle).toBeHidden();
		return;
	}
	await expect(page.locator('[data-moves]')).toBeHidden();
	await toggle.click();
	const drawer = page.getByRole('dialog', { name: 'Moves' });
	await expect(drawer.locator('[data-moves] [aria-current]')).toHaveText('e4');
	// A modal dialog: the page behind is inert while the drawer is open.
	expect(await drawer.evaluate((d) => d.matches(':modal'))).toBe(true);
	await page.keyboard.press('Escape');
	await expect(drawer).toBeHidden();
	await expect(toggle).toBeFocused();
});

test('settings apply at once, and the drawer closes from its scrim', async ({ page }) => {
	const drawer = await settings(page);
	await expect(drawer.getByLabel('Auto-flip')).toBeVisible();
	await expect(drawer.getByRole('group', { name: 'Difficulty' })).toHaveCount(0);
	await drawer.getByLabel('Show coordinates').uncheck();
	await expect(page.locator('[data-file]')).toHaveCount(0);
	await drawer.getByLabel('Show legal moves').uncheck();
	await page.mouse.click(8, 8);
	await expect(drawer).toBeHidden();
	await cell(page, 'e2').click();
	await expect(page.locator('[data-indicator]')).toHaveCount(0);
});

test.describe('with reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	// Without the slide, the handle is in place as soon as the drawer opens.
	test('a drawer closes when swiped down by its handle', async ({ page }, info) => {
		test.skip(info.project.name !== 'phone', 'the handle shows below lg');
		const drawer = await settings(page);
		const handle = await centre(drawer.locator('[data-handle]'));
		const swipe = async (dy: number, steps: number) => {
			await page.mouse.move(handle.x, handle.y);
			await page.mouse.down();
			await page.mouse.move(handle.x, handle.y + dy, { steps });
			await page.mouse.up();
		};
		await swipe(30, 3);
		await expect(drawer).toBeVisible(); // too short: it springs back
		await swipe(150, 5);
		await expect(drawer).toBeHidden();
	});

	test('moves and flips without animating', async ({ page }) => {
		await cell(page, 'e2').click();
		await cell(page, 'e4').click();
		await page.keyboard.press('f');
		await expect(page.locator('[data-piece][data-square="e4"]')).toHaveAttribute(
			'data-piece',
			'wp'
		);
		expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
	});
});

test.describe('vs Computer', () => {
	// `?mode=` starts a new game rather than resuming the hot-seat one saved above.
	test.beforeEach(async ({ page }) => {
		await page.goto('/?mode=computer');
	});

	test('the engine replies to the first move within 5 s', async ({ page }) => {
		await play(page, ['e2', 'e4']);
		await expect(page.locator('[data-status]')).toHaveText('Black is thinking…');
		// The player can't move the computer's pieces.
		await cell(page, 'e7').click();
		await expect(page.locator('[data-indicator]')).toHaveCount(0);
		await expect(page.locator('[data-status]')).toHaveText('White to move', { timeout: 5000 });
		await expect(page.locator('[data-moves] li')).toHaveText(/1\.\s*e4\s*\S+/);
	});

	test('undo takes back the move and the reply', async ({ page }) => {
		const undo = page.getByRole('button', { name: 'Undo' });
		await play(page, ['e2', 'e4']);
		await expect(page.locator('[data-status]')).toHaveText('White to move', { timeout: 5000 });
		await undo.click();
		await expect(page.locator('[data-moves] li')).toHaveText('No moves yet');
		await expect(pieceOn(page, 'e2')).toHaveAttribute('data-piece', 'wp');
		await expect(undo).toBeDisabled();
	});

	test('undo while the engine thinks cancels its reply', async ({ page }) => {
		await play(page, ['e2', 'e4']);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('[data-status]')).toHaveText('White to move');
		// Longer than any opening think: no reply arrives.
		await page.waitForTimeout(1500);
		await expect(page.locator('[data-moves] li')).toHaveText('No moves yet');
	});

	test('playing Black, the board turns and the engine opens', async ({ page }) => {
		await page.getByRole('button', { name: 'New game' }).click();
		const dialog = page.getByRole('dialog', { name: 'New game' });
		await dialog.getByText('Black', { exact: true }).click();
		await dialog.getByRole('button', { name: 'Start' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('[data-orientation="black"]')).toBeVisible();
		await expect(page.locator('[data-moves] [aria-current]')).toBeAttached({ timeout: 5000 });
		await expect(page.locator('[data-status]')).toHaveText('Black to move');
	});

	test('settings offer the difficulty, not auto-flip', async ({ page }) => {
		const drawer = await settings(page);
		await expect(drawer.getByRole('group', { name: 'Difficulty' })).toBeVisible();
		await expect(drawer.getByLabel('Auto-flip')).toHaveCount(0);
		// The computer's strip shows the Elo it plays at, and follows the setting.
		await expect(page.locator('[data-strip="b"] [data-elo-label]')).toHaveText('1320 Elo');
		await expect(page.locator('[data-strip="w"] [data-elo-label]')).toHaveCount(0);
		await drawer.getByText('Hard (1729)').click();
		await expect(page.locator('[data-strip="b"] [data-elo-label]')).toHaveText('1729 Elo');
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'New game' }).click();
		await expect(page.getByRole('radio', { name: 'Hard' })).toBeChecked();
	});

	test('the custom Elo slider moves in steps of 50', async ({ page }) => {
		await page.getByRole('button', { name: 'New game' }).click();
		await page.getByText('Custom', { exact: true }).click();
		const slider = page.getByRole('slider', { name: 'Elo' });
		await expect(slider).toHaveValue('1350');
		await slider.focus();
		await page.keyboard.press('ArrowRight');
		await expect(slider).toHaveValue('1400');
		await page.keyboard.press('End');
		await expect(slider).toHaveValue('3150');
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('falls back to two players if the engine fails to load', async ({ page }) => {
		await page.route(/\.wasm$/, (route) => route.abort());
		await page.goto('/?mode=computer');
		await expect(page.getByRole('alert')).toContainText('two-player game');
		await play(page, ['e2', 'e4'], ['e7', 'e5']);
		await expect(page.locator('[data-status]')).toHaveText('White to move');
	});

	test('a reload resumes the game, and Undo still takes back the pair', async ({ page }) => {
		await play(page, ['e2', 'e4']);
		await expect(page.locator('[data-status]')).toHaveText('White to move', { timeout: 5000 });
		await page.goto('/');
		await expect(page.locator('[data-moves] li')).toHaveText(/1\.\s*e4\s*\S+/);
		await expect(page.locator('[data-status]')).toHaveText('White to move');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('[data-moves] li')).toHaveText('No moves yet');
	});

	test("a reload on the computer's turn lets it reply", async ({ page }) => {
		await play(page, ['e2', 'e4']);
		await page.goto('/');
		await expect(page.locator('[data-status]')).toHaveText('White to move', { timeout: 5000 });
		await expect(page.locator('[data-moves] li')).toHaveText(/1\.\s*e4\s*\S+/);
	});
});

test.describe('resuming after a reload (§4.9)', () => {
	test('restores the game, its undo history, the board side and the settings', async ({ page }) => {
		await play(page, ['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']);
		await page.keyboard.press('f');
		const drawer = await settings(page);
		await drawer.getByLabel('Show legal moves').uncheck();
		await page.keyboard.press('Escape');

		await page.goto('/');
		await expect(page.locator('[data-orientation="black"]')).toBeVisible();
		await expect(pieceOn(page, 'd5')).toHaveAttribute('data-piece', 'wp');
		await expect(page.locator('[data-status]')).toHaveText(/to move$/);
		await cell(page, 'd8').click();
		await expect(page.locator('[data-indicator]')).toHaveCount(0);

		// Undo replays from the saved moves: the captured pawn comes back.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(pieceOn(page, 'd5')).toHaveAttribute('data-piece', 'bp');
		await expect(pieceOn(page, 'e4')).toHaveAttribute('data-piece', 'wp');
	});

	test('keeps a resignation final', async ({ page }) => {
		await play(page, ['e2', 'e4']);
		await page.getByRole('button', { name: 'Resign' }).click();
		await page.getByRole('button', { name: 'Yes, resign' }).click();
		await page.getByRole('button', { name: 'View board' }).click();
		await page.goto('/');
		await expect(page.locator('[data-status]')).toHaveText('Black resigns — White wins');
		await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
		// A finished game resumes without the game-over overlay.
		await page.waitForTimeout(1500);
		await expect(page.locator('[data-game-over]')).toHaveCount(0);
	});

	test('starts afresh from a saved game that no longer replays', async ({ page }) => {
		await page.evaluate(() =>
			localStorage.setItem('chess:game:v1', JSON.stringify({ startFen: 'nonsense', moves: [] }))
		);
		await page.goto('/');
		await expect(page.locator('[data-piece]')).toHaveCount(32);
		await expect(page.locator('[data-status]')).toHaveText('White to move');
	});

	test('plays without storage', async ({ page }) => {
		await page.addInitScript(() =>
			Object.defineProperty(window, 'localStorage', {
				get() {
					throw new DOMException('blocked', 'SecurityError');
				}
			})
		);
		await page.goto('/?mode=hotseat');
		await play(page, ['e2', 'e4'], ['e7', 'e5']);
		await expect(page.locator('[data-status]')).toHaveText('White to move');
	});
});

test.describe('skins', () => {
	test('the default skin draws coordinates in the gutter', async ({ page }) => {
		await expect(page.locator('[data-skin="default"]')).toBeVisible();
		const board = (await page.locator('.board').boundingBox())!;
		const fileA = await centre(page.locator('[data-file="a"]'));
		expect(fileA.y).toBeGreaterThan(board.y + board.height);
	});

	test('the picker switches skin, and the choice survives a reload', async ({ page }) => {
		const drawer = await settings(page);
		await expect(drawer.getByRole('radio', { name: 'Marble' })).toBeChecked();
		await drawer.getByText('Pirate', { exact: true }).click();
		await expect(page.locator('[data-skin="pirate"]')).toBeAttached();
		await expect(drawer.getByRole('radio', { name: 'Pirate' })).toBeChecked();
		await page.goto('/');
		await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
	});
});

test('credits open from the header, with links that open in a new tab', async ({ page }) => {
	await page.getByRole('button', { name: 'Credits' }).click();
	const drawer = page.getByRole('dialog', { name: 'Credits' });
	const link = drawer.getByRole('link', { name: 'stockfish.js' });
	await expect(link).toHaveAttribute('href', 'https://github.com/nmrugg/stockfish.js');
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(drawer.getByRole('link')).toHaveCount(7);
	await page.keyboard.press('Escape');
	await expect(drawer).toBeHidden();
});
