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
	import Choices, { type Choice } from './Choices.svelte';
	import { slider } from './styles.ts';

	interface Props {
		value: Difficulty;
		labels: Labels;
	}

	let { value = $bindable(), labels }: Props = $props();

	const level = $derived<PresetId | 'custom'>(value.kind === 'preset' ? value.id : 'custom');
	// The slider remembers its value while a preset is picked.
	let elo = $state(untrack(() => (value.kind === 'custom' ? value.elo : DEFAULT_ELO)));
	const shown = $derived(clampElo(elo));

	function pick(next: PresetId | 'custom') {
		value = next === 'custom' ? { kind: 'custom', elo: shown } : { kind: 'preset', id: next };
	}

	const choices = $derived<Choice<PresetId | 'custom'>[]>([
		...PRESETS.map(({ id, elo }) => ({
			value: id,
			label: presetName(id, labels),
			detail: `(${elo})`
		})),
		{ value: 'custom', label: 'Custom' }
	]);
</script>

<!-- Presets, each with the Elo it plays at, plus Custom with an Elo slider in steps of 50 (§4.6). -->
<Choices legend="Difficulty" {choices} value={level} onchange={pick} />

{#if level === 'custom'}
	<div class="flex flex-col gap-1">
		<label class="flex items-center gap-3">
			<span class="shrink-0">Elo</span>
			<input
				class={slider}
				type="range"
				min={ELO_RANGE.min}
				max={ELO_RANGE.max}
				step={ELO_STEP}
				value={shown}
				oninput={(e) => {
					elo = e.currentTarget.valueAsNumber;
					pick('custom');
				}}
				data-elo
			/>
			<output class="w-12 text-right tabular-nums">{shown}</output>
		</label>
		<p class="text-sm text-muted">
			Stockfish's own ratings, from games against other engines, so only a rough guide for people.
		</p>
	</div>
{/if}
