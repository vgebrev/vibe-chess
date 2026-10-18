import { afterEach, describe, expect, it, vi } from 'vitest';
import { Haptics, hapticSupport, PATTERNS } from './haptics.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Haptics (§4.12)', () => {
	it("vibrates each event's pattern where the device can", () => {
		const vibrate = vi.fn(() => true);
		vi.stubGlobal('navigator', { vibrate });
		const haptics = new Haptics('vibrate');
		haptics.play('check');
		haptics.play('move');
		expect(vibrate.mock.calls).toEqual([[PATTERNS.check], [PATTERNS.move]]);
	});

	it('stays still when turned off, or where the device cannot vibrate', () => {
		const vibrate = vi.fn(() => true);
		vi.stubGlobal('navigator', { vibrate });
		const off = new Haptics('vibrate');
		off.enabled = false;
		off.play('capture');
		new Haptics(null).play('capture');
		expect(vibrate).not.toHaveBeenCalled();
	});

	it('gives an iOS tick only during a tap', () => {
		vi.stubGlobal('navigator', { userActivation: { isActive: false } });
		// Outside a tap it doesn't reach for the page at all (there is no document here).
		expect(() => new Haptics('ios-switch').play('move')).not.toThrow();
	});

	it('has no support without a window', () => {
		expect(hapticSupport()).toBeNull();
	});

	it('keeps every pattern short', () => {
		for (const pattern of Object.values(PATTERNS))
			expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000);
	});
});
