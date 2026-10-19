// The music order (§4.11): the skin's tracks shuffled once per session, then played in that
// order and looped.

/** A Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export class Playlist {
	readonly tracks: readonly string[];
	#index = -1;

	constructor(tracks: readonly string[], random: () => number = Math.random) {
		this.tracks = shuffle(tracks, random);
	}

	/** The track after the current one, looping; null for an empty playlist. */
	next(): string | null {
		if (this.tracks.length === 0) return null;
		this.#index = (this.#index + 1) % this.tracks.length;
		return this.tracks[this.#index];
	}
}
