<script lang="ts">
	import type { Square } from 'chess.js';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { squareToGrid, type Orientation } from '#lib/board/geometry.ts';
	import { motion } from '#lib/board/motion.ts';
	import type { BoardPiece } from '#lib/game/pieces.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';
	import Sprite from './Sprite.svelte';

	interface Point {
		x: number;
		y: number;
	}

	interface Props {
		piece: BoardPiece;
		/** Where to draw it; differs from `piece.square` while a promotion choice is pending. */
		square?: Square;
		orientation: Orientation;
		sheet: SkinManifest['pieces'];
		/** Centre of the dragged piece in grid pixels while it is being dragged (the drag layer draws it). */
		lifted?: Point | null;
	}

	let { piece, square = piece.square, orientation, sheet, lifted = null }: Props = $props();

	const cell = $derived(squareToGrid(square, orientation));

	let el: HTMLDivElement;

	// FLIP slides (§4.5): before the DOM update note where the piece is drawn, after it
	// animate from there to the new cell. Every change of cell slides (moves, castling,
	// flips, undo) except dropping a dragged piece on its new square, which snaps; a dragged
	// piece that ends up back on its own square (illegal drop, Esc) slides back from the drop.
	let drawn = untrack(() => cell);
	let liftedAt: Point | null = null;
	let slideFrom: { x: number; y: number; scale: number } | null = null;
	// A promotion that also slides crossfades once the piece has landed.
	let crossfadeDelay = $state(0);

	function centre(): Point {
		const r = el.getBoundingClientRect();
		const grid = el.parentElement!.getBoundingClientRect();
		return { x: r.left + r.width / 2 - grid.left, y: r.top + r.height / 2 - grid.top };
	}

	$effect.pre(() => {
		const next = cell;
		const at = lifted;
		void piece.type;
		untrack(() => {
			if (at) {
				liftedAt = at;
				return;
			}
			const moved = next.col !== drawn.col || next.row !== drawn.row;
			const dropped = liftedAt;
			liftedAt = null;
			drawn = next;
			slideFrom = null;
			if (dropped && !moved) {
				const scale = Number(getComputedStyle(el).getPropertyValue('--drag-scale')) || 1;
				slideFrom = { ...dropped, scale };
			} else if (moved && !dropped && el) {
				slideFrom = { ...centre(), scale: 1 };
			}
			crossfadeDelay = moved && slideFrom ? motion.move : 0;
		});
	});

	$effect(() => {
		void cell;
		void lifted;
		untrack(() => {
			const from = slideFrom;
			slideFrom = null;
			for (const a of el.getAnimations()) if (a.id === 'slide') a.cancel();
			const duration = motion.move;
			if (!from || duration === 0) return;
			const node = el;
			const to = centre();
			const animation = node.animate(
				[
					{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.scale})` },
					{ transform: 'none' }
				],
				{ id: 'slide', duration, easing: 'ease-out' }
			);
			// Slide over the other pieces, not under them.
			node.style.zIndex = '1';
			animation.finished.then(
				() => (node.style.zIndex = ''),
				() => {}
			);
		});
	});
</script>

<!-- One square-sized box per piece, placed with `translate` (§4.5); slides animate `transform`,
     which applies after it, so a returning piece scales about its own centre. Captured pieces fade
     out on their own square (so en passant works); Svelte makes them `inert` meanwhile, and an
     undo during the fade brings the same element back. -->
<div
	bind:this={el}
	class="piece"
	class:hidden={lifted}
	data-piece="{piece.color}{piece.type}"
	data-square={square}
	style:translate="{cell.col * 100}% {cell.row * 100}%"
	in:fade={{ duration: motion.capture }}
	out:fade={{ duration: motion.capture }}
>
	{#key piece.type}
		<div class="layer" transition:fade={{ duration: motion.capture, delay: crossfadeDelay }}>
			<Sprite type={piece.type} color={piece.color} {sheet} />
		</div>
	{/key}
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

	.layer {
		position: absolute;
		inset: 0;
	}

	.hidden {
		visibility: hidden;
	}
</style>
