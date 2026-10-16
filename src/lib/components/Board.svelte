<script lang="ts">
	import type { Orientation } from '#lib/board/geometry.ts';
	import type { BoardPiece } from '#lib/game/pieces.ts';
	import type { LoadedSkin } from '#lib/skins/loader.ts';
	import Coordinates from './Coordinates.svelte';
	import Piece from './Piece.svelte';

	interface Props {
		skin: LoadedSkin;
		pieces: BoardPiece[];
		orientation: Orientation;
		showCoordinates?: boolean;
	}

	let { skin, pieces, orientation, showCoordinates = true }: Props = $props();

	// Gutter labels are sized relative to the gutter strip they sit in.
	const GUTTER_FONT = 0.75;

	const manifest = $derived(skin.manifest);
	const inset = $derived(manifest.board.inset);
	const framed = $derived(inset.top > 0 || inset.right > 0 || inset.bottom > 0 || inset.left > 0);
	// Frameless boards put coordinates in a gutter outside the image; the board shrinks so
	// board + gutter fill the same square box (§4.4).
	const gutter = $derived(showCoordinates && !framed ? manifest.coordinates.gutter : 0);
	const gutterPct = $derived((gutter / (8 + gutter)) * 100);
	const boardPct = $derived(100 - gutterPct);

	const sheet = $derived(manifest.pieces);
</script>

<div class="frame" data-skin={manifest.id} data-orientation={orientation}>
	<div
		class="board"
		style:left="{gutterPct}%"
		style:width="{boardPct}%"
		style:background-image="url({JSON.stringify(skin.urls.board)})"
	>
		<div
			class="grid"
			style:top="{inset.top * 100}%"
			style:right="{inset.right * 100}%"
			style:bottom="{inset.bottom * 100}%"
			style:left="{inset.left * 100}%"
			style:--pieces-url="url({JSON.stringify(skin.urls.pieces)})"
			style:--sheet-size="{sheet.columns * 100}% {sheet.rows * 100}%"
			style:--piece-scale={sheet.scale}
		>
			{#each pieces as piece (piece.id)}
				<Piece {piece} {orientation} {sheet} />
			{/each}
		</div>

		{#if showCoordinates && framed}
			<Coordinates
				{orientation}
				grid={{
					left: inset.left * 100,
					top: inset.top * 100,
					width: (1 - inset.left - inset.right) * 100,
					height: (1 - inset.top - inset.bottom) * 100
				}}
				fileY={(1 - inset.bottom / 2) * 100}
				rankX={(inset.left / 2) * 100}
				fontSize={manifest.coordinates.fontScale * Math.min(inset.bottom, inset.left) * 100}
			/>
		{/if}
	</div>

	{#if gutter > 0}
		<Coordinates
			{orientation}
			grid={{ left: gutterPct, top: 0, width: boardPct, height: boardPct }}
			fileY={boardPct + gutterPct / 2}
			rankX={gutterPct / 2}
			fontSize={GUTTER_FONT * gutterPct}
		/>
	{/if}
</div>

<style>
	/* Square box the parent sizes by width; the board (and gutter, if any) fill it. */
	.frame {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		container-type: inline-size;
	}

	.board {
		position: absolute;
		top: 0;
		aspect-ratio: 1;
		background-size: 100% 100%;
		container-type: inline-size;
	}

	.grid {
		position: absolute;
	}
</style>
