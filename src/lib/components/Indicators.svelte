<script lang="ts">
	import type { Square } from 'chess.js';
	import { cellPosition, type Orientation } from '#lib/board/geometry.ts';
	import type { Target } from '#lib/game/game.svelte.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';

	interface Props {
		targets: Target[];
		orientation: Orientation;
		skin: SkinManifest;
		/** The target under the pointer or dragged piece, drawn at the skin's hover opacity. */
		hover: Square | null;
	}

	let { targets, orientation, skin, hover }: Props = $props();

	// Captures use the capture indicator, or the move indicator upscaled to frame the piece (§4.3).
	const styles = $derived({
		move: skin.moveIndicator,
		capture: skin.captureIndicator ?? {
			...skin.moveIndicator,
			scale: skin.moveIndicator.captureScale
		}
	});
</script>

<!-- Drawn above the pieces, translucent, so neither square nor piece is fully hidden. -->
{#each targets as target (target.square)}
	{@const pos = cellPosition(target.square, orientation)}
	{@const style = target.capture ? styles.capture : styles.move}
	<div
		class="indicator"
		data-indicator={target.capture ? 'capture' : 'move'}
		data-square={target.square}
		style:left="{pos.left}%"
		style:top="{pos.top}%"
		style:opacity={hover === target.square ? style.hoverOpacity : style.opacity}
	>
		<div
			style:background-image="url({JSON.stringify(style.image)})"
			style:width="{style.scale * 100}%"
			style:height="{style.scale * 100}%"
		></div>
	</div>
{/each}

<style>
	.indicator {
		position: absolute;
		width: 12.5%;
		height: 12.5%;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.indicator > div {
		background-size: 100% 100%;
		flex: none;
	}
</style>
