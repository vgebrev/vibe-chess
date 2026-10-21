import { describe, expect, it } from 'vitest';
import { seeded } from '#lib/testing/random.ts';
import { Playlist, Shuffler, shuffle } from './playlist.ts';

const TRACKS = ['a', 'b', 'c', 'd', 'e'];

/** Random numbers from a script, then 0.99. */
const rolls =
	(...values: number[]) =>
	() =>
		values.shift() ?? 0.99;

describe('Playlist (§4.11)', () => {
	it('shuffles every track exactly once', () => {
		const out = shuffle(TRACKS, seeded(1));
		expect([...out].sort()).toEqual(TRACKS);
		expect(TRACKS).toEqual(['a', 'b', 'c', 'd', 'e']); // the input is left alone
		expect(shuffle(TRACKS, () => 0)).toEqual(TRACKS); // with every roll 0, in order
	});

	it('plays the shuffled order, then loops it', () => {
		const playlist = new Playlist(TRACKS, seeded(7));
		const first = Array.from({ length: 5 }, () => playlist.next());
		expect(first).toEqual(playlist.tracks);
		expect(playlist.next()).toBe(first[0]);
	});

	it('has nothing to play without tracks', () => {
		expect(new Playlist([]).next()).toBeNull();
	});
});

describe('Shuffler (§4.11)', () => {
	it("plays all of a pool's variations before any repeats, then reshuffles", () => {
		const shuffler = new Shuffler();
		for (let round = 0; round < 5; round++) {
			const seen = Array.from({ length: 6 }, () => shuffler.next('pool', 6));
			expect(seen.toSorted()).toEqual([0, 1, 2, 3, 4, 5]);
		}
	});

	it('never starts a new round with the one played last', () => {
		// Unshuffled (rolls 0) at first: 0, 1, 2. Then 2, 1, 0, which would repeat the 2, so the
		// 2 goes to the back.
		const shuffler = new Shuffler(rolls(0, 0, 0.99, 0));
		const seen = Array.from({ length: 6 }, () => shuffler.next('pool', 3));
		expect(seen).toEqual([0, 1, 2, 1, 0, 2]);
		expect(Array.from({ length: 3 }, () => shuffler.next('one', 1))).toEqual([0, 0, 0]);
	});

	it('keeps pools apart, and starts them afresh on reset', () => {
		const shuffler = new Shuffler(() => 0);
		expect([shuffler.next('a', 3), shuffler.next('b', 3), shuffler.next('a', 3)]).toEqual([
			0, 0, 1
		]);
		shuffler.reset();
		expect(shuffler.next('a', 3)).toBe(0);
	});
});
