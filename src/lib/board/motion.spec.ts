import { afterEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({ current: false }));
vi.mock('svelte/motion', () => ({ prefersReducedMotion: media }));

const { motion, MOVE_MS, CAPTURE_MS } = await import('./motion.ts');

describe('motion', () => {
	afterEach(() => {
		media.current = false;
	});

	it('uses the default durations', () => {
		expect(motion.move).toBe(MOVE_MS);
		expect(motion.capture).toBe(CAPTURE_MS);
	});

	it('turns every animation off when the user prefers reduced motion', () => {
		media.current = true;
		expect(motion.move).toBe(0);
		expect(motion.capture).toBe(0);
	});
});
