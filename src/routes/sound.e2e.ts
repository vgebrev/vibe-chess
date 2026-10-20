import { expect, test, type Page } from '@playwright/test';
import { cell, hotseatAt, play, settings } from './e2e-helpers.ts';

// Sound (§4.11), in Pirate as shipped. The browser is instrumented rather than the app: each
// fetched MP3's bytes are followed through decoding to the buffer a sound plays, so the test
// can see which files start, and the music element's play() calls are recorded.
declare global {
	interface Window {
		played: string[];
		/** When each sound starts (performance.now(), ms) and how long it lasts. */
		timeline: { name: string; start: number; duration: number }[];
		stopped: string[];
		music: string[];
	}
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0; // the first variation, the shortest taunt gap and the first taunter
		window.played = [];
		window.timeline = [];
		window.stopped = [];
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
			if (this.buffer) {
				const name = source.get(this.buffer) ?? '?';
				window.played.push(name);
				const delay = Math.max(0, (args[0] ?? 0) - this.context.currentTime);
				const at = performance.now() + delay * 1000;
				window.timeline.push({ name, start: at, duration: this.buffer.duration * 1000 });
			}
			return start.apply(this, args);
		};
		const stop = AudioBufferSourceNode.prototype.stop;
		AudioBufferSourceNode.prototype.stop = function (...args) {
			if (this.buffer) window.stopped.push(source.get(this.buffer) ?? '?');
			return stop.apply(this, args);
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

test('a move plays its sound and a line from the piece that moved', async ({ page }) => {
	await play(page, ['e2', 'e4']);
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/move.mp3', 'voices/w-pawn-move-1.mp3']);
});

test('lines overlap rather than cut each other off', async ({ page }) => {
	await play(page, ['e2', 'e4']);
	await expect.poll(() => played(page)).toContain('voices/w-pawn-move-1.mp3');
	await play(page, ['e7', 'e5']);
	await expect.poll(() => played(page)).toContain('voices/b-pawn-move-1.mp3');
	expect(await page.evaluate(() => window.stopped)).toEqual([]);
});

test('a capture is voiced by the capturing piece alone', async ({ page }) => {
	await page.goto(hotseatAt('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'));
	await play(page, ['e4', 'd5']);
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/capture.mp3', 'voices/w-pawn-capture-1.mp3']);
});

/** White's queen can give check on a4. */
const QUEEN_CHECK = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';

test('check is given by the checking piece', async ({ page }) => {
	await page.goto(hotseatAt(QUEEN_CHECK));
	await play(page, ['d1', 'a4']);
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/check.mp3', 'voices/w-queen-check-1.mp3']);
});

test("vs Computer, the computer's king answers a check, and its reply waits for it", async ({
	page
}) => {
	await page.goto(`/?mode=computer&color=w&fen=${encodeURIComponent(QUEEN_CHECK)}`);
	await play(page, ['d1', 'a4']);
	await expect
		.poll(() => played(page))
		.toEqual([
			'sfx/select.mp3',
			'sfx/check.mp3',
			'voices/w-queen-check-1.mp3',
			'voices/b-king-checked-1.mp3'
		]);
	// The reply's move sound comes only once the king has had its say.
	await expect(page.locator('[data-status]')).toHaveText(/to move/, { timeout: 10_000 });
	const timeline = await page.evaluate(() => window.timeline);
	const king = timeline.find((s) => s.name === 'voices/b-king-checked-1.mp3')!;
	const reply = timeline.findLast((s) => s.name.startsWith('sfx/'))!;
	expect(reply.start).toBeGreaterThanOrEqual(king.start + king.duration);
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
	await play(page, ['e2', 'e4']);
	await expect.poll(() => played(page)).toEqual(['sfx/select.mp3', 'sfx/move.mp3']);
	expect(await music(page)).toEqual([]);
	const again = await settings(page);
	await expect(again.getByRole('slider', { name: 'Voices' })).toHaveValue('0');
	await expect(again.getByRole('slider', { name: 'Effects' })).toHaveValue('80');
});

test('a mute toggle silences a category and brings its level back', async ({ page }) => {
	const drawer = await settings(page);
	const slider = drawer.getByRole('slider', { name: 'Effects' });
	await slider.fill('40');
	// The checkbox is hidden behind its icon, so the click lands on the label around them.
	const mute = drawer.getByRole('checkbox', { name: 'Mute Effects' });
	await drawer.locator('label:has([data-mute="sfx"])').click();
	await expect(mute).toBeChecked();
	await expect(slider).toHaveValue('0');
	await page.reload();
	const again = await settings(page);
	const unmute = again.getByRole('checkbox', { name: 'Mute Effects' });
	await expect(unmute).toBeChecked();
	await again.locator('label:has([data-mute="sfx"])').click();
	await expect(again.getByRole('slider', { name: 'Effects' })).toHaveValue('40');
});

test('setting Effects or Voices plays a sample of it, and a double-click resets it', async ({
	page
}) => {
	const drawer = await settings(page); // the press unlocks audio
	await drawer.getByRole('slider', { name: 'Effects' }).fill('50');
	await expect.poll(() => played(page)).toContain('sfx/move.mp3');
	const voices = drawer.getByRole('slider', { name: 'Voices' });
	await voices.fill('50');
	await expect
		.poll(() => played(page))
		.toContainEqual(expect.stringMatching(/^voices\/[wb]-\w+-\w+-\d\.mp3$/));
	await voices.dblclick();
	await expect(voices).toHaveValue('100');
});

test("the computer answers a player's move with a taunt, in a bubble over its piece", async ({
	page
}) => {
	// With every roll 0, the third quiet move is taunted: the pawn's line, then the taunt. No
	// reply Black can make in two moves blocks these, or makes one a capture or check.
	await page.goto('/?mode=computer&color=w');
	const status = page.locator('[data-status]');
	for (const [from, to] of [
		['a2', 'a3'],
		['h2', 'h3']
	] as const) {
		await play(page, [from, to]);
		await expect(status).toHaveText(/to move/, { timeout: 5000 });
	}
	const voices = async () => (await played(page)).filter((name) => name.startsWith('voices/'));
	const pawn = expect.stringMatching(/^voices\/w-pawn-move-\d+\.mp3$/);
	expect(await voices()).toEqual([pawn, pawn]);
	await play(page, ['b2', 'b3']);
	const bubble = page.locator('[data-bubble]');
	await expect(bubble).toBeVisible({ timeout: 8000 });
	// The reply waits for the taunt to end, so the computer doesn't seem to answer itself.
	await expect(status).toHaveText(/thinking/);
	expect((await voices()).slice(2)).toEqual([
		pawn,
		expect.stringMatching(/^voices\/b-\w+-taunt-(good|neutral|bad)-\d+\.mp3$/)
	]);
	// Over one of Black's pieces: read in one go, as the reply, once the taunt ends, may move
	// the speaker while the bubble lingers, which takes it away.
	const speaker = await bubble.evaluate((el) =>
		document
			.querySelector(`[data-piece][data-square="${el.dataset.bubble}"]`)
			?.getAttribute('data-piece')
	);
	expect(speaker).toMatch(/^b/);
	await expect(bubble).toBeHidden({ timeout: 8000 });
	await expect(status).toHaveText(/to move/, { timeout: 5000 });
});

test('UI controls click, and the board and sliders do not', async ({ page }) => {
	await cell(page, 'e2').click(); // the board: its own select sound
	const drawer = await settings(page); // a button
	await drawer.getByRole('slider', { name: 'Music' }).fill('20');
	await drawer.locator('label:has([data-mute="sfx"])').click(); // a label and its checkbox: once
	await expect
		.poll(() => played(page))
		.toEqual(['sfx/select.mp3', 'sfx/click.mp3', 'sfx/click.mp3']);
});
