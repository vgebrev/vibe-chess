<script lang="ts">
	import type { Color, Square } from 'chess.js';
	import type { Bubble } from '#lib/audio/sound.ts';
	import {
		cellPosition,
		FILES,
		gridToSquare,
		RANKS,
		squareToGrid,
		type Orientation
	} from '#lib/board/geometry.ts';
	import type { Game, PromotionPiece } from '#lib/game/game.svelte.ts';
	import { squareLabel } from '#lib/labels.ts';
	import { piecesSheetStyle, type LoadedSkin } from '#lib/skins/loader.ts';
	import Coordinates from './Coordinates.svelte';
	import Highlights, { type Highlight } from './Highlights.svelte';
	import Indicators from './Indicators.svelte';
	import Piece from './Piece.svelte';
	import PromotionPicker from './PromotionPicker.svelte';
	import SpeechBubble from './SpeechBubble.svelte';
	import Sprite from './Sprite.svelte';

	interface Props {
		skin: LoadedSkin;
		game: Game;
		orientation: Orientation;
		showCoordinates?: boolean;
		showLegalMoves?: boolean;
		/** No input at all, e.g. while the engine is thinking (§4.2). */
		locked?: boolean;
		/** Whether the human may move this side's pieces (vs-Computer: only their own). */
		canMove?: (color: Color) => boolean;
		/** A piece was picked up or selected (for its sound, §4.11). */
		onselect?: () => void;
		/** A dragged piece was dropped where it can't go and slides back. */
		onillegal?: () => void;
		/** A speech bubble over the piece that is speaking (§4.11). */
		bubble?: Bubble | null;
	}

	let {
		skin,
		game,
		orientation,
		showCoordinates = true,
		showLegalMoves = true,
		locked = false,
		canMove = () => true,
		onselect,
		onillegal,
		bubble = null
	}: Props = $props();

	// Gutter labels are sized relative to the gutter strip they sit in.
	const GUTTER_FONT = 0.75;
	// Pointer travel (px) before a press on a piece becomes a drag rather than a click.
	const DRAG_THRESHOLD = 4;

	const manifest = $derived(skin.manifest);
	const inset = $derived(manifest.board.inset);
	const framed = $derived(inset.top > 0 || inset.right > 0 || inset.bottom > 0 || inset.left > 0);
	// Frameless boards put coordinates in a gutter outside the image; the board shrinks so
	// board + gutter fill the same square box (§4.4).
	const gutter = $derived(showCoordinates && !framed ? manifest.coordinates.gutter : 0);
	const gutterPct = $derived((gutter / (8 + gutter)) * 100);
	const boardPct = $derived(100 - gutterPct);

	const sheet = $derived(manifest.pieces);

	// Every square, top-left to bottom-right as seen on screen.
	const squares = $derived(
		RANKS.flatMap((_, row) => FILES.map((_, col) => gridToSquare(col, row, orientation)))
	);

	interface Drag {
		id: string;
		from: Square;
		pointerId: number;
		startX: number;
		startY: number;
		x: number;
		y: number;
		/** Past the threshold: the piece follows the pointer. */
		active: boolean;
		/** The piece was already selected when pressed, so a plain click deselects it. */
		wasSelected: boolean;
	}

	let grid: HTMLDivElement;
	let selected = $state<Square | null>(null);
	let hover = $state<Square | null>(null);
	let drag = $state<Drag | null>(null);
	let promotion = $state<{ from: Square; to: Square; color: Color } | null>(null);
	/** The last square focused: the board's single tab stop (§6.5). */
	let cursor = $state<Square | null>(null);

	function movable(square: Square): boolean {
		const piece = game.pieceAt(square);
		return (
			!!piece && !locked && !game.isGameOver && piece.color === game.turn && canMove(piece.color)
		);
	}

	// A selection that stops being movable (the game moved on, input locked) just lapses.
	const active = $derived(selected && movable(selected) ? selected : null);
	const targets = $derived(active ? game.targets(active) : []);
	const tabStop = $derived(cursor ?? active ?? gridToSquare(0, 7, orientation));

	const highlights = $derived.by(() => {
		const list: Highlight[] = [];
		if (game.lastMove) {
			list.push({ square: game.lastMove.from, kind: 'last-move' });
			list.push({ square: game.lastMove.to, kind: 'last-move' });
		}
		if (game.checkSquare) list.push({ square: game.checkSquare, kind: 'check' });
		if (active) list.push({ square: active, kind: 'selected' });
		return list;
	});

	// Flipping cancels a drag in progress (§4.4).
	$effect(() => {
		void orientation;
		drag = null;
	});
	// So does any change of position from outside (undo, a new game), which also drops the
	// selection and a pending promotion.
	$effect(() => {
		void game.fen;
		selected = null;
		promotion = null;
		drag = null;
	});

	/** Try to move the selected piece; true if `to` was a legal target (including a pending promotion). */
	function tryMove(from: Square, to: Square): boolean {
		const target = active === from ? targets.find((t) => t.square === to) : undefined;
		if (!target) return false;
		selected = null;
		if (target.promotion) promotion = { from, to, color: game.turn };
		else game.move({ from, to });
		return true;
	}

	const focusSquare = (square: Square) =>
		grid.querySelector<HTMLElement>(`[data-cell="${square}"]`)?.focus();

	/** Close the picker; focus in it goes back to `square` on the board rather than being lost. */
	function closePromotion(square: Square) {
		const picker = grid.querySelector('[data-promotion-picker]');
		const hadFocus = picker?.contains(document.activeElement);
		promotion = null;
		if (hadFocus) focusSquare(square);
	}

	function promote(piece: PromotionPiece) {
		if (!promotion) return;
		const { to } = promotion;
		game.move({ from: promotion.from, to: promotion.to, promotion: piece });
		closePromotion(to);
	}

	/** Click-to-move logic, shared by pointer clicks and keyboard activation (§4.2). */
	function activate(square: Square) {
		if (promotion || locked) return;
		if (active && tryMove(active, square)) return;
		selected = active !== square && movable(square) ? square : null;
		if (selected) onselect?.();
	}

	function local(e: PointerEvent) {
		const r = grid.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top, size: r.width };
	}

	function squareAt(e: PointerEvent): Square | null {
		const { x, y, size } = local(e);
		const col = Math.floor((x / size) * 8);
		const row = Math.floor((y / size) * 8);
		if (col < 0 || col > 7 || row < 0 || row > 7) return null;
		return gridToSquare(col, row, orientation);
	}

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0 || promotion || locked || drag) return;
		const square = squareAt(e);
		if (!square) return;
		e.preventDefault(); // no text selection or focus shuffling while dragging
		if (active && active !== square && tryMove(active, square)) return;
		if (!movable(square)) {
			selected = null;
			return;
		}
		const piece = game.pieces.find((p) => p.square === square);
		if (!piece) return;
		const { x, y } = local(e);
		drag = {
			id: piece.id,
			from: square,
			pointerId: e.pointerId,
			startX: x,
			startY: y,
			x,
			y,
			active: false,
			wasSelected: active === square
		};
		if (active !== square) onselect?.();
		selected = square;
		grid.setPointerCapture(e.pointerId);
	}

	function onpointermove(e: PointerEvent) {
		if (drag && e.pointerId === drag.pointerId) {
			const { x, y } = local(e);
			if (!drag.active && Math.hypot(x - drag.startX, y - drag.startY) > DRAG_THRESHOLD) {
				drag.active = true;
			}
			drag.x = x;
			drag.y = y;
			hover = drag.active ? squareAt(e) : null;
		} else if (e.pointerType === 'mouse') {
			hover = squareAt(e);
		}
	}

	function onpointerup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const d = drag;
		drag = null;
		if (e.pointerType !== 'mouse') hover = null;
		if (d.active) {
			// Dropped on a legal target: it snaps there. Anywhere else: it goes back, still selected.
			const square = squareAt(e);
			if (square !== d.from && !(square && tryMove(d.from, square))) onillegal?.();
		} else if (d.wasSelected) {
			selected = null;
		}
	}

	function onpointercancel() {
		drag = null;
		hover = null;
	}

	// Arrow keys move between squares as seen on screen; Home/End go to the ends of the row.
	const STEPS: Record<string, [number, number]> = {
		ArrowUp: [0, -1],
		ArrowDown: [0, 1],
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0]
	};

	function navigate(e: KeyboardEvent, square: Square) {
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		const { col, row } = squareToGrid(square, orientation);
		const clamp = (n: number) => Math.min(7, Math.max(0, n));
		const step = STEPS[e.key];
		let next: [number, number];
		if (step) next = [clamp(col + step[0]), clamp(row + step[1])];
		else if (e.key === 'Home') next = [0, row];
		else if (e.key === 'End') next = [7, row];
		else return;
		e.preventDefault();
		focusSquare(gridToSquare(...next, orientation));
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (promotion) closePromotion(promotion.from);
		else if (drag) drag = null;
		else selected = null;
	}
