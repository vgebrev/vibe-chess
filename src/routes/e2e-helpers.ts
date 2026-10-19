import type { Page } from '@playwright/test';

/**
 * Serve every skin as enabled, so tests can cover the skin picker and skins that are
 * switched off in their manifests (§5.5). Call before navigating.
 */
export async function enableAllSkins(page: Page) {
	await page.route('**/skins/*/skin.json', async (route) => {
		const response = await route.fetch();
		const json = await response.json();
		delete json.disabled;
		await route.fulfill({ response, json });
	});
}

/** The URL of a hot-seat game from a given position. */
export const hotseatAt = (fen: string) => `/?mode=hotseat&fen=${encodeURIComponent(fen)}`;

/** A board square's button, for clicks, drags and focus. */
export const cell = (page: Page, square: string) => page.locator(`[data-cell="${square}"]`);

/** Open the settings drawer. Radios and checkboxes are picked by their label text. */
export async function settings(page: Page) {
	await page.getByRole('button', { name: 'Settings' }).click();
	return page.getByRole('dialog', { name: 'Settings' });
}

/** Wait for piece slides and fades to finish. */
export const settle = (page: Page) =>
	page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
