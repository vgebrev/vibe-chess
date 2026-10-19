<script lang="ts">
	import { untrack } from 'svelte';
	import type { ColorChoice, GameSetup, Mode } from '#lib/game/setup.ts';
	import { sideName } from '#lib/labels.ts';
	import type { Labels } from '#lib/skins/schema.ts';
	import Choices from './Choices.svelte';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import { primary } from './styles.ts';

	interface Props {
		/** The choices the form opens with: the last game's. */
		initial: GameSetup;
		labels: Labels;
		onstart: (setup: GameSetup) => void;
	}

	let { initial, labels, onstart }: Props = $props();

	// The form is mounted fresh each time its drawer opens, so it starts from `initial` once.
	const start = untrack(() => initial);
	let mode = $state<Mode>(start.mode);
	let color = $state<ColorChoice>(start.color);
	let difficulty = $state(start.difficulty);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		onstart({ mode, color, difficulty });
	}
</script>

<!-- New game: mode, colour and difficulty (§4.7), shown in a Drawer. -->
<form class="flex w-full flex-col gap-3" aria-label="New game" onsubmit={submit}>
	<Choices
		legend="Opponent"
		choices={[
			{ value: 'computer', label: 'Computer' },
			{ value: 'hotseat', label: 'Two players' }
		]}
		bind:value={mode}
	/>

	{#if mode === 'computer'}
		<Choices
			legend="Play as"
			choices={[
				{ value: 'w', label: sideName('w', labels) },
				{ value: 'b', label: sideName('b', labels) },
				{ value: 'random', label: 'Random' }
			]}
			bind:value={color}
		/>

		<DifficultyPicker bind:value={difficulty} {labels} />
	{/if}

	<button class={[primary, 'mt-1 px-3 py-2']}>Start</button>
</form>
