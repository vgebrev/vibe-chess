import { expect, test, type Locator, type Page } from '@playwright/test';

const centre = async (locator: Locator) => {
	const box = await locator.boundingBox();
	if (!box) throw new Error('not visible');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Wait for piece slides and fades to finish. */
const settle = (page: Page) =>
	page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Chess');
});

test('renders the start position in the default skin', async ({ page }) => {
	await expect(page.locator('[data-skin="default"]')).toBeVisible();
	await expect(page.locator('[data-piece]')).toHaveCount(32);
	await expect(page.locator('[data-square="e1"]')).toHaveAttribute('data-piece', 'wk');
	await expect(page.locator('[data-file]')).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('the board fits the viewport without scrolling', async ({ page }) => {
	const box = await page.locator('.frame').boundingBox();
	const viewport = page.viewportSize()!;
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
	expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
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

test('switching to the Pirate skin draws coordinates in the frame', async ({ page }) => {
	await page.getByLabel('Skin').selectOption('pirate');
	await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
	const board = (await page.locator('.board').boundingBox())!;
	const fileA = await centre(page.locator('[data-file="a"]'));
	expect(fileA.y).toBeLessThan(board.y + board.height);
	expect(fileA.y).toBeGreaterThan(board.y + board.height * (1 - 0.064));
	expect(await page.evaluate(() => document.fonts.check('1em "Pirata One"'))).toBe(true);
});

const cell = (page: Page, square: string) => page.locator(`[data-cell="${square}"]`);
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
	await page.goto('/?fen=' + encodeURIComponent('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
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
	await expect(page.locator('[data-highlight="check"]')).toHaveAttribute('data-square', 'e8');
	await expect(page.locator('[data-moves] [aria-current]')).toHaveText('Qxf7#');
	await cell(page, 'e8').click();
	await expect(page.locator('[data-indicator]')).toHaveCount(0);

	// The result offers a new game inline.
	await page.locator('[data-status] + button', { hasText: 'New game' }).click();
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
});

test('auto-flip turns the board to the side to move', async ({ page }) => {
	await page.getByLabel('Auto-flip').check();
	await play(page, ['e2', 'e4']);
	await expect(page.locator('[data-orientation="black"]')).toBeVisible();
	await settle(page);
	await play(page, ['e7', 'e5']);
	await expect(page.locator('[data-orientation="white"]')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('[data-orientation="black"]')).toBeVisible();
});

test.describe('with reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('moves and flips without animating', async ({ page }) => {
		await page.locator('[data-cell="e2"]').click();
		await page.locator('[data-cell="e4"]').click();
		await page.keyboard.press('f');
		await expect(page.locator('[data-piece][data-square="e4"]')).toHaveAttribute(
			'data-piece',
			'wp'
		);
		expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
	});
});
