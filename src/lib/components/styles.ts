// Shared Tailwind class strings, for controls that look alike across components.

/** A radio or checkbox drawn as a chip: the input is visually hidden and the label shows its state. */
export const option =
	'flex cursor-pointer items-center gap-2 rounded bg-surface-raised px-3 py-1 has-checked:text-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-accent';

/** The main action's button colours; the size and padding are each button's own. */
export const primary = 'rounded bg-accent text-bg';

/** Any other button's colours. */
export const secondary = 'rounded bg-surface-raised enabled:hover:text-accent';
