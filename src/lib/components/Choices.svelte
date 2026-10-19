<script lang="ts" module>
	export interface Choice<T extends string> {
		value: T;
		label: string;
		/** Muted text after the label, e.g. a preset's Elo. */
		detail?: string;
	}
</script>

<script lang="ts" generics="T extends string">
	import { legend as legendClass } from './styles.ts';

	interface Props {
		legend: string;
		choices: Choice<T>[];
		value: T;
		/** The player picked a choice (`value` is already set to it). */
		onchange?: (value: T) => void;
	}

	let { legend, choices, value = $bindable(), onchange }: Props = $props();

	const name = $props.id();
</script>

<!-- Radios drawn as chips: each input is visually hidden and its label shows its state. -->
<fieldset class="flex flex-wrap gap-2">
	<legend class={legendClass}>{legend}</legend>
	{#each choices as choice (choice.value)}
		<label
			class="flex cursor-pointer items-center gap-2 rounded bg-surface-raised px-3 py-1 has-checked:text-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
		>
			<input
				class="sr-only"
				type="radio"
				{name}
				checked={value === choice.value}
				onchange={() => {
					value = choice.value;
					onchange?.(choice.value);
				}}
			/>
			{choice.label}
			{#if choice.detail}
				<span class="text-sm text-muted tabular-nums">{choice.detail}</span>
			{/if}
		</label>
	{/each}
</fieldset>
