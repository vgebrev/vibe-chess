import { DEFAULT_POSITION } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_SETTINGS,
	GAME_KEY,
	loadGame,
	loadSettings,
	parseDifficulty,
	saveGame,
	saveSettings,
	SETTINGS_KEY,
	type SavedGame
} from './persistence.ts';

/** A Map-backed stand-in for localStorage. */
function memoryStorage() {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key)
	};
}

const game: SavedGame = {
	startFen: DEFAULT_POSITION,
	moves: [
		{ from: 'e2', to: 'e4' },
		{ from: 'a7', to: 'a8', promotion: 'q' }
	],
	resigned: null,
	setup: { mode: 'computer', color: 'random', difficulty: { kind: 'custom', elo: 1800 } },
	human: 'b',
	orientation: 'black'
};

afterEach(() => vi.unstubAllGlobals());

describe('persistence (§4.9)', () => {
	it('round-trips the game and the settings', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		const settings = { ...DEFAULT_SETTINGS, skinId: 'pirate', autoFlip: true };
		saveGame(game);
		saveSettings(settings);
		expect(loadGame()).toEqual(game);
		expect(loadSettings()).toEqual(settings);
	});

	it('falls back to defaults with nothing stored', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		expect(loadGame()).toBeNull();
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('works when storage is missing or throws', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});
		expect(() => saveGame(game)).not.toThrow();
		expect(loadGame()).toBeNull();
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS);

		vi.stubGlobal('localStorage', undefined);
		expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps sound volumes in [0, 1], each falling back on its own', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		storage.setItem(
			'chess:settings:v1',
			JSON.stringify({ sound: { music: 0, sfx: 1.5, voices: 'loud' } })
		);
		expect(loadSettings().sound).toEqual({ music: 0, sfx: 0.8, voices: 1 });
	});

	it('keeps the volumes to unmute to above 0', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		storage.setItem(
			'chess:settings:v1',
			JSON.stringify({ unmuted: { music: 0.25, sfx: 0, voices: 2 } })
		);
		expect(loadSettings().unmuted).toEqual({ music: 0.25, sfx: 0.8, voices: 1 });
	});

	it('drops a malformed game', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		for (const bad of [
			'not json',
			JSON.stringify({ ...game, moves: [{ from: 'e2', to: 'z9' }] }),
			JSON.stringify({ ...game, moves: [{ from: 'a7', to: 'a8', promotion: 'k' }] }),
			JSON.stringify({ ...game, human: 'x' }),
			JSON.stringify({ ...game, setup: { ...game.setup, mode: 'online' } }),
			JSON.stringify({ ...game, orientation: undefined })
		]) {
			storage.items.set(GAME_KEY, bad);
			expect(loadGame(), bad).toBeNull();
		}
	});

	it('keeps the good settings and defaults the bad ones', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		storage.items.set(
			SETTINGS_KEY,
			JSON.stringify({ skinId: 'pirate', showCoordinates: 'yes', lastDifficulty: { kind: 'x' } })
		);
		expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, skinId: 'pirate' });
	});

	it('validates difficulties, snapping a custom Elo', () => {
		expect(parseDifficulty({ kind: 'preset', id: 'p3' })).toEqual({ kind: 'preset', id: 'p3' });
		expect(parseDifficulty({ kind: 'preset', id: 'p9' })).toBeNull();
		expect(parseDifficulty({ kind: 'custom', elo: 1777 })).toEqual({ kind: 'custom', elo: 1800 });
		expect(parseDifficulty({ kind: 'custom', elo: 'high' })).toBeNull();
	});
});
