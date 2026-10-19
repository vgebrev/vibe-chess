<script lang="ts">
	import type { Color, Square } from 'chess.js';
	import { cellPosition, squareToGrid, type Orientation } from '#lib/board/geometry.ts';
	import type { PromotionPiece } from '#lib/game/game.svelte.ts';
	import { PIECE_NAMES } from '#lib/labels.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';
	import Sprite from './Sprite.svelte';

	interface Props {
		/** The promotion square. */
		square: Square;
		color: Color;
		orientation: Orientation;
		sheet: SkinManifest['pieces'];
		onpick: (piece: PromotionPiece) => void;
		oncancel: () => void;
	}

	let { square, color, orientation, sheet, onpick, oncancel }: Props = $props();

	const CHOICES: PromotionPiece[] = ['q', 'n', 'r', 'b'];

	/**
	 * Focus the first choice only when the move came from the keyboard (the square had a visible
	 * focus ring): a tap or click would otherwise leave the queen ringed as if keyboard-selected.
	 */
	function focusIfKeyboard(el: HTMLButtonElement) {
		if (document.activeElement?.matches(':focus-visible')) el.focus();
	}

	/**
	 * Whether a press started in the picker. A tap that opens it (touch-down on the promotion
	 * square) ends in a click that phones deliver to whatever is now under the finger, the queen,
	 * so only clicks pressed here, or from the keyboard (`detail` 0), count.
	 */
	let pressed = false;
	const accepts = (e: MouseEvent) => pressed || e.detail === 0;

	// Options stack from the promotion square towards the middle of the board.
	const pos = $derived(cellPosition(square, orientation));
	const down = $derived(squareToGrid(square, orientation).row === 0);
</script>

<!-- A scrim over the board; clicking it cancels the move (§4.2). Esc also cancels (handled by Board). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="scrim"
	data-promotion-picker
	onclick={(e) => accepts(e) && oncancel()}
	onpointerdown={(e) => {
		e.stopPropagation();
		pressed = true;
	}}
>
	{#each CHOICES as piece, i (piece)}
		<button
			{@attach i === 0 && focusIfKeyboard}
			class="choice"
			data-promote={piece}
			aria-label="Promote to {PIECE_NAMES[piece]}"
			style:left="{pos.left}%"
			style:top="{pos.top + (down ? i : -i) * 12.5}%"
			onclick={(e) => {
				e.stopPropagation();
				if (accepts(e)) onpick(piece);
			}}
		>
			<Sprite type={piece} {color} {sheet} />
		</button>
	{/each}
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--scrim);
		z-index: 2;
	}

	.choice {
		position: absolute;
		width: 12.5%;
		height: 12.5%;
		border-radius: 50%;
		background: radial-gradient(circle, var(--surface-raised) 55%, transparent 72%);
	}

	.choice:hover,
	.choice:focus-visible {
		background: radial-gradient(circle, var(--accent) 55%, transparent 72%);
		outline: none;
	}
</style>
