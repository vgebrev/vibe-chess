<script lang="ts">
	import type { Square } from 'chess.js';
	import {
		cellPosition,
		sheetPosition,
		squareToGrid,
		type Orientation
	} from '#lib/board/geometry.ts';
	import { cssUrl } from '#lib/skins/loader.ts';
	import type { Emotes } from '#lib/skins/schema.ts';

	interface Props {
		square: Square;
		/** The cell of the emote sheet to show. */
		emote: number;
		emotes: Emotes;
		orientation: Orientation;
	}

	let { square, emote, emotes, orientation }: Props = $props();

	// The tip of the bubble's tail, which the art draws at the bottom left, as a fraction of the
	// bubble; it points at the speaker's head, this far into its square.
	const TIP = { x: 0.12, y: 0.95 };
	const HEAD = { x: 0.6, y: 0.3 };

	const pos = $derived(cellPosition(square, orientation));
	const size = $derived(emotes.scale * 12.5);
	// Near the right edge it opens to the left instead, mirrored, so it stays over the board.
	const mirrored = $derived(squareToGrid(square, orientation).col >= 6);
	const left = $derived(
		mirrored
			? pos.left + 12.5 * (1 - HEAD.x) - size * (1 - TIP.x)
			: pos.left + 12.5 * HEAD.x - size * TIP.x
	);
	const top = $derived(pos.top + 12.5 * HEAD.y - size * TIP.y);
</script>

<!-- Decorative: the line it shows is heard, not read. -->
<div
	class="bubble"
	class:mirrored
	data-bubble={square}
	data-emote={emote}
	aria-hidden="true"
	style:left="{left}%"
	style:top="{top}%"
	style:width="{size}%"
	style:height="{size}%"
>
	<div
		class="art"
		style:background-image={cssUrl(emotes.image)}
		style:background-size="{emotes.columns * 100}% {emotes.rows * 100}%"
		style:background-position={sheetPosition(
			emote % emotes.columns,
			Math.floor(emote / emotes.columns),
			emotes.columns,
			emotes.rows
		)}
	></div>
</div>

<style>
	.bubble {
		position: absolute;
		pointer-events: none;
		z-index: 1;
		transform-origin: 0 100%;
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.4));
		animation: pop 160ms ease-out;
	}

	.mirrored {
		transform-origin: 100% 100%;
	}

	.art {
		width: 100%;
		height: 100%;
		background-repeat: no-repeat;
	}

	.mirrored .art {
		scale: -1 1;
	}

	@keyframes pop {
		from {
			scale: 0.4;
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble {
			animation: none;
		}
	}
</style>
