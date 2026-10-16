<script lang="ts">
	interface Props {
		canUndo: boolean;
		canResign: boolean;
		onnew: () => void;
		onundo: () => void;
		onflip: () => void;
		onresign: () => void;
	}

	let { canUndo, canResign, onnew, onundo, onflip, onresign }: Props = $props();

	// Resigning takes an inline second tap rather than a dialog (§6.1).
	let confirming = $state(false);
	$effect(() => {
		if (!canResign) confirming = false;
	});

	const button =
		'rounded bg-surface-raised px-3 py-1 enabled:hover:text-accent disabled:opacity-50';
</script>

<div
	class="flex flex-wrap items-center justify-center gap-2 lg:grid lg:grid-cols-2 lg:items-stretch"
	data-controls
>
	<button class={button} onclick={onnew}>New game</button>
	<button class={button} onclick={onundo} disabled={!canUndo}>Undo</button>
	<button class={button} onclick={onflip}>Flip board</button>
	{#if confirming}
		<span
			class="flex items-center justify-center gap-1"
			role="group"
			aria-label="Confirm resignation"
		>
			Resign?
			<button
				{@attach (el: HTMLButtonElement) => el.focus()}
				class="{button} text-danger"
				aria-label="Yes, resign"
				onclick={() => {
					confirming = false;
					onresign();
				}}>✓</button
			>
			<button class={button} aria-label="No, keep playing" onclick={() => (confirming = false)}
				>✕</button
			>
		</span>
	{:else}
		<button class={button} onclick={() => (confirming = true)} disabled={!canResign}>Resign</button>
	{/if}
</div>
