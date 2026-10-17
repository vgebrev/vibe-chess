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
