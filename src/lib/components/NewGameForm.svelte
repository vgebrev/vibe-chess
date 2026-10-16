<script lang="ts">
	import { untrack } from 'svelte';
	import {
		DEFAULT_ELO,
		ELO_RANGE,
		ELO_STEP,
		PRESETS,
		clampElo,
		presetName,
		type PresetId
	} from '#lib/engine/difficulty.ts';
	import type { ColorChoice, GameSetup, Mode } from '#lib/game/setup.ts';
	import { sideName } from '#lib/labels.ts';
	import type { Labels } from '#lib/skins/schema.ts';

	interface Props {
		/** The choices the form opens with: the last game's. */
		initial: GameSetup;
		labels: Labels;
		/** The engine's custom Elo range, once known (§4.6). */
		eloRange?: { min: number; max: number };
		onstart: (setup: GameSetup) => void;
		oncancel: () => void;
	}

	let { initial, labels, eloRange = ELO_RANGE, onstart, oncancel }: Props = $props();

	// The form is mounted fresh each time it opens, so it starts from `initial` once.
	const start = untrack(() => initial);
	let mode = $state<Mode>(start.mode);
	let color = $state<ColorChoice>(start.color);
	let level = $state<PresetId | 'custom'>(
		start.difficulty.kind === 'preset' ? start.difficulty.id : 'custom'
	);
	let elo = $state(start.difficulty.kind === 'custom' ? start.difficulty.elo : DEFAULT_ELO);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		onstart({
			mode,
			color,
			difficulty:
				level === 'custom'
					? { kind: 'custom', elo: clampElo(elo, eloRange) }
					: { kind: 'preset', id: level }
		});
	}

	const option =
		'flex cursor-pointer items-center gap-2 rounded bg-surface-raised px-3 py-1 has-checked:text-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2';
</script>

<!-- New game: mode, colour and difficulty (§4.7). M7 puts this in a Drawer. -->
<form class="flex w-full flex-col gap-3" aria-label="New game" onsubmit={submit} data-new-game>
	<fieldset class="flex flex-wrap gap-2">
		<legend class="mb-1 text-sm text-muted">Opponent</legend>
		<label class={option}>
			<input class="sr-only" type="radio" bind:group={mode} value="computer" />Computer
		</label>
		<label class={option}>
			<input class="sr-only" type="radio" bind:group={mode} value="hotseat" />Two players
		</label>
	</fieldset>

	{#if mode === 'computer'}
		<fieldset class="flex flex-wrap gap-2">
			<legend class="mb-1 text-sm text-muted">Play as</legend>
			{#each [['w', sideName('w', labels)], ['b', sideName('b', labels)], ['random', 'Random']] as [value, name] (value)}
				<label class={option}>
					<input class="sr-only" type="radio" bind:group={color} {value} />{name}
				</label>
			{/each}
		</fieldset>

		<fieldset class="flex flex-wrap gap-2">
			<legend class="mb-1 text-sm text-muted">Difficulty</legend>
			{#each PRESETS as preset (preset.id)}
				<label class={option}>
					<input class="sr-only" type="radio" bind:group={level} value={preset.id} />
					{presetName(preset.id, labels)}
				</label>
			{/each}
			<label class={option}>
				<input class="sr-only" type="radio" bind:group={level} value="custom" />Custom
			</label>
		</fieldset>

		{#if level === 'custom'}
			<div class="flex flex-col gap-1">
				<label class="flex items-center gap-3">
					<span class="shrink-0">Elo</span>
					<input
						class="min-w-0 flex-1 accent-(--accent)"
						type="range"
						min={eloRange.min}
						max={eloRange.max}
						step={ELO_STEP}
						bind:value={elo}
						data-elo
					/>
					<output class="w-12 text-right tabular-nums">{elo}</output>
				</label>
				<p class="text-sm text-muted">
					{eloRange.min} is already a solid club player. New to chess? Try a preset.
				</p>
			</div>
		{/if}
	{/if}

	<div class="flex justify-end gap-2">
		<button type="button" class="rounded bg-surface-raised px-3 py-1" onclick={oncancel}>
			Cancel
		</button>
		<button class="rounded bg-accent px-3 py-1 text-bg">Start</button>
	</div>
</form>
