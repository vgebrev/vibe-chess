import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_SETUP } from '#lib/game/setup.ts';
import NewGameForm from './NewGameForm.svelte';

const pirate = {
	white: 'Blue Crew',
	black: 'Red Crew',
	difficulty: { p0: 'Cabin Boy', p5: 'Captain' }
};

describe('NewGameForm', () => {
	it('opens with the last setup and starts the chosen game', async () => {
		const onstart = vi.fn();
		render(NewGameForm, {
			initial: { mode: 'computer', color: 'b', difficulty: { kind: 'preset', id: 'p5' } },
			labels: pirate,
			onstart
		});
		await expect.element(page.getByRole('radio', { name: 'Red Crew' })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Captain' })).toBeChecked();
		// Skin names for presets, generic names for the rest.
		await expect.element(page.getByRole('radio', { name: 'Cabin Boy' })).toBeInTheDocument();
		await expect.element(page.getByRole('radio', { name: 'Medium' })).toBeInTheDocument();

		await page.getByText('Random').click();
		await page.getByText('Cabin Boy').click();
		await page.getByRole('button', { name: 'Start' }).click();
		expect(onstart).toHaveBeenCalledWith({
			mode: 'computer',
			color: 'random',
			difficulty: { kind: 'preset', id: 'p0' }
		});
	});

	it('shows each preset with its Elo, and offers a custom Elo from 1350 to 3150', async () => {
		const onstart = vi.fn();
		render(NewGameForm, { initial: DEFAULT_SETUP, labels: {}, onstart });
		await expect.element(page.getByRole('radio', { name: 'Easy (1444)' })).toBeInTheDocument();
		await page.getByText('Custom').click();
		const slider = page.getByRole('slider', { name: 'Elo' });
		await expect.element(slider).toHaveAttribute('min', '1350');
		await expect.element(slider).toHaveAttribute('max', '3150');
		await expect.element(slider).toHaveAttribute('step', '50');
		await expect.element(slider).toHaveValue('1350');
		await page.getByRole('button', { name: 'Start' }).click();
		expect(onstart).toHaveBeenCalledWith({
			...DEFAULT_SETUP,
			difficulty: { kind: 'custom', elo: 1350 }
		});
	});

	it('asks nothing more for a two-player game', async () => {
		render(NewGameForm, {
			initial: DEFAULT_SETUP,
			labels: {},
			onstart: () => {}
		});
		await page.getByText('Two players').click();
		await expect.element(page.getByRole('group', { name: 'Difficulty' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: 'Play as' })).not.toBeInTheDocument();
	});
});