</script>

<svelte:window {onkeydown} />

<div class="frame" data-skin={manifest.id} data-orientation={orientation}>
	<div
		class="board"
		style:left="{gutterPct}%"
		style:width="{boardPct}%"
		style:background-image="url({JSON.stringify(skin.urls.board)})"
	>
		<!-- Layers bottom to top (§5.4): highlights, pieces, indicators, squares (input),
		     speech bubble, dragged piece, promotion picker. -->
		<!-- Pointer input is handled here; the square buttons give keyboard access. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={grid}
			class="grid"
			class:dragging={drag?.active}
			style:top="{inset.top * 100}%"
			style:right="{inset.right * 100}%"
			style:bottom="{inset.bottom * 100}%"
			style:left="{inset.left * 100}%"
			style={piecesSheetStyle(skin)}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			{onpointercancel}
			onpointerleave={() => !drag && (hover = null)}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<Highlights {highlights} {orientation} />

			<!-- A new game replaces every piece without animation (§4.5). -->
			{#key game}
				{#each game.pieces as piece (piece.id)}
					<Piece
						{piece}
						square={promotion && piece.square === promotion.from ? promotion.to : piece.square}
						{orientation}
						{sheet}
						lifted={drag?.active && drag.id === piece.id ? { x: drag.x, y: drag.y } : null}
					/>
				{/each}
			{/key}

			{#if showLegalMoves}
				<Indicators {targets} {orientation} {skin} {hover} />
			{/if}

			{#each squares as square (square)}
				{@const pos = cellPosition(square, orientation)}
				<!-- Pointer input is handled on the grid; these give keyboard and screen-reader access (§6.5). -->
				<button
					class="square"
					data-cell={square}
					aria-label={squareLabel(square, game.pieceAt(square), manifest.labels)}
					aria-pressed={active === square}
					tabindex={square === tabStop ? 0 : -1}
					style:left="{pos.left}%"
					style:top="{pos.top}%"
					onclick={(e) => e.detail === 0 && activate(square)}
					onfocus={() => (cursor = square)}
					onkeydown={(e) => navigate(e, square)}
				></button>
			{/each}

			{#if bubble && manifest.emotes && skin.urls.emotes}
				{#key bubble}
					<SpeechBubble {...bubble} emotes={manifest.emotes} url={skin.urls.emotes} {orientation} />
				{/key}
			{/if}

			{#if drag?.active}
				{@const piece = game.pieces.find((p) => p.id === drag?.id)}
				{#if piece}
					<div
						class="dragged"
						data-dragging={piece.id}
						style:left="{drag.x}px"
						style:top="{drag.y}px"
					>
						<Sprite type={piece.type} color={piece.color} {sheet} />
					</div>
				{/if}
			{/if}

			{#if promotion}
				<PromotionPicker
					square={promotion.to}
					color={promotion.color}
					{orientation}
					{sheet}
					onpick={promote}
					oncancel={() => promotion && closePromotion(promotion.from)}
				/>
			{/if}
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
		/* No scrolling or zooming while dragging on touch screens (§4.2). */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.dragging {
		cursor: grabbing;
	}

	.square {
		position: absolute;
		width: 12.5%;
		height: 12.5%;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.square:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}

	/* Follows the pointer, lifted with the theme's scale and shadow (§4.2). */
	.dragged {
		position: absolute;
		width: 12.5%;
		height: 12.5%;
		translate: -50% -50%;
		scale: var(--drag-scale, 1.15);
		filter: drop-shadow(var(--drag-shadow));
		pointer-events: none;
		z-index: 1;
	}
</style>
