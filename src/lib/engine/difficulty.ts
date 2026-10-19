// Difficulty: six Stockfish Skill Level presets, or a custom Elo in steps of 50 (§4.6).
import type { Labels } from '#lib/skins/schema.ts';

export const PRESET_IDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type Difficulty = { kind: 'preset'; id: PresetId } | { kind: 'custom'; elo: number };

/**
 * Skill Levels 0–5, with the Elo Stockfish's own formula gives each: it turns a `UCI_Elo` into
 * a Skill Level, and this is that mapping inverted (§4.6). Its scale is engine blitz ratings
 * (CCRL), so the numbers are approximate on the human scale.
 */
export const PRESETS: { id: PresetId; skill: number; elo: number; name: string }[] = [
	{ id: 'p0', skill: 0, elo: 1320, name: 'Beginner' },
	{ id: 'p1', skill: 1, elo: 1444, name: 'Easy' },
	{ id: 'p2', skill: 2, elo: 1566, name: 'Medium' },
	{ id: 'p3', skill: 3, elo: 1729, name: 'Hard' },
	{ id: 'p4', skill: 4, elo: 1953, name: 'Expert' },
	{ id: 'p5', skill: 5, elo: 2197, name: 'Master' }
];

export const DEFAULT_DIFFICULTY: Difficulty = { kind: 'preset', id: 'p0' };

export const ELO_STEP = 50;
/** The custom slider's range: the multiples of 50 inside Stockfish's `UCI_Elo` (1320–3190). */
export const ELO_RANGE = { min: 1350, max: 3150 };
/** The custom slider's starting value. */
export const DEFAULT_ELO = 1350;

const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!;

/** Snap an Elo to the 50 grid and clamp it to the range. */
export function clampElo(elo: number): number {
	const snapped = Math.round(elo / ELO_STEP) * ELO_STEP;
	return Math.min(ELO_RANGE.max, Math.max(ELO_RANGE.min, snapped));
}

/** The Elo the computer plays at, roughly. */
export function targetElo(difficulty: Difficulty): number {
	return difficulty.kind === 'preset' ? preset(difficulty.id).elo : clampElo(difficulty.elo);
}

/** The UCI options for a difficulty, in the order they are sent. */
export function uciOptions(difficulty: Difficulty): Record<string, string | number> {
	return difficulty.kind === 'preset'
		? { UCI_LimitStrength: 'false', 'Skill Level': preset(difficulty.id).skill }
		: { UCI_LimitStrength: 'true', UCI_Elo: clampElo(difficulty.elo) };
}

/**
 * Stronger opponents take a little longer to move (§4.6.1): ×0.7 at the weakest preset (1320),
 * ×1.2 from the top of the custom range (3150).
 */
export function personality(difficulty: Difficulty): number {
	const weakest = PRESETS[0].elo;
	const t = Math.min(1, Math.max(0, (targetElo(difficulty) - weakest) / (ELO_RANGE.max - weakest)));
	return 0.7 + 0.5 * t;
}

/** A preset's name from the skin, falling back to a generic one (§4.6). */
export function presetName(id: PresetId, labels: Labels): string {
	return labels.difficulty?.[id] ?? preset(id).name;
}
