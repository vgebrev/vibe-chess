<script lang="ts">
	import type { Category, Volumes } from '#lib/audio/mixer.ts';
	import type { Difficulty } from '#lib/engine/difficulty.ts';
	import type { SkinId, SkinInfo } from '#lib/skins/index.ts';
	import type { Labels } from '#lib/skins/schema.ts';
	import Choices from './Choices.svelte';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import Icon from './Icon.svelte';
	import { legend, slider } from './styles.ts';

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
		/** Volume per sound category, 0–1 (§4.11). */
		sound: Volumes;
		/** The volume each category goes back to when unmuted (its last above 0). */
		unmuted: Volumes;
		/** The categories the skin has sounds for; each gets a slider and a mute toggle. */
		soundCategories: Category[];
		/** Vibration on events (§4.12), offered only where the device can vibrate. */
		haptics: boolean;
		canVibrate: boolean;
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
		sound = $bindable(),
		unmuted = $bindable(),
		soundCategories,
		haptics = $bindable(),
		canVibrate
	}: Props = $props();

	// A checkbox with its label beside it.
	const toggle = 'flex cursor-pointer items-center gap-3 py-1';
	const checkbox = 'size-4 accent-(--accent)';
	const SOUND_NAMES: Record<Category, string> = {
		music: 'Music',
		sfx: 'Effects',
		voices: 'Voices'
	};

	function setVolume(category: Category, volume: number) {
		sound = { ...sound, [category]: volume };
		if (volume > 0) unmuted = { ...unmuted, [category]: volume };
	}
</script>

<!-- Settings apply as they change: skin (when there is a choice), guidance, coordinates, auto-flip,
     sound volumes (for what the skin has), vibration (where it works), difficulty (§4.7, §4.11,
     §4.12). -->
<div class="flex flex-col gap-4">
	{#if skins.length > 1}
		<Choices
			legend="Skin"
			choices={skins.map(({ id, name }) => ({ value: id, label: name }))}
			value={skinId as SkinId}
			onchange={onskin}
		/>
	{/if}

	<fieldset class="flex flex-col">
		<legend class={legend}>Board</legend>
		<label class={toggle}>
			<input class={checkbox} type="checkbox" bind:checked={showLegalMoves} />
			Show legal moves
		</label>
		<label class={toggle}>
			<input class={checkbox} type="checkbox" bind:checked={showCoordinates} />
			Show coordinates
		</label>
		{#if !vsComputer}
			<label class={toggle}>
				<input class={checkbox} type="checkbox" bind:checked={autoFlip} />
				Auto-flip
			</label>
		{/if}
	</fieldset>

	{#if soundCategories.length > 0 || canVibrate}
		<fieldset class="flex flex-col gap-1">
			<legend class={legend}>Sound</legend>
			{#each soundCategories as category (category)}
				{@const muted = sound[category] === 0}
				<div class="flex items-center gap-3">
					<label class="w-16 shrink-0" for="volume-{category}">{SOUND_NAMES[category]}</label>
					<!-- Muting sets the volume to 0; unmuting brings back the last level above 0. -->
					<label
						class="-m-1 flex cursor-pointer rounded p-1 text-accent has-checked:text-muted has-focus-visible:outline-2 has-focus-visible:outline-accent"
					>
						<input
							class="sr-only"
							type="checkbox"
							aria-label="Mute {SOUND_NAMES[category]}"
							checked={muted}
							onchange={(e) => setVolume(category, e.currentTarget.checked ? 0 : unmuted[category])}
							data-mute={category}
						/>
						<Icon name={muted ? 'muted' : 'sound'} />
					</label>
					<input
						id="volume-{category}"
						class={slider}
						type="range"
						min="0"
						max="100"
						step="5"
						value={Math.round(sound[category] * 100)}
						oninput={(e) => setVolume(category, e.currentTarget.valueAsNumber / 100)}
					/>
					<output class="w-12 text-right tabular-nums" for="volume-{category}">
						{muted ? 'Off' : `${Math.round(sound[category] * 100)}%`}
					</output>
				</div>
			{/each}
			{#if canVibrate}
				<label class={toggle}>
					<input class={checkbox} type="checkbox" bind:checked={haptics} />
					Vibration
				</label>
			{/if}
		</fieldset>
	{/if}

	{#if vsComputer}
		<div class="flex flex-col gap-3">
			<DifficultyPicker bind:value={difficulty} {labels} />
			<p class="text-sm text-muted">Applies from the computer's next move.</p>
		</div>
	{/if}
</div>
