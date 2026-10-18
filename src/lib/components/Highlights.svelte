<script lang="ts">
	import type { Square } from 'chess.js';
	import { cellPosition, type Orientation } from '#lib/board/geometry.ts';

	export interface Highlight {
		square: Square;
		kind: 'selected' | 'last-move' | 'check';
	}

	interface Props {
		highlights: Highlight[];
		orientation: Orientation;
	}

	let { highlights, orientation }: Props = $props();
</script>

<!-- Translucent square overlays under the pieces (§4.3), coloured by the theme. -->
{#each highlights as { square, kind } (`${kind}-${square}`)}
	{@const pos = cellPosition(square, orientation)}
	<div
		class="highlight {kind}"
		data-highlight={kind}
		data-square={square}
		style:left="{pos.left}%"
		style:top="{pos.top}%"
	></div>
{/each}

<style>
	.highlight {
		position: absolute;
		width: 12.5%;
		height: 12.5%;
		pointer-events: none;
	}

	.selected {
		background: var(--highlight-selected);
	}

	.last-move {
		background: var(--highlight-last-move);
	}

	/* Radial so the king stays readable; the theme colour fades out towards the corners. */
	.check {
		background: radial-gradient(ellipse at center, var(--highlight-check) 25%, transparent 89%);
	}
</style>
