<script lang="ts">
	import type { Color, PieceSymbol } from 'chess.js';
	import { other } from '#lib/game/color.ts';
	import { capturesLabel, sideName } from '#lib/labels.ts';
	import { piecesSheetStyle, type LoadedSkin } from '#lib/skins/loader.ts';
	import Sprite from './Sprite.svelte';

	interface Props {
		color: Color;
		skin: LoadedSkin;
		/** Pieces this side has captured, in display order. */
		captured: PieceSymbol[];
		/** This side's material lead; shown as +N only when positive. */
		advantage: number;
		/** It is this side's turn. */
		active: boolean;
		/** The computer's Elo, shown under its name; null for a human player. */
		elo?: number | null;
	}

	let { color, skin, captured, advantage, active, elo = null }: Props = $props();

	const labels = $derived(skin.manifest.labels);
	const sheet = $derived(skin.manifest.pieces);
	// Same-type captures overlap, and squeeze closer when space runs out, so a full set fits on
	// a phone (§4.10).
	const groups = $derived(
		captured.reduce<{ type: PieceSymbol; count: number }[]>((groups, type) => {
			const last = groups.at(-1);
			if (last?.type === type) last.count++;
			else groups.push({ type, count: 1 });
			return groups;
		}, [])
	);
</script>

<!-- One side's name, its captures and its material lead (§4.10). The top strip belongs to the
     side at the top of the board. -->
<div
	class="flex h-8 min-w-0 items-center gap-2"
	data-strip={color}
	data-active={active || undefined}
	style={piecesSheetStyle(skin)}
>
	<span
		class={[
			'size-2.5 shrink-0 rounded-full border border-muted',
			active && 'border-accent bg-accent'
		]}
		aria-hidden="true"
	></span>
	<span class="flex shrink-0 flex-col leading-none">
		{sideName(color, labels)}
		{#if elo !== null}
			<span class="mt-0.5 text-xs text-muted tabular-nums" data-elo-label>{elo} Elo</span>
		{/if}
	</span>
	<span
		class="flex min-w-0 items-center gap-0.5"
		role="img"
		aria-label={capturesLabel(color, captured, advantage, labels)}
	>
		{#each groups as group (group.type)}
			<span class="capture-group">
				{#each { length: group.count }, i (i)}
					<span class="captured" data-captured={group.type}>
						<span class="sprite-box">
							<Sprite type={group.type} color={other(color)} {sheet} />
						</span>
					</span>
				{/each}
			</span>
		{/each}
	</span>
	{#if advantage > 0}
		<span class="shrink-0 text-sm text-muted" data-advantage aria-hidden="true">+{advantage}</span>
	{/if}
</div>

<style>
	/* Captures are 1.875rem (30 px) sprites. Within a group each one shows 12 px of itself and
	   gives up more when the strip is short of room, down to 6 px; the last of a group shows in
	   full, so nothing spills over the next group or the +N. */
	.capture-group {
		display: flex;
		min-width: 0;
	}

	.captured {
		--size: 1.875rem;
		position: relative;
		/* An explicit width, not just a flex-basis, so the strip's intrinsic size counts it. */
		width: 0.75rem;
		height: var(--size);
		flex: 0 1 auto;
		min-width: 0.375rem;
	}

	.captured:last-child {
		flex: none;
		width: var(--size);
	}

	.sprite-box {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--size);
	}
</style>
