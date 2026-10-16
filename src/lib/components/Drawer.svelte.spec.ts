import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../app.css';
import Drawer from './Drawer.svelte';

const children = createRawSnippet(() => ({
	render: () => '<p>Drawer body <button>Inside</button></p>'
}));

function setup(open = true) {
	const onclose = vi.fn();
	const screen = render(Drawer, { open, title: 'Moves', onclose, children });
	return { onclose, screen };
}

describe('Drawer', () => {
	afterEach(() => document.querySelectorAll('[data-trigger]').forEach((el) => el.remove()));

	it('opens as a modal dialog named by its title', async () => {
		setup();
		const dialog = page.getByRole('dialog', { name: 'Moves' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText('Drawer body')).toBeVisible();
		expect(dialog.element().matches(':modal')).toBe(true);
	});

	it('renders nothing while closed', () => {
		const { screen } = setup(false);
		expect(screen.container.querySelector('dialog')).toBeNull();
	});

	it('asks to close on Esc, the close button and the scrim', async () => {
		const { onclose } = setup();
		await userEvent.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalledTimes(1);
		// Esc doesn't close the dialog by itself, so the sheet can slide out.
		expect(page.getByRole('dialog').element().hasAttribute('open')).toBe(true);
		await page.getByRole('button', { name: 'Close' }).click();
		expect(onclose).toHaveBeenCalledTimes(2);
		document.querySelector<HTMLElement>('[data-scrim]')!.click();
		expect(onclose).toHaveBeenCalledTimes(3);
	});

	it('gives focus back to its trigger once closed', async () => {
		const trigger = document.createElement('button');
		trigger.dataset.trigger = '';
		document.body.append(trigger);
		trigger.focus();
		const { screen } = setup();
		await expect.element(page.getByRole('dialog')).toBeVisible();
		expect(document.activeElement).not.toBe(trigger);
		await screen.rerender({ open: false });
		await expect.poll(() => document.activeElement).toBe(trigger);
		expect(screen.container.querySelector('dialog')).toBeNull();
	});

	it('closes on a long swipe down the handle, not a short one', async () => {
		const { onclose } = setup();
		const handle = document.querySelector<HTMLElement>('[data-handle]')!;
		const swipe = (dy: number) => {
			const at = (type: string, y: number) =>
				handle.dispatchEvent(
					new PointerEvent(type, { pointerId: 1, clientY: y, bubbles: true, isPrimary: true })
				);
			at('pointerdown', 100);
			at('pointermove', 100 + dy);
			at('pointerup', 100 + dy);
		};
		swipe(30);
		expect(onclose).not.toHaveBeenCalled();
		swipe(120);
		expect(onclose).toHaveBeenCalledOnce();
	});
});
