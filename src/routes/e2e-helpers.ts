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
