import { describe, expect, it } from 'vitest';
import {
	clampElo,
	difficultyName,
	eloRange,
	personality,
	presetName,
	uciOptions
} from './difficulty.ts';

describe('Elo', () => {
	it("keeps the multiples of 50 inside the engine's range", () => {
		expect(eloRange({ min: 1320, max: 3190 })).toEqual({ min: 1350, max: 3150 });
		expect(eloRange({ min: 1400, max: 2875 })).toEqual({ min: 1400, max: 2850 });
	});

	it('snaps to 50 and clamps to the range', () => {
		expect(clampElo(1874)).toBe(1850);
		expect(clampElo(1875)).toBe(1900);
		expect(clampElo(1000)).toBe(1350);
		expect(clampElo(5000)).toBe(3150);
		expect(clampElo(2900, { min: 1400, max: 2850 })).toBe(2850);
	});
});

describe('uciOptions', () => {
	it('turns strength limiting off for a preset', () => {
		expect(uciOptions({ kind: 'preset', id: 'p2' })).toEqual([
			['UCI_LimitStrength', 'false'],
			['Skill Level', '10']
		]);
	});

	it('turns it on with a clamped Elo for custom', () => {
		expect(uciOptions({ kind: 'custom', elo: 1333 })).toEqual([
			['UCI_LimitStrength', 'true'],
			['UCI_Elo', '1350']
		]);
	});
});

describe('personality', () => {
	it('grows with the preset', () => {
		expect(personality({ kind: 'preset', id: 'p0' })).toBe(0.7);
		expect(personality({ kind: 'preset', id: 'p4' })).toBe(1.15);
	});

	it('runs from 0.85 to 1.20 across the custom range', () => {
		expect(personality({ kind: 'custom', elo: 1350 })).toBeCloseTo(0.85);
		expect(personality({ kind: 'custom', elo: 2250 })).toBeCloseTo(1.025);
		expect(personality({ kind: 'custom', elo: 3150 })).toBeCloseTo(1.2);
	});
});

describe('names', () => {
	it('come from the skin, falling back to generic ones', () => {
		expect(presetName('p0', { difficulty: { p0: 'Cabin Boy' } })).toBe('Cabin Boy');
		expect(presetName('p1', { difficulty: { p0: 'Cabin Boy' } })).toBe('Easy');
		expect(difficultyName({ kind: 'custom', elo: 1600 }, {})).toBe('Custom (1600 Elo)');
	});
});
