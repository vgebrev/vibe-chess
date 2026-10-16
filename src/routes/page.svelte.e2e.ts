import { expect, test, type Locator, type Page } from '@playwright/test';

const centre = async (locator: Locator) => {
	const box = await locator.boundingBox();
	if (!box) throw new Error('not visible');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

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
	page.locator(`[data-piece][data-square="${square}"]`);

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
	await cell(page, 'e8').click();
	await expect(page.locator('[data-indicator]')).toHaveCount(0);
});
