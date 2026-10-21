// Play orders (§4.11): the music's tracks shuffled once per session, then played in that order
// and looped; each voice pool's variations in shuffled rounds.

/** A Fisher–Yates shuffle into a new array (with every roll 0, in order). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = 0; i < out.length - 1; i++) {
		const j = i + Math.floor(random() * (out.length - i));
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

/**
 * Which variation of a pool plays next: each pool's are said in a shuffled order, all of them
 * before any comes again; then they are reshuffled, never starting with the one said last.
 * Pools are told apart by a key.
 */
export class Shuffler {
	#decks = new Map<string, { order: number[]; last?: number }>();
	#random: () => number;

	constructor(random: () => number = Math.random) {
		this.#random = random;
	}

	/** The next variation of the pool `key`, of `size`. */
	next(key: string, size: number): number {
		let deck = this.#decks.get(key);
		if (!deck) this.#decks.set(key, (deck = { order: [] }));
		if (deck.order.length === 0) {
			deck.order = shuffle(
				Array.from({ length: size }, (_, i) => i),
				this.#random
			);
			if (size > 1 && deck.order[0] === deck.last) deck.order.push(deck.order.shift()!);
		}
		deck.last = deck.order.shift()!;
		return deck.last;
	}

	/** Start every pool afresh, as for a new game or skin. */
	reset() {
		this.#decks.clear();
	}
}
