// The game's sound (§4.11): turns game events into SFX and voice lines from the active skin,
// and keeps the mixer's volumes, playlist and unlock in step with the page. Every SFX event
// also gives haptic feedback (§4.12), so the two can't drift apart.
import type { Color, Move, Square } from 'chess.js';
import { Haptics } from '#lib/haptics.ts';
import type { LoadedSkin } from '#lib/skins/loader.ts';
import type { BubbleEvent, Emotes, SfxName, SkinAudio } from '#lib/skins/schema.ts';
import { CATEGORIES, Mixer, type Category, type Timing, type Volumes } from './mixer.ts';
import { moveSfx } from './sfx.ts';
import { pickVariation, pieceOn, VoiceDirector, type Line, type MoveContext } from './voices.ts';

/** A speech bubble over the piece that is speaking: a cell of the skin's emote sheet. */
export interface Bubble {
	square: Square;
	emote: number;
}

/**
 * Whether a click was on a UI control (by pointer or keyboard), which gets the `click` sound:
 * buttons, links and option chips and toggles, but not the board (its moves have their own
 * sounds) or sliders.
 */
function isControl(target: EventTarget | null): boolean {
	if (!(target instanceof Element) || target.closest('[data-skin], [data-haptic]')) return false;
	const control = target.closest('button, a[href], summary, label, input');
	if (!control) return false;
	const input = control instanceof HTMLLabelElement ? control.control : control;
	return !(input instanceof HTMLInputElement && input.type === 'range');
}

/** Input that unlocks audio: whichever of these counts as a user gesture on the device. */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** A bubble stays up this long after its line ends, in ms. */
const BUBBLE_LINGER_MS = 300;

export class Sound {
	#mixer = new Mixer();
	/** Each sound event also gives haptic feedback, where the device can (§4.12). */
	readonly haptics = new Haptics();
	#audio: SkinAudio | null = null;
	#emotes: Emotes | null = null;
	/** Shows or hides the speech bubble. */
	readonly onbubble: (bubble: Bubble | null) => void;
	#shown: Bubble | null = null;
	#bubbleTimers: ReturnType<typeof setTimeout>[] = [];
	#base = '';
	#volumes: Volumes = { music: 0, sfx: 0, voices: 0 };
	/** The variation played last per pool, so a line doesn't repeat straight away. */
	#lastVariation: Record<string, number> = {};
	#director = new VoiceDirector((line) => this.#pool(line).length > 0);

	constructor(onbubble: (bubble: Bubble | null) => void = () => {}) {
		this.onbubble = onbubble;
	}

	/** Which categories the skin has sounds for (Settings shows a slider for each, §4.11). */
	static categories(audio: SkinAudio | null): Category[] {
		if (!audio) return [];
		const voices = Object.values(audio.voices).some((byPiece) => Object.keys(byPiece).length > 0);
		return [
			...(audio.music.length > 0 ? (['music'] as const) : []),
			...(Object.keys(audio.sfx).length > 0 ? (['sfx'] as const) : []),
			...(voices ? (['voices'] as const) : [])
		];
	}

	/** Use a skin's sounds: whatever is playing stops, and the new music starts. */
	setSkin(skin: LoadedSkin) {
		this.#hush();
		this.#audio = skin.manifest.audio;
		this.#emotes = skin.manifest.emotes;
		this.#base = skin.baseUrl;
		this.#lastVariation = {};
		this.#mixer.setMusic(this.#audio?.music.map((p) => this.#url(p)) ?? null);
		this.#prefetch();
	}

	setVolumes(volumes: Volumes) {
		for (const category of CATEGORIES) this.#mixer.setVolume(category, volumes[category]);
		if (volumes.voices === 0) this.#hush();
		this.#volumes = { ...volumes };
		this.#prefetch();
	}

