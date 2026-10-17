// Difficulty: five presets or a custom Elo in steps of 50, each a target Elo for the
// human-like move choice (§4.6, §4.6.2).
import type { Labels } from '#lib/skins/schema.ts';

export type PresetId = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export type Difficulty = { kind: 'preset'; id: PresetId } | { kind: 'custom'; elo: number };

/** Mostly for casual players, 450 Elo apart. */
export const PRESETS: { id: PresetId; elo: number; name: string }[] = [
	{ id: 'p0', elo: 450, name: 'Beginner' },
	{ id: 'p1', elo: 900, name: 'Easy' },
	{ id: 'p2', elo: 1350, name: 'Medium' },
	{ id: 'p3', elo: 1800, name: 'Hard' },
	{ id: 'p4', elo: 2250, name: 'Expert' }
];

export const DEFAULT_DIFFICULTY: Difficulty = { kind: 'preset', id: 'p2' };

export const ELO_STEP = 50;
/** The custom slider's range. */
export const ELO_RANGE = { min: 450, max: 3000 };
/** The custom slider's starting value. */
export const DEFAULT_ELO = 1350;

const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!;

/** Snap an Elo to the 50 grid and clamp it to the range. */
export function clampElo(elo: number, range = ELO_RANGE): number {
	const snapped = Math.round(elo / ELO_STEP) * ELO_STEP;
	return Math.min(range.max, Math.max(range.min, snapped));
}

/** The Elo the computer plays at. */
export function targetElo(difficulty: Difficulty): number {
	return difficulty.kind === 'preset' ? preset(difficulty.id).elo : clampElo(difficulty.elo);
}

/** Stronger opponents take a little longer to move (§4.6.1): ×0.7 at 450, ×1.2 from 2450. */
export function personality(difficulty: Difficulty): number {
	const t = Math.min(1, Math.max(0, (targetElo(difficulty) - 450) / 2000));
	return 0.7 + 0.5 * t;
}

/** A preset's name from the skin, falling back to a generic one (§4.6). */
export function presetName(id: PresetId, labels: Labels): string {
	return labels.difficulty?.[id] ?? preset(id).name;
}

export function difficultyName(difficulty: Difficulty, labels: Labels): string {
	return difficulty.kind === 'preset'
		? presetName(difficulty.id, labels)
		: `Custom (${clampElo(difficulty.elo)} Elo)`;
}
