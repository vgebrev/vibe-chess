import { expect, test } from '@playwright/test';

test('loads the game screen', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Chess');
	await expect(page.locator('h1')).toBeVisible();
});
