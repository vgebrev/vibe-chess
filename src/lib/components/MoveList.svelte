<script lang="ts">
	import { moveRows } from '#lib/game/notation.ts';

	interface Props {
		startFen: string;
		/** SAN of the moves played, oldest first. */
		moves: string[];
	}

	let { startFen, moves }: Props = $props();

	const rows = $derived(moveRows(startFen, moves));

	let list: HTMLOListElement;

	// Keep the latest move in view.
	$effect(() => {
		void rows;
		list.scrollTop = list.scrollHeight;
	});
</script>

<!-- SAN in numbered pairs, the current (last) move highlighted (§4.7). -->
<ol
	bind:this={list}
	class="max-h-48 w-full overflow-y-auto tabular-nums lg:max-h-[calc(100dvh-16rem)]"
	aria-label="Moves"
	data-moves
>
	{#each rows as row, i (row.number)}
		{@const last = i === rows.length - 1}
		<li class="grid grid-cols-[3rem_1fr_1fr] gap-x-2 px-2 odd:bg-surface">
			<span class="text-muted">{row.number}.</span>
			{#each [row.white, row.black] as san, j (j)}
				{@const current = last && (j === 1 ? san !== null : row.black === null)}
				<span
					class={['rounded px-1', current && 'bg-surface-raised text-accent']}
					aria-current={current ? 'step' : undefined}>{san ?? (j === 0 ? '…' : '')}</span
				>
			{/each}
		</li>
	{:else}
		<li class="px-2 text-muted">No moves yet</li>
	{/each}
</ol>
