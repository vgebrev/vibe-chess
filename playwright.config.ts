import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 24378 },
	testMatch: '**/*.e2e.{ts,js}',
	use: { baseURL: 'http://localhost:24378' },
	// The two viewports from SPEC §8: phone portrait and desktop
	projects: [
		{
			name: 'phone',
			use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true }
		},
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		}
	]
});
