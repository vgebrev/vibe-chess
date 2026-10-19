// The game's sound (§4.11): turns game events into SFX and voice lines from the active skin,
// and keeps the mixer's volumes, playlist and unlock in step with the page. Every SFX event
// also gives haptic feedback (§4.12), so the two can't drift apart.
import type { Color, Move, Square } from 'chess.js';
import { Haptics } from '#lib/haptics.ts';
import type { BubbleEvent, Emotes, SfxName, SkinAudio, SkinManifest } from '#lib/skins/schema.ts';
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
	#onbubble: (bubble: Bubble | null) => void;
	#shown: Bubble | null = null;
	/** Each bubble still to show or showing, with the timers that show and hide it. */
	#bubbles = new Map<Bubble, ReturnType<typeof setTimeout>[]>();
	/** The variation played last per pool, so a line doesn't repeat straight away. */
	#lastVariation: Record<string, number> = {};
	#director = new VoiceDirector((line) => this.#pool(line).length > 0);
	/** The taunt being said (or about to be), and how to stop waiting for it. */
	#taunt: { done: Promise<void>; end: () => void } | null = null;

	constructor(onbubble: (bubble: Bubble | null) => void = () => {}) {
		this.#onbubble = onbubble;
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
	setSkin(skin: SkinManifest) {
		this.#hush();
		this.#audio = skin.audio;
		this.#emotes = skin.emotes;
		this.#lastVariation = {};
		this.#mixer.setMusic(this.#audio?.music ?? null);
		this.#prefetch();
	}

	setVolumes(volumes: Volumes) {
		for (const category of CATEGORIES) this.#mixer.setVolume(category, volumes[category]);
		if (volumes.voices === 0) this.#hush();
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
	 * A move was played: its SFX, and perhaps voice lines. A line still being said (or yet to be,
	 * after another) plays on; its bubble goes, or never comes, if its speaker moved or was taken.
	 */
	move(move: Move, context: MoveContext) {
		for (const bubble of this.#bubbles.keys()) {
			const { square } = bubble;
			if (pieceOn(move.before, square) !== pieceOn(move.after, square)) this.#dropBubble(bubble);
		}
		this.#sfx(moveSfx(move, context.result));
		if (this.#mixer.volume('voices') === 0) return; // muted moves don't count towards a taunt
		const lines = this.#director.move(move, context);
		if (lines.length === 0) return;
		const said = this.#say(lines);
		if (lines.at(-1)?.event === 'taunt') this.#waitForTaunt(said, lines.length - 1);
	}

	/**
	 * Resolves once the computer's taunt, if one is being said or about to be, has ended, so its
	 * reply doesn't come over it and sound like the computer answering itself (§4.11).
	 */
	afterTaunt(): Promise<void> {
		return this.#taunt?.done ?? Promise.resolve();
	}

	/** A side resigned: the game-end SFX and that side's king (on `square`) conceding. */
	resign(side: Color, square?: Square) {
		this.#hideBubble();
		this.#sfx('checkmate');
		if (this.#mixer.volume('voices') > 0) this.#say(this.#director.resign(side, square));
	}

	undo() {
		this.#hush();
		this.#sfx('move');
	}

	newGame() {
		this.#hush();
		this.#director.reset();
		this.#sfx('start');
	}

	select() {
		this.#sfx('select');
	}

	/**
	 * A sample of a category at its volume, just set in Settings: a move's SFX, or any one of
	 * the skin's voice lines, cutting off the last sample. The music is its own sample.
	 */
	preview(category: Category) {
		if (category === 'sfx') {
			const url = this.#audio?.sfx.move;
			if (url) void this.#mixer.playSfx(url);
		} else if (category === 'voices') {
			this.#hush();
			const urls = this.#voiceUrls();
			if (urls.length > 0)
				void this.#mixer.playVoices([urls[Math.floor(Math.random() * urls.length)]]);
		}
	}

	illegal() {
		this.#sfx('illegal');
	}

	#sfx(name: SfxName) {
		this.haptics.play(name);
		const url = this.#audio?.sfx[name];
		if (url) void this.#mixer.playSfx(url);
	}

	/** Say lines one after another; resolves with when each starts and how long it lasts. */
	async #say(lines: Line[]): Promise<Timing[]> {
		const urls = lines.map((line) => {
			const pool = this.#pool(line);
			return pool[this.#vary(`${line.side}${line.piece}-${line.event}`, pool.length)];
		});
		const timings = await this.#mixer.playVoices(urls);
		timings.forEach((timing, i) => this.#bubble(lines[i], timing));
		return timings;
	}

	/** Hold `afterTaunt` until line `index` of those being said ends, or doesn't play. */
	#waitForTaunt(said: Promise<Timing[]>, index: number) {
		this.#taunt?.end();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let resolve!: () => void;
		const taunt = {
			done: new Promise<void>((r) => (resolve = r)),
			end: () => {
				clearTimeout(timer);
				if (this.#taunt === taunt) this.#taunt = null;
				resolve();
			}
		};
		this.#taunt = taunt;
		void said.then((timings) => {
			const timing = timings[index];
			if (!timing || this.#taunt !== taunt) return taunt.end();
			timer = setTimeout(taunt.end, (timing.start + timing.duration) * 1000);
		});
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
		const at = (seconds: number, then: () => void) => setTimeout(then, seconds * 1000);
		this.#bubbles.set(bubble, [
			at(start, () => this.#onbubble((this.#shown = bubble))),
			at(start + duration + BUBBLE_LINGER_MS / 1000, () => this.#dropBubble(bubble))
		]);
	}

	/** Take a bubble away, or keep it from showing. */
	#dropBubble(bubble: Bubble) {
		this.#bubbles.get(bubble)?.forEach(clearTimeout);
		this.#bubbles.delete(bubble);
		// Unless the next line's bubble has taken its place.
		if (this.#shown !== bubble) return;
		this.#shown = null;
		this.#onbubble(null);
	}

	#hideBubble() {
		this.#bubbles.forEach((timers) => timers.forEach(clearTimeout));
		this.#bubbles.clear();
		this.#shown = null;
		this.#onbubble(null);
	}

	/** Stop speaking, bubble and all. */
	#hush() {
		this.#mixer.stopVoices();
		this.#hideBubble();
		this.#taunt?.end();
	}

	#pool({ side, piece, event }: Line): string[] {
		return this.#audio?.voices[side][piece]?.[event] ?? [];
	}

	/**
	 * Fetch the short sounds of every category that is turned up, ready to play: the few SFX
	 * at once, the many voice lines only once sound is unlocked, since nothing plays before.
	 */
	#prefetch() {
		const audio = this.#audio;
		if (!audio) return;
		const mixer = this.#mixer;
		const urls: string[] = [];
		if (mixer.volume('sfx') > 0) urls.push(...Object.values(audio.sfx));
		if (mixer.volume('voices') > 0 && mixer.unlocked) urls.push(...this.#voiceUrls());
		mixer.prefetch(urls);
	}

	/** Every voice line the skin has. */
	#voiceUrls(): string[] {
		const voices = this.#audio?.voices ?? { w: {}, b: {} };
		return Object.values(voices).flatMap((byPiece) =>
			Object.values(byPiece).flatMap((byEvent) => Object.values(byEvent).flat())
		);
	}
}
