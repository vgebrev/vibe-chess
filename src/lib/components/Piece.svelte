<script lang="ts">
	import { spritePosition, squareToGrid, type Orientation } from '#lib/board/geometry.ts';
	import type { BoardPiece } from '#lib/game/pieces.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';

	interface Props {
		piece: BoardPiece;
		orientation: Orientation;
		sheet: SkinManifest['pieces'];
	}

	let { piece, orientation, sheet }: Props = $props();

	const cell = $derived(squareToGrid(piece.square, orientation));
</script>

<!-- One square-sized box per piece, moved with a transform so square changes can transition (§4.5). -->
<div
	class="piece"
	data-piece="{piece.color}{piece.type}"
	data-square={piece.square}
	style:transform="translate({cell.col * 100}%, {cell.row * 100}%)"
>
	<div
		class="sprite"
		style:filter="var(--piece-shadow-{piece.color === 'w' ? 'white' : 'black'}, none)"
		style:bottom="{sheet.anchorYFor[piece.type] * 100}%"
		style:background-position={spritePosition(piece.type, piece.color, sheet)}
	></div>
</div>

<style>
	.piece {
		position: absolute;
		top: 0;
		left: 0;
		width: 12.5%;
		height: 12.5%;
		pointer-events: none;
	}

	/* Sheet URL, grid size and scale come from CSS variables set by Board; the shadow from the theme. */
	.sprite {
		position: absolute;
		left: calc((1 - var(--piece-scale)) * 50%);
		width: calc(var(--piece-scale) * 100%);
		height: calc(var(--piece-scale) * 100%);
		background-image: var(--pieces-url);
		background-size: var(--sheet-size);
		background-repeat: no-repeat;
	}
</style>
