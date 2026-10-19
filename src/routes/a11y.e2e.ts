import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { cell, enableAllSkins, hotseatAt, settings, settle } from './e2e-helpers.ts';

// Accessibility (§6.5): an axe scan of each state of the screen, in both skins, and a game
// played with the keyboard alone.

/** Scan once motion has settled, naming the state in the failure message. */
async function scan(page: Page, state: string) {
	await settle(page);
	const { violations } = await new AxeBuilder({ page }).analyze();
	const found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
	expect(found, state).toEqual([]);
}

for (const skin of ['Marble', 'Pirate']) {
	test(`no axe violations in the ${skin} skin`, async ({ page }, info) => {
		// Marble is disabled in its manifest; scan it anyway, through the picker.
		await enableAllSkins(page);
		await page.goto('/?mode=hotseat');
		await expect(page.locator('[data-piece]')).toHaveCount(32);
		await (await settings(page)).getByText(skin, { exact: true }).click();
		await expect(
			page.locator(`[data-skin="${skin === 'Marble' ? 'default' : 'pirate'}"]`)
		).toBeVisible();
		await scan(page, 'settings');
		await page.keyboard.press('Escape');
		await scan(page, 'start');

		await page.getByRole('button', { name: 'Credits' }).click();
		await scan(page, 'credits');
		await page.keyboard.press('Escape');

		await cell(page, 'e2').click();
		await scan(page, 'piece selected');
		await cell(page, 'e4').click();

		await page.getByRole('button', { name: 'New game' }).click();
		const dialog = page.getByRole('dialog', { name: 'New game' });
		await dialog.getByText('Computer', { exact: true }).click();
		await dialog.getByText('Custom', { exact: true }).click();
		await scan(page, 'new game');
		await page.keyboard.press('Escape');

		if (info.project.name === 'phone') {
			await page.getByRole('button', { name: 'Moves' }).click();
			await scan(page, 'moves');
			await page.keyboard.press('Escape');
		}

		await page.getByRole('button', { name: 'Resign' }).click();
		await scan(page, 'resign confirmation');
		await page.getByRole('button', { name: 'Yes, resign' }).click();
		await expect(page.locator('[data-game-over]')).toBeVisible();
		await scan(page, 'game over');
		await page.getByRole('button', { name: 'View board' }).click();
		await scan(page, 'game over, board');

		await page.goto(hotseatAt('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
		await cell(page, 'a7').click();
		await cell(page, 'a8').click();
		await scan(page, 'promotion picker');
	});
}

test('no axe violations on the splash', async ({ page }) => {
	// Pirate as shipped has one (§4.13).
	await page.goto('/');
	await expect(page.getByRole('dialog', { name: 'Vibe Chess' })).toBeVisible();
	await scan(page, 'splash');
});

test('a game can be played with the keyboard alone', async ({ page }) => {
	await enableAllSkins(page);
	await page.goto('/?mode=hotseat');
	const status = page.locator('[data-status]');
	// Tab reaches the board's single tab stop, bottom-left (a1).
	for (let i = 0; i < 10; i++) {
		await page.keyboard.press('Tab');
		if (await cell(page, 'a1').evaluate((el) => el === document.activeElement)) break;
	}
	await expect(cell(page, 'a1')).toBeFocused();

	// e2–e4: right ×4, up, select, up ×2, move.
	for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp'])
		await page.keyboard.press(key);
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-square="e4"][data-piece="wp"]')).toBeAttached();
	await expect(status).toHaveText('Black to move');
	await expect(page.locator('[data-announce]')).toHaveText('1. e4. Black to move');

	// The rest of the screen is reachable too: Tab leaves the board for the controls.
	await page.keyboard.press('Tab');
	await expect(page.locator('[data-cell]:focus')).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(status).toHaveText('White to move');
});
