<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		canUndo: boolean;
		canResign: boolean;
		onnew: () => void;
		onundo: () => void;
		onflip: () => void;
		onresign: () => void;
		/** Opens the move list drawer; the button only shows below lg (§6.1). */
		onmoves?: () => void;
	}

	let { canUndo, canResign, onnew, onundo, onflip, onresign, onmoves }: Props = $props();

	// Resigning takes an inline second tap rather than a dialog (§6.1).
	let confirming = $state(false);
	/** Put focus back on Resign after "No", since the confirmation replaced it. */
	let refocus = false;
	$effect(() => {
		if (!canResign) confirming = false;
	});

	const button =
		'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded bg-surface-raised px-1 py-1 text-xs enabled:hover:text-accent disabled:opacity-50 lg:min-h-0 lg:flex-row lg:gap-2 lg:px-3 lg:text-base';
</script>

{#snippet control(
	icon: IconName,
	short: string,
	name: string,
	onclick: () => void,
	disabled = false,
	attach?: (el: HTMLButtonElement) => void
)}
	<!-- Short labels below lg; the name in full beside the panel's icons at lg. -->
	<button class={button} aria-label={name} {onclick} {disabled} {@attach attach}>
		<Icon name={icon} />
		<span class="lg:hidden">{short}</span>
		<span class="hidden lg:inline">{name}</span>
	</button>
{/snippet}

<!-- Icon buttons with short labels in a bar below lg; a 2×2 grid in the side panel at lg. -->
<div
	class={['grid gap-1 lg:grid-cols-2 lg:gap-2', onmoves ? 'grid-cols-5' : 'grid-cols-4']}
	data-controls
>
	{#if confirming}
		<div
			class="col-span-full flex min-h-12 items-center justify-center gap-2"
			role="group"
			aria-label="Confirm resignation"
		>
			Resign?
			<button
				{@attach (el: HTMLButtonElement) => el.focus()}
				class="flex items-center gap-1 rounded bg-surface-raised px-3 py-2 text-danger hover:text-accent"
				aria-label="Yes, resign"
				onclick={() => {
					confirming = false;
					onresign();
				}}><Icon name="yes" />Yes</button
			>
			<button
				class="flex items-center gap-1 rounded bg-surface-raised px-3 py-2 hover:text-accent"
				aria-label="No, keep playing"
				onclick={() => {
					refocus = true;
					confirming = false;
				}}><Icon name="no" />No</button
			>
		</div>
	{:else}
		{@render control('new', 'New', 'New game', onnew)}
		{@render control('undo', 'Undo', 'Undo', onundo, !canUndo)}
		{@render control('flip', 'Flip', 'Flip board', onflip)}
		{@render control(
			'resign',
			'Resign',
			'Resign',
			() => (confirming = true),
			!canResign,
			(el) => {
				if (refocus) el.focus();
				refocus = false;
			}
		)}
		{#if onmoves}
			<div class="contents lg:hidden">
				{@render control('moves', 'Moves', 'Moves', onmoves)}
			</div>
		{/if}
	{/if}
</div>
