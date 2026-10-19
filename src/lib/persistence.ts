// Persistence (§4.9): the current game and the settings in localStorage. Every read and
// write is guarded, and anything missing or malformed falls back to the defaults, so the
// app works without storage (private windows, blocked site data, quota).
import type { Color, Square } from 'chess.js';
import { CATEGORIES, type Volumes } from '#lib/audio/mixer.ts';
import type { Orientation } from '#lib/board/geometry.ts';
import {
	clampElo,
	DEFAULT_DIFFICULTY,
	PRESET_IDS,
	type Difficulty,
	type PresetId
} from '#lib/engine/difficulty.ts';
import { PROMOTION_PIECES, type MoveInput, type PromotionPiece } from '#lib/game/game.svelte.ts';
import type { GameSetup } from '#lib/game/setup.ts';
import { isObj } from '#lib/json.ts';
import { DEFAULT_SKIN_ID } from '#lib/skins/index.ts';

// Versioned keys: a breaking change to a shape gets a new key rather than a migration.
export const GAME_KEY = 'chess:game:v1';
export const SETTINGS_KEY = 'chess:settings:v1';

/** The current game, enough to rebuild it by replaying the moves (§4.9, §7.3). */
export interface SavedGame {
	startFen: string;
	moves: MoveInput[];
	/** A resignation is not on the board, so it is stored. */
	resigned: Color | null;
	/** The New game choices it was started with (mode, colour choice, difficulty). */
	setup: GameSetup;
	/** The player's colour vs the computer, after a random choice. */
	human: Color;
	orientation: Orientation;
}

export interface Settings {
	skinId: string;
	showLegalMoves: boolean;
	showCoordinates: boolean;
	autoFlip: boolean;
	lastDifficulty: Difficulty;
	/** Volume per sound category, 0 (off) to 1 (§4.11). */
	sound: Volumes;
	/** The volume each category goes back to when unmuted: its last above 0. */
	unmuted: Volumes;
	/** Vibration on events, where the device can (§4.12). */
	haptics: boolean;
}

/** The music sits under the game; voices are the loudest (§4.11). */
export const DEFAULT_VOLUMES: Volumes = { music: 0.5, sfx: 0.8, voices: 1 };

export const DEFAULT_SETTINGS: Settings = {
	skinId: DEFAULT_SKIN_ID,
	showLegalMoves: true,
	showCoordinates: true,
	autoFlip: false,
	lastDifficulty: DEFAULT_DIFFICULTY,
	sound: DEFAULT_VOLUMES,
	unmuted: DEFAULT_VOLUMES,
	haptics: true
};

function storage(): Storage | null {
	// Even reading `localStorage` throws when site data is blocked.
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

function read(key: string): unknown {
	try {
		const raw = storage()?.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function write(key: string, value: unknown) {
	try {
		storage()?.setItem(key, JSON.stringify(value));
	} catch {
		// Full or unavailable: the app carries on without saving.
	}
}

const isColor = (v: unknown): v is Color => v === 'w' || v === 'b';
const SQUARE = /^[a-h][1-8]$/;

export function parseDifficulty(v: unknown): Difficulty | null {
	if (!isObj(v)) return null;
	if (v.kind === 'preset' && PRESET_IDS.includes(v.id as PresetId))
		return { kind: 'preset', id: v.id as PresetId };
	if (v.kind === 'custom' && typeof v.elo === 'number' && Number.isFinite(v.elo))
		return { kind: 'custom', elo: clampElo(v.elo) };
	return null;
}

function parseMove(v: unknown): MoveInput | null {
	if (!isObj(v) || typeof v.from !== 'string' || typeof v.to !== 'string') return null;
	if (!SQUARE.test(v.from) || !SQUARE.test(v.to)) return null;
	const move: MoveInput = { from: v.from as Square, to: v.to as Square };
	if (v.promotion !== undefined) {
		const promotion = v.promotion as PromotionPiece;
		if (!PROMOTION_PIECES.includes(promotion)) return null;
		move.promotion = promotion;
	}
	return move;
}

function parseSetup(v: unknown): GameSetup | null {
	if (!isObj(v) || (v.mode !== 'computer' && v.mode !== 'hotseat')) return null;
	if (!isColor(v.color) && v.color !== 'random') return null;
	const difficulty = parseDifficulty(v.difficulty);
	return difficulty && { mode: v.mode, color: v.color, difficulty };
}

/**
 * A stored game, or null if it is missing or malformed. Whether the moves are legal is
 * checked when they are replayed.
 */
function parseGame(v: unknown): SavedGame | null {
	if (!isObj(v) || typeof v.startFen !== 'string' || !Array.isArray(v.moves)) return null;
	const moves = v.moves.map(parseMove);
	if (moves.some((m) => m === null)) return null;
	const setup = parseSetup(v.setup);
	if (!setup || !isColor(v.human)) return null;
	if (v.resigned !== null && !isColor(v.resigned)) return null;
	if (v.orientation !== 'white' && v.orientation !== 'black') return null;
	return {
		startFen: v.startFen,
		moves: moves as MoveInput[],
		resigned: v.resigned,
		setup,
		human: v.human,
		orientation: v.orientation
	};
}

/** Stored settings, field by field: a bad value falls back to its default only. */
function parseSettings(v: unknown): Settings {
	const s = isObj(v) ? v : {};
	const bool = (key: keyof Settings) =>
		typeof s[key] === 'boolean' ? (s[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
	return {
		skinId: typeof s.skinId === 'string' ? s.skinId : DEFAULT_SETTINGS.skinId,
		showLegalMoves: bool('showLegalMoves'),
		showCoordinates: bool('showCoordinates'),
		autoFlip: bool('autoFlip'),
		haptics: bool('haptics'),
		lastDifficulty: parseDifficulty(s.lastDifficulty) ?? DEFAULT_SETTINGS.lastDifficulty,
		sound: parseVolumes(s.sound, 0, DEFAULT_SETTINGS.sound),
		unmuted: parseVolumes(s.unmuted, Number.MIN_VALUE, DEFAULT_SETTINGS.unmuted)
	};
}

/** Each volume on its own: one outside [min, 1] falls back to its default. */
function parseVolumes(v: unknown, min: number, defaults: Volumes): Volumes {
	const o = isObj(v) ? v : {};
	const volume = (key: keyof Volumes) => {
		const x = o[key];
		return typeof x === 'number' && x >= min && x <= 1 ? x : defaults[key];
	};
	return Object.fromEntries(CATEGORIES.map((key) => [key, volume(key)])) as Volumes;
}

export const loadGame = (): SavedGame | null => parseGame(read(GAME_KEY));
export const saveGame = (game: SavedGame) => write(GAME_KEY, game);
export const loadSettings = (): Settings => parseSettings(read(SETTINGS_KEY));
export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, settings);
