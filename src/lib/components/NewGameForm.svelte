<script lang="ts">
	import { untrack } from 'svelte';
	import type { ColorChoice, GameSetup, Mode } from '#lib/game/setup.ts';
	import { sideName } from '#lib/labels.ts';
	import type { Labels } from '#lib/skins/schema.ts';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import { option, primary } from './styles.ts';

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

		<DifficultyPicker bind:value={difficulty} {labels} />
	{/if}

	<button class={[primary, 'mt-1 px-3 py-2']}>Start</button>
</form>
