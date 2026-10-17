// Audio output (§4.11): Web Audio with one gain per category. SFX and voices are short, so
// they are fetched early and decoded into buffers; music streams through an <audio> element
// routed into its gain, so only the playing track is downloaded. Nothing sounds until the
// first press or key (browser autoplay rules), when `unlock` creates the AudioContext.
import { Playlist } from './playlist.ts';

export type Category = 'music' | 'sfx' | 'voices';
export type Volumes = Record<Category, number>;

/** Time constant of volume changes, in seconds: quick, but without clicks. */
const RAMP = 0.015;
/** Music level while a voice speaks. */
const DUCK = 0.5;
/** Pause between a capture line and its answer, in seconds. */
const ANSWER_GAP = 0.15;
/** A voice cut off by a newer one fades over this long, in seconds. */
const VOICE_FADE = 0.08;
/** A sound still loading after this long (ms) is dropped rather than played late. */
const MAX_LATE_MS = { sfx: 250, voices: 1000 }; // a line is commentary, so it can wait a little
/** Prefetches running at once, so a page load doesn't flood the server. */
const FETCHES = 4;
/** Music turned down to 0 pauses after its fade, in ms. */
const MUSIC_PAUSE_MS = 300;

/** Slider position to gain: squared, so the slider feels even to the ear. */
const gainOf = (volume: number) => volume * volume;

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
	#voice: Utterance | null = null;
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
			for (const category of ['music', 'sfx', 'voices'] as const) {
				const gain = ctx.createGain();
				gain.gain.value = gainOf(this.#volumes[category]);
				gain.connect(master);
				this.#gains[category] = gain;
			}
			this.#duck = ctx.createGain();
			this.#duck.connect(this.#gains.music!);
			this.#ctx = ctx;
		}
		if (this.#ctx.state === 'suspended') void this.#ctx.resume();
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
		const asked = performance.now();
		const buffer = await this.#buffer(url);
		if (!buffer || performance.now() - asked > MAX_LATE_MS.sfx) return;
		this.#source(buffer, this.#gains.sfx!).start();
	}

	/**
	 * Say these lines in order, cutting off whatever is being said. The music dips while
	 * they play.
	 */
	async playVoices(urls: string[]) {
		const seq = ++this.#voiceSeq;
		this.stopVoices();
		if (!this.#ctx || this.#volumes.voices === 0 || urls.length === 0) return;
		const asked = performance.now();
		const buffers = await Promise.all(urls.map((u) => this.#buffer(u)));
		if (seq !== this.#voiceSeq || performance.now() - asked > MAX_LATE_MS.voices) return;
		const ctx = this.#ctx;
		const gain = ctx.createGain();
		gain.connect(this.#gains.voices!);
		const sources: AudioBufferSourceNode[] = [];
		let at = ctx.currentTime;
		for (const buffer of buffers) {
			if (!buffer) break; // an answer without its line makes no sense
			const source = this.#source(buffer, gain);
			source.start(at);
			sources.push(source);
			at += buffer.duration + ANSWER_GAP;
		}
		if (sources.length === 0) return;
		const end = at - ANSWER_GAP;
		this.#voice = { sources, gain, end };
		this.#duckMusic(ctx.currentTime, end);
		sources.at(-1)!.onended = () => {
			if (this.#voice?.gain === gain) this.#voice = null;
		};
	}

	/** Cut off the current voice with a short fade. */
	stopVoices() {
		const voice = this.#voice;
		const ctx = this.#ctx;
		this.#voice = null;
		if (!voice || !ctx) return;
		const now = ctx.currentTime;
		voice.gain.gain.setTargetAtTime(0, now, VOICE_FADE / 3);
		for (const s of voice.sources) s.stop(now + VOICE_FADE);
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
