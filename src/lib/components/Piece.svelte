<script lang="ts">
	import { squareToGrid, type Orientation } from '#lib/board/geometry.ts';
	import type { BoardPiece } from '#lib/game/pieces.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';
	import Sprite from './Sprite.svelte';

	interface Props {
		piece: BoardPiece;
		orientation: Orientation;
		sheet: SkinManifest['pieces'];
		/** Hidden while it is being dragged (the drag layer draws it instead). */
		hidden?: boolean;
	}

	let { piece, orientation, sheet, hidden = false }: Props = $props();

	const cell = $derived(squareToGrid(piece.square, orientation));
</script>

<!-- One square-sized box per piece, moved with a transform so square changes can transition (§4.5). -->
<div
	class="piece"
	class:hidden
	data-piece="{piece.color}{piece.type}"
	data-square={piece.square}
	style:transform="translate({cell.col * 100}%, {cell.row * 100}%)"
>
	<Sprite type={piece.type} color={piece.color} {sheet} />
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

	.hidden {
		visibility: hidden;
	}
</style>
