import { describe, expect, it } from 'vitest';
import {
	clampElo,
	personality,
	PRESET_IDS,
	presetName,
	targetElo,
	uciOptions
} from './difficulty.ts';

describe('Elo', () => {
	it('snaps to 50 and clamps to the range', () => {
		expect(clampElo(1874)).toBe(1850);
		expect(clampElo(1875)).toBe(1900);
		expect(clampElo(100)).toBe(1350);
		expect(clampElo(5000)).toBe(3150);
	});

	it("gives each preset its Skill Level's Elo, and custom its own clamped value", () => {
		const presets = PRESET_IDS.map((id) => targetElo({ kind: 'preset', id }));
		expect(presets).toEqual([1320, 1444, 1566, 1729, 1953, 2197]);
		expect(targetElo({ kind: 'custom', elo: 2333 })).toBe(2350);
	});
});

describe('uciOptions', () => {
	it('sets a Skill Level for a preset, and a limited Elo for custom', () => {
		expect(uciOptions({ kind: 'preset', id: 'p3' })).toEqual({
			UCI_LimitStrength: 'false',
			'Skill Level': 3
		});
		expect(uciOptions({ kind: 'custom', elo: 2510 })).toEqual({
			UCI_LimitStrength: 'true',
			UCI_Elo: 2500
		});
	});
});

describe('personality', () => {
	it('grows with the Elo, from 0.7 to 1.2', () => {
		expect(personality({ kind: 'preset', id: 'p0' })).toBe(0.7);
		expect(personality({ kind: 'custom', elo: 3150 })).toBe(1.2);
	});
});

describe('names', () => {
	it('come from the skin, falling back to generic ones', () => {
		expect(presetName('p0', { difficulty: { p0: 'Cabin Boy' } })).toBe('Cabin Boy');
		expect(presetName('p5', { difficulty: { p0: 'Cabin Boy' } })).toBe('Master');
	});
});