	/**
	 * Unlock audio on the first press or key, and pause the music while the page is hidden.
	 * Returns the cleanup.
	 */
	attach(): () => void {
		// Every press resumes audio the browser may have suspended; the first also fetches the voices.
		const unlock = () => {
			const first = !this.#mixer.unlocked;
			this.#mixer.unlock();
			if (first) this.#prefetch();
		};
		const visibility = () => this.#mixer.setHidden(document.hidden);
		// A label's click also clicks its input, in the same task: one sound for the two.
		let clicked = false;
		const click = (e: MouseEvent) => {
			if (clicked || !isControl(e.target)) return;
			clicked = true;
			setTimeout(() => (clicked = false));
			this.#sfx('click');
		};
		const options = { capture: true, passive: true };
		// A touch's pointerdown isn't a user gesture (HTML's activation-triggering events), and
		// iOS won't start audio from one, so its pointerup and touchend unlock too.
		for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, options);
		window.addEventListener('click', click, options);
		document.addEventListener('visibilitychange', visibility);
		visibility();
		return () => {
			for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, options);
			window.removeEventListener('click', click, options);
			document.removeEventListener('visibilitychange', visibility);
			this.#hush();
			this.#mixer.setMusic(null);
		};
	}

	/**
	 * A move was played: its SFX, and perhaps a voice line. A line still being said plays on; its
	 * bubble goes if its speaker moved or was taken.
	 */
	move(move: Move, context: MoveContext) {
		const shown = this.#shown?.square;
		if (shown && pieceOn(move.before, shown) !== pieceOn(move.after, shown)) this.#hideBubble();
		this.#sfx(moveSfx(move, context.result));
		if (this.#volumes.voices === 0) return; // a muted taunt shouldn't start its wait
		const lines = this.#director.move(move, context);
		if (lines.length > 0) this.#say(lines);
	}

	/** A side resigned: the game-end SFX and that side's king (on `square`) conceding. */
	resign(side: Color, square?: Square) {
		this.#hideBubble();
		this.#sfx('checkmate');
		if (this.#volumes.voices > 0) this.#say(this.#director.resign(side, square));
	}

	undo() {
		this.#hush();
		this.#sfx('move');
	}

	newGame() {
		this.#hush();
		this.#sfx('start');
	}

	select() {
		this.#sfx('select');
	}

	illegal() {
		this.#sfx('illegal');
	}

	#sfx(name: SfxName) {
		this.haptics.play(name);
		const path = this.#audio?.sfx[name];
		if (path) void this.#mixer.playSfx(this.#url(path));
	}

	async #say(lines: Line[]) {
		const urls = lines.map((line) => {
			const pool = this.#pool(line);
			return this.#url(pool[this.#vary(`${line.side}${line.piece}-${line.event}`, pool.length)]);
		});
		const timings = await this.#mixer.playVoices(urls);
		timings.forEach((timing, i) => this.#bubble(lines[i], timing));
	}

	/** A variation for a pool of `size`, not the one it gave last time if there is a choice. */
	#vary(key: string, size: number): number {
		const i = pickVariation(size, this.#lastVariation[key], Math.random);
		this.#lastVariation[key] = i;
		return i;
	}

	/** Show a bubble over a line's speaker while it is said, if the skin has one for it. */
	#bubble({ square, event }: Line, { start, duration }: Timing) {
		const cells = this.#emotes?.events[event as BubbleEvent];
		if (!square || !cells) return;
		const bubble: Bubble = { square, emote: cells[this.#vary(`emote-${event}`, cells.length)] };
		const at = (seconds: number, then: () => void) =>
			this.#bubbleTimers.push(setTimeout(then, seconds * 1000));
		at(start, () => this.onbubble((this.#shown = bubble)));
		// Unless the next line's bubble has taken its place.
		at(start + duration + BUBBLE_LINGER_MS / 1000, () => {
			if (this.#shown !== bubble) return;
			this.#shown = null;
			this.onbubble(null);
		});
	}

	#hideBubble() {
		this.#bubbleTimers.forEach(clearTimeout);
		this.#bubbleTimers = [];
		this.#shown = null;
		this.onbubble(null);
	}

	/** Stop speaking, bubble and all. */
	#hush() {
		this.#mixer.stopVoices();
		this.#hideBubble();
	}

	#pool({ side, piece, event }: Line): string[] {
		return this.#audio?.voices[side][piece]?.[event] ?? [];
	}

	#url(path: string): string {
		return new URL(path, this.#base).href;
	}

	/**
	 * Fetch the short sounds of every category that is turned up, ready to play: the few SFX
	 * at once, the many voice lines only once sound is unlocked, since nothing plays before.
	 */
	#prefetch() {
		const audio = this.#audio;
		if (!audio) return;
		const paths: string[] = [];
		if (this.#volumes.sfx > 0) paths.push(...Object.values(audio.sfx));
		if (this.#volumes.voices > 0 && this.#mixer.unlocked)
			for (const byPiece of Object.values(audio.voices))
				for (const byEvent of Object.values(byPiece))
					for (const pool of Object.values(byEvent)) paths.push(...pool);
		this.#mixer.prefetch(paths.map((p) => this.#url(p)));
	}
}
