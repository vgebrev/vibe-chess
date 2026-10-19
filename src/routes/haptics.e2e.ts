import { expect, test, type Page } from '@playwright/test';
import { play, settings } from './e2e-helpers.ts';

// Haptics (§4.12). The browser is made to look like a phone that can vibrate: a coarse pointer
// and a recording navigator.vibrate.
declare global {
	interface Window {
		vibrations: number[][];
	}
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		window.vibrations = [];
		navigator.vibrate = (pattern: number | Iterable<number>) => {
			window.vibrations.push(typeof pattern === 'number' ? [pattern] : [...pattern]);
			return true;
		};
		const matchMedia = window.matchMedia.bind(window);
		window.matchMedia = (query: string) =>
			query === '(pointer: coarse)'
				? ({ ...matchMedia(query), matches: true } as MediaQueryList)
				: matchMedia(query);
	});
	await page.goto('/?mode=hotseat');
	await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
});

const vibrations = (page: Page) => page.evaluate(() => window.vibrations);

test('picking up and moving a piece vibrate, and the setting turns it off', async ({ page }) => {
	await play(page, ['e2', 'e4']);
	await expect.poll(() => vibrations(page)).toEqual([[30], [60]]);

	const drawer = await settings(page);
	await drawer.getByLabel('Vibration').uncheck();
	await page.reload();
	await page.evaluate(() => (window.vibrations = []));
	await play(page, ['e7', 'e5']);
	await page.waitForTimeout(300);
	expect(await vibrations(page)).toEqual([]);
});
