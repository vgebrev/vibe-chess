<script lang="ts">
	import type { Color, PieceSymbol } from 'chess.js';
	import { spritePosition } from '#lib/board/geometry.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';

	interface Props {
		type: PieceSymbol;
		color: Color;
		sheet: SkinManifest['pieces'];
	}

	let { type, color, sheet }: Props = $props();
</script>

<!-- One piece sprite filling its (square) parent. Sheet URL and grid size come from CSS
     variables set by Board; scale and anchor from the manifest; the shadow from the theme. -->
<div
	class="sprite"
	style:left="{((1 - sheet.scale) / 2) * 100}%"
	style:bottom="{sheet.anchorYFor[type] * 100}%"
	style:width="{sheet.scale * 100}%"
	style:height="{sheet.scale * 100}%"
	style:background-position={spritePosition(type, color, sheet)}
	style:filter="var(--piece-shadow-{color === 'w' ? 'white' : 'black'}, none)"
></div>

<style>
	.sprite {
		position: absolute;
		background-image: var(--pieces-url);
		background-size: var(--sheet-size);
		background-repeat: no-repeat;
		pointer-events: none;
	}
</style>
