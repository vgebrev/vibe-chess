// Difficulty: five Skill Level presets, or a custom Elo in steps of 50 (§4.6).
import type { Labels } from '#lib/skins/schema.ts';

export type PresetId = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export type Difficulty = { kind: 'preset'; id: PresetId } | { kind: 'custom'; elo: number };

export const PRESETS: { id: PresetId; skill: number; name: string; personality: number }[] = [
	{ id: 'p0', skill: 0, name: 'Beginner', personality: 0.7 },
	{ id: 'p1', skill: 5, name: 'Easy', personality: 0.8 },
	{ id: 'p2', skill: 10, name: 'Medium', personality: 0.9 },
	{ id: 'p3', skill: 15, name: 'Hard', personality: 1.0 },
	{ id: 'p4', skill: 20, name: 'Max', personality: 1.15 }
];

export const DEFAULT_DIFFICULTY: Difficulty = { kind: 'preset', id: 'p2' };

export const ELO_STEP = 50;
/** The slider's range before the engine reports its own (§4.6). */
export const ELO_RANGE = { min: 1350, max: 3150 };
/** The default custom Elo, which is also the slider's lower bound. */
export const DEFAULT_ELO = ELO_RANGE.min;

const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!;

/** The multiples of 50 inside the engine's `UCI_Elo` range, capped to 1350–3150. */
export function eloRange(engine: { min: number; max: number }): { min: number; max: number } {
	const min = Math.max(ELO_RANGE.min, Math.ceil(engine.min / ELO_STEP) * ELO_STEP);
	const max = Math.min(ELO_RANGE.max, Math.floor(engine.max / ELO_STEP) * ELO_STEP);
	return min <= max ? { min, max } : ELO_RANGE;
}

/** Snap an Elo to the 50 grid and clamp it to the range. */
export function clampElo(elo: number, range = ELO_RANGE): number {
	const snapped = Math.round(elo / ELO_STEP) * ELO_STEP;
	return Math.min(range.max, Math.max(range.min, snapped));
}

/** The UCI options for a difficulty, in the order they are sent. */
export function uciOptions(difficulty: Difficulty, range = ELO_RANGE): [string, string][] {
	if (difficulty.kind === 'preset') {
		return [
			['UCI_LimitStrength', 'false'],
			['Skill Level', String(preset(difficulty.id).skill)]
		];
	}
	return [
		['UCI_LimitStrength', 'true'],
		['UCI_Elo', String(clampElo(difficulty.elo, range))]
	];
}

/** Stronger opponents take a little longer to move (§4.6.1). */
export function personality(difficulty: Difficulty): number {
	if (difficulty.kind === 'preset') return preset(difficulty.id).personality;
	const t = (clampElo(difficulty.elo) - ELO_RANGE.min) / (ELO_RANGE.max - ELO_RANGE.min);
	return 0.85 + t * (1.2 - 0.85);
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
