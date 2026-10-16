import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSkin, SkinError } from './loader.ts';
import { skin } from './skin.svelte.ts';

const FIXTURES = '/tests/fixtures/skins';

afterEach(() => vi.restoreAllMocks());

describe('loadSkin', () => {
	it('loads the fixture skin with absolute asset URLs and its font', async () => {
		const loaded = await loadSkin(`${FIXTURES}/test/`, 'test');
		expect(loaded.manifest.id).toBe('test');
		expect(loaded.urls.board).toBe(new URL(`${FIXTURES}/test/board.webp`, location.href).href);
		expect(loaded.urls.captureIndicator).toBeNull();
		expect(document.fonts.check('1em "Fixture Serif"')).toBe(true);
	});

	it('rejects a manifest whose id does not match its folder', async () => {
		await expect(loadSkin(`${FIXTURES}/test/`, 'pirate')).rejects.toThrow(/id: expected "pirate"/);
	});

	it('reports a missing manifest', async () => {
		// Stubbed: a real 404 here falls through to SvelteKit's dev SSR inside the test server.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
		const error = await loadSkin(`${FIXTURES}/missing/`).catch((e) => e);
		expect(error).toBeInstanceOf(SkinError);
		expect(error.errors).toEqual(['skin.json: HTTP 404']);
	});

	it('reports assets that fail to load', async () => {
		const realFetch = globalThis.fetch;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const manifest = await (await realFetch(input)).json();
			return Response.json({ ...manifest, board: { ...manifest.board, image: 'font/OFL.txt' } });
		});
		const error = await loadSkin(`${FIXTURES}/test/`).catch((e) => e);
		expect(error).toBeInstanceOf(SkinError);
		expect(error.errors).toEqual([
			expect.stringMatching(/^could not load image .*\/font\/OFL\.txt$/)
		]);
	});
});

describe('skin store', () => {
	it('applies the theme and font as CSS variables', async () => {
		expect(await skin.use(`${FIXTURES}/test/`, 'test')).toBe(true);
		const style = getComputedStyle(document.documentElement);
		expect(style.getPropertyValue('--accent')).toBe('#3366ff');
		expect(style.getPropertyValue('--surface-raised')).toBe('#303030');
		expect(style.getPropertyValue('--coord-shadow')).toBe('none');
		expect(style.getPropertyValue('--skin-font')).toBe('"Fixture Serif"');
		expect(style.getPropertyValue('--font-fallback')).toBe('serif');
	});

	it('logs the errors of an invalid skin and stays on the current one', async () => {
		await skin.use(`${FIXTURES}/test/`, 'test');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await skin.use(`${FIXTURES}/invalid/`, 'invalid')).toBe(false);

		expect(skin.current?.manifest.id).toBe('test');
		expect(getComputedStyle(document.documentElement).getPropertyValue('--accent')).toBe('#3366ff');
		expect(skin.errors).toContain(
			'pieces.order: expected each of "k", "q", "b", "n", "r", "p" exactly once'
		);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining('board.image: expected a relative path')
		);
	});

	it('ignores a load that a newer one superseded', async () => {
		const first = skin.use(`${FIXTURES}/test/`, 'test');
		const second = skin.use(`${FIXTURES}/test/`, 'test');
		expect(await first).toBe(false);
		expect(await second).toBe(true);
	});
});
