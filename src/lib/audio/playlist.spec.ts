import { describe, expect, it } from 'vitest';
import { seeded } from '#lib/engine/thinkTime.ts';
import { Playlist, shuffle } from './playlist.ts';

const TRACKS = ['a', 'b', 'c', 'd', 'e'];

describe('Playlist (§4.11)', () => {
	it('shuffles every track exactly once', () => {
		const out = shuffle(TRACKS, seeded(1));
		expect([...out].sort()).toEqual(TRACKS);
		expect(TRACKS).toEqual(['a', 'b', 'c', 'd', 'e']); // the input is left alone
	});

	it('plays the shuffled order, then loops it', () => {
		const playlist = new Playlist(TRACKS, seeded(7));
		const first = Array.from({ length: 5 }, () => playlist.next());
		expect(first).toEqual(playlist.tracks);
		expect(playlist.next()).toBe(first[0]);
		expect(playlist.current).toBe(first[0]);
	});

	it('has nothing to play without tracks', () => {
		expect(new Playlist([]).next()).toBeNull();
	});
});
