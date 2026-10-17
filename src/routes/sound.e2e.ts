import { expect, test, type Page } from '@playwright/test';

// Sound (§4.11), in Pirate as shipped. The browser is instrumented rather than the app: each
// fetched MP3's bytes are followed through decoding to the buffer a sound plays, so the test
// can see which files start, and the music element's play() calls are recorded.
declare global {
	interface Window {
		played: string[];
		music: string[];
	}
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0; // every chance hits, and the first variation is chosen
		window.played = [];
		window.music = [];
		const source = new WeakMap<object, string>();
		const short = (url: string) => url.replace(/^.*\/skins\/[^/]+\/audio\//, '');
		const arrayBuffer = Response.prototype.arrayBuffer;
		Response.prototype.arrayBuffer = async function () {
			const bytes = await arrayBuffer.call(this);
			if (this.url.endsWith('.mp3')) source.set(bytes, short(this.url));
			return bytes;
		};
		const slice = ArrayBuffer.prototype.slice;
		ArrayBuffer.prototype.slice = function (...args) {
			const copy = slice.apply(this, args);
			if (source.has(this)) source.set(copy, source.get(this)!);
			return copy;
		};
		const decode = BaseAudioContext.prototype.decodeAudioData;
		BaseAudioContext.prototype.decodeAudioData = async function (bytes: ArrayBuffer) {
			const name = source.get(bytes); // read before decoding detaches the bytes
			const buffer = await decode.call(this, bytes);
			if (name) source.set(buffer, name);
			return buffer;
		};
		const start = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...args) {
			if (this.buffer) window.played.push(source.get(this.buffer) ?? '?');
			return start.apply(this, args);
		};
		const play = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function () {
			window.music.push(short(this.src));
			return play.call(this);
		};
	});
	await page.goto('/?mode=hotseat');
	await expect(page.locator('[data-skin="pirate"]')).toBeVisible();
});

const played = (page: Page) => page.evaluate(() => window.played);
const music = (page: Page) => page.evaluate(() => window.music);
const cell = (page: Page, square: string) => page.locator(`[data-cell="${square}"]`);

async function settings(page: Page) {
	await page.getByRole('button', { name: 'Settings' }).click();
	return page.getByRole('dialog', { name: 'Settings' });
}

test('a move plays its sound and a line from the piece that moved', async ({ page }) => {
	await cell(page, 'e2').click();
	await cell(page, 'e4').click();
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/move.mp3', 'voices/w-pawn-move-1.mp3']);
});

test("a capture is followed by the captured piece's answer", async ({ page }) => {
	await page.goto(
		'/?mode=hotseat&fen=rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'
	);
	await cell(page, 'e4').click();
	await cell(page, 'd5').click();
	await expect
		.poll(() => played(page))
		.toEqual([
			'sfx/select.mp3',
			'sfx/capture.mp3',
			'voices/w-pawn-capture-1.mp3',
			'voices/b-pawn-captured-1.mp3'
		]);
});

test('check is answered by the king in check', async ({ page }) => {
	await page.goto('/?mode=hotseat&fen=4k3/8/8/8/8/8/8/4K2R w K - 0 1');
	await cell(page, 'h1').click();
	await cell(page, 'h8').click();
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/check.mp3', 'voices/b-king-check-1.mp3']);
});

test('the music waits for the first press, then plays', async ({ page }) => {
	expect(await music(page)).toEqual([]);
	await cell(page, 'e2').click();
	await expect.poll(() => music(page)).toHaveLength(1);
	expect((await music(page))[0]).toMatch(/^music\/\w[\w-]*\.mp3$/);
});

test('volumes are set in Settings and kept, and 0 silences a category', async ({ page }) => {
	const drawer = await settings(page);
	await expect(drawer.getByRole('group', { name: 'Sound' })).toBeVisible();
	await drawer.getByRole('slider', { name: 'Voices' }).fill('0');
	await drawer.getByRole('slider', { name: 'Music' }).fill('0');
	await expect(drawer.getByText('Off')).toHaveCount(2);

	// Reloaded with music and voices off, nothing of either plays (or downloads).
	await page.reload();
	await cell(page, 'e2').click();
	await cell(page, 'e4').click();
	await expect.poll(() => played(page)).toEqual(['sfx/select.mp3', 'sfx/move.mp3']);
	expect(await music(page)).toEqual([]);
	const again = await settings(page);
	await expect(again.getByRole('slider', { name: 'Voices' })).toHaveValue('0');
	await expect(again.getByRole('slider', { name: 'Effects' })).toHaveValue('80');
});
