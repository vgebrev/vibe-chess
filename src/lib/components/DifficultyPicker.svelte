<script lang="ts">
	import { untrack } from 'svelte';
	import {
		DEFAULT_ELO,
		ELO_RANGE,
		ELO_STEP,
		PRESETS,
		clampElo,
		presetName,
		type Difficulty,
		type PresetId
	} from '#lib/engine/difficulty.ts';
	import type { Labels } from '#lib/skins/schema.ts';
	import { option } from './options.ts';

	interface Props {
		value: Difficulty;
		labels: Labels;
		/** The engine's custom Elo range, once known (§4.6). */
		eloRange?: { min: number; max: number };
	}

	let { value = $bindable(), labels, eloRange = ELO_RANGE }: Props = $props();

	const name = $props.id();
	const level = $derived<PresetId | 'custom'>(value.kind === 'preset' ? value.id : 'custom');
	// The slider remembers its value while a preset is picked.
	let elo = $state(untrack(() => (value.kind === 'custom' ? value.elo : DEFAULT_ELO)));
	const shown = $derived(clampElo(elo, eloRange));

	function pick(next: PresetId | 'custom') {
		value = next === 'custom' ? { kind: 'custom', elo: shown } : { kind: 'preset', id: next };
	}
</script>

<!-- Presets plus Custom with an Elo slider in steps of 50 (§4.6). -->
<fieldset class="flex flex-wrap gap-2">
	<legend class="mb-1 text-sm text-muted">Difficulty</legend>
	{#each [...PRESETS.map((p) => p.id), 'custom' as const] as id (id)}
		<label class={option}>
			<input class="sr-only" type="radio" {name} checked={level === id} onchange={() => pick(id)} />
			{id === 'custom' ? 'Custom' : presetName(id, labels)}
		</label>
	{/each}
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
				value={shown}
				oninput={(e) => {
					elo = e.currentTarget.valueAsNumber;
					value = { kind: 'custom', elo: shown };
				}}
				data-elo
			/>
			<output class="w-12 text-right tabular-nums">{shown}</output>
		</label>
		<p class="text-sm text-muted">
			{eloRange.min} is already a solid club player. New to chess? Try a preset.
		</p>
	</div>
{/if}
