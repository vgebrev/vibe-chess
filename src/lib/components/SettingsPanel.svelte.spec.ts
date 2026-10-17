import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Difficulty } from '#lib/engine/difficulty.ts';
import type { SkinInfo } from '#lib/skins/index.ts';
import SettingsPanel from './SettingsPanel.svelte';

const BOTH: SkinInfo[] = [
	{ id: 'default', name: 'Marble' },
	{ id: 'pirate', name: 'Pirate' }
];

function setup(vsComputer: boolean, skins = BOTH) {
	const props = {
		skinId: 'default',
		skins,
		onskin: vi.fn(),
		showLegalMoves: true,
		showCoordinates: true,
		autoFlip: false,
		vsComputer,
		difficulty: { kind: 'preset', id: 'p2' } as Difficulty,
		labels: { difficulty: { p3: 'First Mate' } }
	};
	render(SettingsPanel, props);
	return props;
}

describe('SettingsPanel', () => {
	it('lists the skins by name and switches skin', async () => {
		const { onskin } = setup(false);
		await expect.element(page.getByRole('radio', { name: 'Marble' })).toBeChecked();
		await page.getByText('Pirate').click();
		expect(onskin).toHaveBeenCalledWith('pirate');
	});

	it('offers no skin choice with only one skin available', async () => {
		setup(false, [{ id: 'pirate', name: 'Pirate' }]);
		await expect.element(page.getByRole('group', { name: 'Board' })).toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: 'Skin' })).not.toBeInTheDocument();
	});

	it('offers auto-flip in a two-player game, and no difficulty', async () => {
		setup(false);
		await expect.element(page.getByLabelText('Auto-flip')).toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: 'Difficulty' })).not.toBeInTheDocument();
	});

	it('offers the difficulty vs Computer, and no auto-flip', async () => {
		setup(true);
		await expect.element(page.getByRole('radio', { name: 'Medium' })).toBeChecked();
		await expect.element(page.getByLabelText('Auto-flip')).not.toBeInTheDocument();
		await page.getByText('First Mate').click();
		await expect.element(page.getByRole('radio', { name: 'First Mate' })).toBeChecked();
	});
});
