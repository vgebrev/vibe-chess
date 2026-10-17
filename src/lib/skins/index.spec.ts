import { describe, expect, it } from 'vitest';
import { startOrder, type SkinInfo } from './index.ts';

const pirate: SkinInfo = { id: 'pirate', name: 'Pirate' };
const marble: SkinInfo = { id: 'default', name: 'Marble' };

describe('startOrder (§5.5)', () => {
	it('tries the saved skin, then the default, then the rest', () => {
		expect(startOrder('pirate', [marble, pirate])).toEqual(['pirate', 'default']);
		expect(startOrder('', [marble, pirate])).toEqual(['default', 'pirate']);
	});

	it('skips a saved or default skin that is disabled or unknown', () => {
		expect(startOrder('default', [pirate])).toEqual(['pirate']);
		expect(startOrder('gone', [pirate])).toEqual(['pirate']);
	});

	it('uses the default when every skin is disabled', () => {
		expect(startOrder('pirate', [])).toEqual(['default']);
	});
});
