import { expect, test } from '@playwright/test';

// The skins as shipped (§5.5): Marble is disabled in its manifest, so Pirate is the only
// skin on offer. The other e2e files enable every skin to play in the default one.
test.beforeEach(async ({ page }) => {
	await page.goto('/?mode=hotseat');
});

test('starts in Pirate, the only enabled skin, with its labels', async ({ page }) => {
	await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
	await expect(page.locator('[data-piece]')).toHaveCount(32);
	await expect(page.locator('[data-status]')).toHaveText('Blue Crew to move');
});

test('with only one skin there is no skin picker', async ({ page }) => {
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	await expect(drawer.getByRole('group', { name: 'Board' })).toBeVisible();
	await expect(drawer.getByRole('group', { name: 'Skin' })).toHaveCount(0);
});

test('Pirate draws coordinates in the frame, in its font', async ({ page }) => {
	const board = (await page.locator('.board').boundingBox())!;
	const fileA = (await page.locator('[data-file="a"]').boundingBox())!;
	const y = fileA.y + fileA.height / 2;
	expect(y).toBeLessThan(board.y + board.height);
	expect(y).toBeGreaterThan(board.y + board.height * (1 - 0.064));
	expect(await page.evaluate(() => document.fonts.check('1em "Pirata One"'))).toBe(true);
});

test('a saved skin that has since been disabled falls back to an enabled one', async ({ page }) => {
	await page.evaluate(() =>
		localStorage.setItem('chess:settings:v1', JSON.stringify({ skinId: 'default' }))
	);
	await page.goto('/');
	await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
});

test("Pirate's game-over overlay shows its picture for the result", async ({ page }) => {
	// Fool's mate: Red Crew wins.
	for (const [from, to] of [
		['f2', 'f3'],
		['e7', 'e5'],
		['g2', 'g4'],
		['d8', 'h4']
	]) {
		await page.locator(`[data-cell="${from}"]`).click();
		await page.locator(`[data-cell="${to}"]`).click();
	}
	const over = page.getByRole('dialog', { name: 'Red Crew wins!' });
	await expect(over.locator('[data-result-image]')).toHaveAttribute('src', /result-win-red\.webp$/);
	await expect
		.poll(() =>
			over.locator('[data-result-image]').evaluate((img: HTMLImageElement) => img.naturalWidth)
		)
		.toBe(512);
});

test.describe("Pirate's splash (§4.13)", () => {
	test('opens at startup with the title on the banner, and New Game opens the drawer', async ({
		page
	}) => {
		await page.goto('/');
		const splash = page.getByRole('dialog', { name: 'Vibe Chess' });
		const image = splash.locator('[data-splash-image]');
		await expect(image).toHaveAttribute('src', /splash\.webp$/);
		await expect(page.locator('[data-splash-title]')).toHaveCSS('font-family', /Pirata One/);
		// The title sits on the banner: centred across, in the top fifth.
		const box = (await image.boundingBox())!;
		const title = (await page.locator('[data-splash-title]').boundingBox())!;
		expect(Math.abs(title.x + title.width / 2 - (box.x + box.width / 2))).toBeLessThan(
			box.width * 0.02
		);
		expect(title.y + title.height / 2).toBeLessThan(box.y + box.height * 0.2);
		// No game in progress: nothing to continue.
		await expect(splash.getByRole('button', { name: 'Continue' })).toBeDisabled();

		await splash.getByRole('button', { name: 'New Game' }).click();
		await expect(page.locator('[data-splash]')).toHaveCount(0);
		await expect(page.getByRole('dialog', { name: 'New game' })).toBeVisible();
	});

	test('Continue, or Esc, goes back to the game in progress; New Game offers the computer', async ({
		page
	}) => {
		await page.locator('[data-cell="e2"]').click();
		await page.locator('[data-cell="e4"]').click();
		await expect(page.locator('[data-status]')).toHaveText('Red Crew to move');

		await page.goto('/');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.locator('[data-splash]')).toHaveCount(0);
		await expect(page.locator('[data-piece][data-square="e4"]:not([inert])')).toHaveAttribute(
			'data-piece',
			'wp'
		);

		await page.goto('/');
		await expect(page.locator('[data-splash]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-splash]')).toHaveCount(0);
		await expect(page.locator('[data-status]')).toHaveText('Red Crew to move');
		// New Game offers a game vs the computer, though the one in progress is two players; the
		// game's own New game button keeps its setup.
		await page.goto('/');
		await page
			.getByRole('dialog', { name: 'Vibe Chess' })
			.getByRole('button', { name: 'New Game' })
			.click();
		const form = page.getByRole('dialog', { name: 'New game' });
		await expect(form.getByRole('radio', { name: 'Computer' })).toBeChecked();
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'New game' }).first().click();
		await expect(form.getByRole('radio', { name: 'Two players' })).toBeChecked();
	});

	test('a link that sets up the game skips it', async ({ page }) => {
		await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
		await expect(page.locator('[data-splash]')).toHaveCount(0);
	});
});
