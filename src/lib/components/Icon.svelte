<script lang="ts" module>
	// Simple stroked 24×24 icons for the control bar, header and drawers. Decorative: the button
	// around an icon carries its name.
	const paths = {
		new: 'M12 5v14M5 12h14',
		undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
		flip: 'M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4',
		resign: 'M5 21V4M5 4h12l-2.5 4 2.5 4H5',
		moves: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
		settings:
			'M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
		info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v5M12 8h.01',
		close: 'M6 6l12 12M18 6 6 18',
		yes: 'M5 12.5 10 17.5 19 7',
		sound: 'M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
		muted: 'M11 5 6 9H3v6h3l5 4V5zM16 9l6 6M22 9l-6 6'
	} as const;

	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	let { name, class: className = 'size-5' }: { name: IconName; class?: string } = $props();
</script>

<svg
	class={['shrink-0', className]}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={paths[name]} />
</svg>
