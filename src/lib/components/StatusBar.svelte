<script lang="ts">
	interface Props {
		/** Whose turn it is, check, or the result. */
		status: string;
		/** The last move with its number, e.g. "12. Nf3". */
		lastMove: string | null;
		gameOver: boolean;
		onnew: () => void;
	}

	let { status, lastMove, gameOver, onnew }: Props = $props();
</script>

<!-- Status changes are announced (§6.5). Game over offers a new game inline, no modal (§6.1). -->
<div class="flex min-h-8 flex-wrap items-center justify-center gap-x-3 gap-y-1 lg:justify-start">
	<p class={gameOver ? 'text-accent' : 'text-muted'} data-status aria-live="polite">{status}</p>
	{#if gameOver}
		<button class="rounded bg-accent px-3 py-1 text-bg" onclick={onnew}>New game</button>
	{:else if lastMove}
		<p class="text-sm text-muted" data-last-move>
			<span class="sr-only">Last move:</span>
			{lastMove}
		</p>
	{/if}
</div>
