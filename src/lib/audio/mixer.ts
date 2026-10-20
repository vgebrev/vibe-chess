// Audio output (§4.11): Web Audio with one gain per category. SFX and voices are short, so
// they are fetched early and decoded into buffers; music streams through an <audio> element
// routed into its gain, so only the playing track is downloaded. Nothing sounds until the
// first press or key (browser autoplay rules), when `unlock` creates the AudioContext.
import { Playlist } from './playlist.ts';

export const CATEGORIES = ['music', 'sfx', 'voices'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Volumes = Record<Category, number>;

/** Time constant of volume changes, in seconds: quick, but without clicks. */
const RAMP = 0.015;
/** Music level while a voice speaks. */
const DUCK = 0.5;
/** Pause between a player's line and the taunt answering it, in seconds. */
export const ANSWER_GAP = 0.15;
/** A voice cut off (undo, a new game, …) fades over this long, in seconds. */
const VOICE_FADE = 0.08;
/** A sound still loading after this long (ms) is dropped rather than played late. */
const MAX_LATE_MS = { sfx: 250, voices: 1000 }; // a line is commentary, so it can wait a little
/**
 * How long a sound waits for the audio context to start (ms): a new context can take a few
 * hundred ms to open the device, and iOS only starts it on the first tap's touchend.
 */
const START_WAIT_MS = 1000;
/** Prefetches running at once, so a page load doesn't flood the server. */
const FETCHES = 4;
/** Music turned down to 0 pauses after its fade, in ms. */
const MUSIC_PAUSE_MS = 300;

/** Slider position to gain: squared, so the slider feels even to the ear. */
const gainOf = (volume: number) => volume * volume;

/** When a line plays, in seconds from when it was asked for. */
export interface Timing {
	start: number;
	duration: number;
}

interface Utterance {
	sources: AudioBufferSourceNode[];
	gain: GainNode;
	end: number;
}

export class Mixer {
	#ctx: AudioContext | null = null;
	#gains: Partial<Record<Category, GainNode>> = {};
	#duck: GainNode | null = null;
	#volumes: Volumes = { music: 0, sfx: 0, voices: 0 };
	// Fetched before the first interaction, decoded once there is a context.
	#bytes = new Map<string, Promise<ArrayBuffer | null>>();
	#queue = new Set<string>();
	#fetching = 0;
	#buffers = new Map<string, Promise<AudioBuffer | null>>();
	/** The lines being said: they overlap rather than cut each other off. */
	#voices = new Set<Utterance>();
	#voiceSeq = 0;
	#music: HTMLAudioElement | null = null;
	#playlist: Playlist | null = null;
	#musicFailures = 0;
	#pauseTimer: ReturnType<typeof setTimeout> | undefined;
	#hidden = false;

	get unlocked(): boolean {
		return this.#ctx !== null;
	}

	/** Create (or resume) the audio context; call from a user gesture. */
	unlock() {
		if (!this.#ctx) {
			const ctx = new AudioContext();
			const master = ctx.destination;
			for (const category of CATEGORIES) {
				const gain = ctx.createGain();
				gain.gain.value = gainOf(this.#volumes[category]);
				gain.connect(master);
				this.#gains[category] = gain;
			}
			this.#duck = ctx.createGain();
			this.#duck.connect(this.#gains.music!);
			this.#ctx = ctx;
		}
		// iOS also leaves it 'interrupted' after a call or a switch to another app.
		if (this.#ctx.state !== 'running') void this.#ctx.resume().catch(() => {});
		this.#updateMusic();
	}

	/** Queue sounds to fetch in the background, a few at a time, so they are ready to play. */
	prefetch(urls: Iterable<string>) {
		for (const url of urls) if (!this.#bytes.has(url)) this.#queue.add(url);
		this.#pump();
	}

	#pump() {
		for (const url of this.#queue) {
			if (this.#fetching >= FETCHES) return;
			this.#fetching++;
			void this.#fetch(url).finally(() => {
				this.#fetching--;
				this.#pump();
			});
		}
	}

	/** The bytes of a sound, fetched now if they haven't been (jumping the queue). */
	#fetch(url: string): Promise<ArrayBuffer | null> {
		let bytes = this.#bytes.get(url);
		if (!bytes) {
			this.#queue.delete(url);
			bytes = fetch(url)
				.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
				.catch((e) => {
					console.warn(`[sound] could not load ${url}: ${(e as Error).message}`);
					return null;
				});
			this.#bytes.set(url, bytes);
		}
		return bytes;
	}

	volume(category: Category): number {
		return this.#volumes[category];
	}

	setVolume(category: Category, volume: number) {
		this.#volumes[category] = volume;
		const gain = this.#gains[category];
		if (gain && this.#ctx) gain.gain.setTargetAtTime(gainOf(volume), this.#ctx.currentTime, RAMP);
		if (category === 'voices' && volume === 0) this.stopVoices();
		if (category === 'music') this.#updateMusic();
	}

	/** Play a short sound once. */
	async playSfx(url: string) {
		if (!this.#ctx || this.#volumes.sfx === 0) return;
		const pending = this.#buffer(url);
		const asked = await this.#started(this.#ctx);
		if (asked === null) return;
		const buffer = await pending;
		if (!buffer || performance.now() - asked > MAX_LATE_MS.sfx) return;
		this.#source(buffer, this.#gains.sfx!).start();
	}

	/**
	 * Say these lines in order, `delay` seconds from now, over whatever is already being said
	 * (which plays on to its end). The music dips while any line plays. Resolves to when each line
	 * that plays starts and how long it lasts, in seconds from now (fewer than asked, or none, if
	 * some can't play).
	 */
	async playVoices(urls: string[], delay = 0): Promise<Timing[]> {
		const seq = this.#voiceSeq;
		if (!this.#ctx || this.#volumes.voices === 0 || urls.length === 0) return [];
		const pending = Promise.all(urls.map((u) => this.#buffer(u)));
		const asked = await this.#started(this.#ctx);
		if (asked === null) return [];
		const buffers = await pending;
		if (seq !== this.#voiceSeq || performance.now() - asked > MAX_LATE_MS.voices) return [];
		const ctx = this.#ctx;
		const gain = ctx.createGain();
		gain.connect(this.#gains.voices!);
		const sources: AudioBufferSourceNode[] = [];
		const timings: Timing[] = [];
		const now = ctx.currentTime;
		let at = now + delay;
		for (const buffer of buffers) {
			if (!buffer) break; // an answer without its line makes no sense
			const source = this.#source(buffer, gain);
			source.start(at);
			sources.push(source);
			timings.push({ start: at - now, duration: buffer.duration });
			at += buffer.duration + ANSWER_GAP;
		}
		if (sources.length === 0) return [];
		const voice = { sources, gain, end: at - ANSWER_GAP };
		this.#voices.add(voice);
		this.#duckMusic(now, Math.max(...[...this.#voices].map((v) => v.end)));
		sources.at(-1)!.onended = () => this.#voices.delete(voice);
		return timings;
	}

	/** Cut off every line being said with a short fade, and any still loading. */
	stopVoices() {
		this.#voiceSeq++;
		const ctx = this.#ctx;
		const voices = [...this.#voices];
		this.#voices.clear();
		if (voices.length === 0 || !ctx) return;
		const now = ctx.currentTime;
		for (const voice of voices) {
			voice.gain.gain.setTargetAtTime(0, now, VOICE_FADE / 3);
			for (const s of voice.sources) s.stop(now + VOICE_FADE);
		}
		this.#duckMusic(now, now);
	}

	/** Replace the playlist (a new skin); null or empty for none. */
	setMusic(tracks: string[] | null) {
		this.#playlist = tracks && tracks.length > 0 ? new Playlist(tracks) : null;
		this.#musicFailures = 0;
		if (this.#music) {
			this.#music.pause();
			this.#music.removeAttribute('src');
		}
		this.#updateMusic();
	}

	/** The page was hidden or shown: music pauses while it is hidden. */
	setHidden(hidden: boolean) {
		this.#hidden = hidden;
		this.#updateMusic();
	}

	/**
	 * When the context is running, as a `performance.now()` time to measure lateness from, so its
	 * start-up isn't counted; null if it doesn't start within START_WAIT_MS.
	 */
	#started(ctx: AudioContext): Promise<number | null> {
		if (ctx.state === 'running') return Promise.resolve(performance.now());
		return new Promise((resolve) => {
			const done = (running: boolean) => {
				clearTimeout(timer);
				ctx.removeEventListener('statechange', check);
				resolve(running ? performance.now() : null);
			};
			const check = () => {
				if (ctx.state === 'running') done(true);
			};
			const timer = setTimeout(() => done(false), START_WAIT_MS);
			ctx.addEventListener('statechange', check);
		});
	}

	#source(buffer: AudioBuffer, destination: AudioNode): AudioBufferSourceNode {
		const source = this.#ctx!.createBufferSource();
		source.buffer = buffer;
		source.connect(destination);
		return source;
	}

	#buffer(url: string): Promise<AudioBuffer | null> {
		let buffer = this.#buffers.get(url);
		if (!buffer) {
			const ctx = this.#ctx!;
			buffer = this.#fetch(url).then((bytes) =>
				// decodeAudioData detaches its input, so decode a copy and keep the bytes.
				bytes
					? ctx.decodeAudioData(bytes.slice(0)).catch(() => {
							console.warn(`[sound] could not decode ${url}`);
							return null;
						})
					: null
			);
			this.#buffers.set(url, buffer);
		}
		return buffer;
	}

	#duckMusic(from: number, until: number) {
		const duck = this.#duck?.gain;
		if (!duck) return;
		duck.cancelScheduledValues(from);
		duck.setTargetAtTime(until > from ? DUCK : 1, from, RAMP * 4);
		if (until > from) duck.setTargetAtTime(1, until, RAMP * 8);
	}

	/** Play or pause the music to match the volume, visibility and playlist. */
	#updateMusic() {
		clearTimeout(this.#pauseTimer);
		const ctx = this.#ctx;
		const playlist = this.#playlist;
		if (!ctx || !playlist) return;
		const element = this.#music;
		if (this.#volumes.music === 0 || this.#hidden) {
			// Let the gain fade out first; a hidden page pauses at once.
			if (element && !element.paused) {
				if (this.#hidden) element.pause();
				else this.#pauseTimer = setTimeout(() => element.pause(), MUSIC_PAUSE_MS);
			}
			return;
		}
		const music = element ?? this.#createMusic(ctx);
		if (!music.getAttribute('src')) music.src = playlist.next()!;
		if (music.paused) music.play().catch(() => {}); // a refused play() retries on the next unlock
	}

	#createMusic(ctx: AudioContext): HTMLAudioElement {
		const music = new Audio();
		music.preload = 'auto';
		ctx.createMediaElementSource(music).connect(this.#duck!);
		music.onended = () => this.#nextTrack();
		music.onplaying = () => (this.#musicFailures = 0);
		music.onerror = () => {
			console.warn(`[sound] could not play ${music.src}`);
			// Skip a broken track, but don't spin if every track fails.
			if (++this.#musicFailures < (this.#playlist?.tracks.length ?? 0)) this.#nextTrack();
		};
		this.#music = music;
		return music;
	}

	#nextTrack() {
		const music = this.#music;
		const next = this.#playlist?.next();
		if (!music || !next) return;
		music.src = next;
		this.#updateMusic();
	}
}
