import { describe, expect, it } from 'vitest';
import { clampElo, difficultyName, personality, presetName, targetElo } from './difficulty.ts';

describe('Elo', () => {
	it('snaps to 50 and clamps to the range', () => {
		expect(clampElo(1874)).toBe(1850);
		expect(clampElo(1875)).toBe(1900);
		expect(clampElo(100)).toBe(450);
		expect(clampElo(5000)).toBe(3000);
	});

	it('gives each preset a target, 450 apart, and custom its own clamped value', () => {
		const presets = (['p0', 'p1', 'p2', 'p3', 'p4'] as const).map((id) =>
			targetElo({ kind: 'preset', id })
		);
		expect(presets).toEqual([450, 900, 1350, 1800, 2250]);
		expect(targetElo({ kind: 'custom', elo: 1333 })).toBe(1350);
	});
});

describe('personality', () => {
	it('grows with the target Elo, from 0.7 to 1.2', () => {
		expect(personality({ kind: 'preset', id: 'p0' })).toBe(0.7);
		expect(personality({ kind: 'preset', id: 'p4' })).toBeCloseTo(1.15);
		expect(personality({ kind: 'custom', elo: 3000 })).toBe(1.2);
	});
});

describe('names', () => {
	it('come from the skin, falling back to generic ones', () => {
		expect(presetName('p0', { difficulty: { p0: 'Cabin Boy' } })).toBe('Cabin Boy');
		expect(presetName('p4', { difficulty: { p0: 'Cabin Boy' } })).toBe('Expert');
		expect(difficultyName({ kind: 'custom', elo: 1600 }, {})).toBe('Custom (1600 Elo)');
	});
});
