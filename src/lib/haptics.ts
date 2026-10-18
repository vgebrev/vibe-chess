// Haptic feedback (§4.12): a short vibration for the same events that have sounds, on phones
// that can. Android has the Vibration API, with a pattern per event. iOS Safari has none; there,
// toggling a hidden iOS switch control gives one system tick, and only during a tap, so iPhones
// feel the player's own actions but not the computer's moves.
import type { SfxName } from '#lib/skins/schema.ts';

/**
 * Vibration patterns, in ms: on, off, on, … The API has no strength, and a phone's motor needs
 * time to spin up, so length is what makes a buzz felt: these were tried on an Android phone,
 * where 8–30 ms was too faint (§4.12).
 */
export const PATTERNS: Record<SfxName, number[]> = {
	click: [30],
	select: [30],
	move: [60],
	castle: [60, 90, 60], // two pieces move
	capture: [110],
	promotion: [60, 70, 130],
	check: [100, 90, 100],
	checkmate: [150, 100, 150, 100, 400],
	draw: [150, 150, 150],
	illegal: [50, 60, 50],
	start: [80]
};

/** How this device can give haptic feedback, if at all. */
export type HapticSupport = 'vibrate' | 'ios-switch' | null;

export function hapticSupport(): HapticSupport {
	if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return null;
	if (typeof navigator.vibrate === 'function') return 'vibrate';
	// iOS 18+: the `switch` checkbox (reflected as a property) ticks when toggled.
	if ('switch' in HTMLInputElement.prototype) return 'ios-switch';
	return null;
}

export class Haptics {
	enabled = true;
	readonly support: HapticSupport;
	#tick: HTMLLabelElement | null = null;

	constructor(support: HapticSupport = hapticSupport()) {
		this.support = support;
	}

	play(event: SfxName) {
		if (!this.enabled) return;
		if (this.support === 'vibrate') navigator.vibrate(PATTERNS[event]);
		// A tick outside a tap would do nothing, or wait for the next one.
		else if (this.support === 'ios-switch' && navigator.userActivation?.isActive) this.#iosTick();
	}

	#iosTick() {
		if (!this.#tick) {
			const label = document.createElement('label');
			label.ariaHidden = 'true';
			label.dataset.haptic = ''; // not a control: its click makes no sound
			label.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.setAttribute('switch', '');
			input.tabIndex = -1;
			label.append(input);
			document.body.append(label);
			this.#tick = label;
		}
		this.#tick.click();
	}
}
