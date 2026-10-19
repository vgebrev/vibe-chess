<script lang="ts">
	import { primary } from './styles.ts';

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

<!-- Game over offers a new game inline, as well as in the game-over overlay (§6.1). -->
<div class="flex min-h-8 flex-wrap items-center justify-center gap-x-3 gap-y-1 lg:justify-start">
	<!-- Status changes are announced with the move that caused them, so a screen reader hears
	     the computer's reply (§6.5). -->
	<p class="sr-only" aria-live="polite" aria-atomic="true" data-announce>
		{lastMove ? `${lastMove}. ${status}` : status}
	</p>
	<p class={gameOver ? 'text-accent' : 'text-muted'} data-status>{status}</p>
	{#if gameOver}
		<button class={[primary, 'px-3 py-1']} onclick={onnew}>New game</button>
	{:else if lastMove}
		<p class="text-sm text-muted" data-last-move>
			<span class="sr-only">Last move:</span>
			{lastMove}
		</p>
	{/if}
</div>
