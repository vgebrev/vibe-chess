<script lang="ts">
	import { ELO_RANGE, type Difficulty } from '#lib/engine/difficulty.ts';
	import type { SkinId, SkinInfo } from '#lib/skins/index.ts';
	import type { Labels } from '#lib/skins/schema.ts';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import { option } from './options.ts';

	interface Props {
		skinId: string;
		/** The skins to choose from; with fewer than two there is no choice to offer (§5.5). */
		skins: SkinInfo[];
		onskin: (id: SkinId) => void;
		showLegalMoves: boolean;
		showCoordinates: boolean;
		autoFlip: boolean;
		/** Difficulty applies vs Computer; auto-flip in hot-seat (§4.7). */
		vsComputer: boolean;
		difficulty: Difficulty;
		labels: Labels;
		eloRange?: { min: number; max: number };
	}

	let {
		skinId,
		skins,
		onskin,
		showLegalMoves = $bindable(),
		showCoordinates = $bindable(),
		autoFlip = $bindable(),
		vsComputer,
		difficulty = $bindable(),
		labels,
		eloRange = ELO_RANGE
	}: Props = $props();

	const toggle = 'flex cursor-pointer items-center gap-3 py-1';
</script>

<!-- Settings apply as they change: skin (when there is a choice), guidance, coordinates, auto-flip, difficulty (§4.7). -->
<div class="flex flex-col gap-4" data-settings>
	{#if skins.length > 1}
		<fieldset class="flex flex-wrap gap-2">
			<legend class="mb-1 text-sm text-muted">Skin</legend>
			{#each skins as { id, name } (id)}
				<label class={option}>
					<input
						class="sr-only"
						type="radio"
						name="skin"
						checked={skinId === id}
						onchange={() => onskin(id)}
					/>
					{name}
				</label>
			{/each}
		</fieldset>
	{/if}

	<fieldset class="flex flex-col">
		<legend class="mb-1 text-sm text-muted">Board</legend>
		<label class={toggle}>
			<input class="size-4 accent-(--accent)" type="checkbox" bind:checked={showLegalMoves} />
			Show legal moves
		</label>
		<label class={toggle}>
			<input class="size-4 accent-(--accent)" type="checkbox" bind:checked={showCoordinates} />
			Show coordinates
		</label>
		{#if !vsComputer}
			<label class={toggle}>
				<input class="size-4 accent-(--accent)" type="checkbox" bind:checked={autoFlip} />
				Auto-flip
			</label>
		{/if}
	</fieldset>

	{#if vsComputer}
		<div class="flex flex-col gap-3">
			<DifficultyPicker bind:value={difficulty} {labels} {eloRange} />
			<p class="text-sm text-muted">Applies from the computer's next move.</p>
		</div>
	{/if}
</div>
