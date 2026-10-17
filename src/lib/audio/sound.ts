// The game's sound (§4.11): turns game events into SFX and voice lines from the active skin,
// and keeps the mixer's volumes, playlist and unlock in step with the page.
import type { Color, Move } from 'chess.js';
import type { LoadedSkin } from '#lib/skins/loader.ts';
import type { SfxName, SkinAudio } from '#lib/skins/schema.ts';
import { Mixer, type Category, type Volumes } from './mixer.ts';
import { moveSfx } from './sfx.ts';
import { pickVariation, VoiceDirector, type Line, type MoveContext } from './voices.ts';

export type { Volumes };

export class Sound {
	#mixer = new Mixer();
	#audio: SkinAudio | null = null;
	#base = '';
	#volumes: Volumes = { music: 0, sfx: 0, voices: 0 };
	/** The variation played last per pool, so a line doesn't repeat straight away. */
	#lastVariation: Record<string, number> = {};
	#director = new VoiceDirector((line) => this.#pool(line).length > 0);

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
		this.#mixer.stopVoices();
		this.#audio = skin.manifest.audio;
		this.#base = skin.baseUrl;
		this.#lastVariation = {};
		this.#mixer.setMusic(this.#audio?.music.map((p) => this.#url(p)) ?? null);
		this.#prefetch();
	}

	setVolumes(volumes: Volumes) {
		for (const category of ['music', 'sfx', 'voices'] as const)
			this.#mixer.setVolume(category, volumes[category]);
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
		const options = { capture: true, passive: true };
		window.addEventListener('pointerdown', unlock, options);
		window.addEventListener('keydown', unlock, options);
		document.addEventListener('visibilitychange', visibility);
		visibility();
		return () => {
			window.removeEventListener('pointerdown', unlock, options);
			window.removeEventListener('keydown', unlock, options);
			document.removeEventListener('visibilitychange', visibility);
			this.#mixer.stopVoices();
			this.#mixer.setMusic(null);
		};
	}

	/** A move was played: its SFX, and perhaps a voice line (or a capture and its answer). */
	move(move: Move, context: MoveContext) {
		this.#sfx(moveSfx(move, context.result));
		if (this.#volumes.voices === 0) return; // a muted line shouldn't start the cooldown
		const lines = this.#director.move(move, context);
		if (lines.length > 0) this.#say(lines);
	}

	/** A side resigned: the game-end SFX and that side's king conceding. */
	resign(side: Color) {
		this.#sfx('checkmate');
		if (this.#volumes.voices > 0) this.#say(this.#director.resign(side));
	}

	undo() {
		this.#mixer.stopVoices();
		this.#sfx('move');
	}

	newGame() {
		this.#mixer.stopVoices();
		this.#sfx('start');
	}

	select() {
		this.#sfx('select');
	}

	illegal() {
		this.#sfx('illegal');
	}

	#sfx(name: SfxName) {
		const path = this.#audio?.sfx[name];
		if (path) void this.#mixer.playSfx(this.#url(path));
	}

	#say(lines: Line[]) {
		const urls = lines.map((line) => {
			const pool = this.#pool(line);
			const key = `${line.side}${line.piece}-${line.event}`;
			const i = pickVariation(pool.length, this.#lastVariation[key], Math.random);
			this.#lastVariation[key] = i;
			return this.#url(pool[i]);
		});
		void this.#mixer.playVoices(urls);
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
