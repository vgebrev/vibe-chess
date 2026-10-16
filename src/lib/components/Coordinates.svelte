<script lang="ts">
	import { fileLabels, rankLabels, type Orientation } from '#lib/board/geometry.ts';

	/** Rectangles in percent of the containing box, which must be an inline-size container. */
	interface Props {
		orientation: Orientation;
		/** Where the 8×8 playing grid sits. */
		grid: { left: number; top: number; width: number; height: number };
		/** Centre line of the file strip (from the top) and rank strip (from the left). */
		fileY: number;
		rankX: number;
		/** Label size in percent of the container width (cqw). */
		fontSize: number;
	}

	let { orientation, grid, fileY, rankX, fontSize }: Props = $props();
</script>

<div class="coordinates" aria-hidden="true" style:font-size="{fontSize}cqw">
	{#each fileLabels(orientation) as file, i (file)}
		<span
			data-file={file}
			style:left="{grid.left + ((i + 0.5) * grid.width) / 8}%"
			style:top="{fileY}%"
		>
			{file}
		</span>
	{/each}
	{#each rankLabels(orientation) as rank, i (rank)}
		<span
			data-rank={rank}
			style:left="{rankX}%"
			style:top="{grid.top + ((i + 0.5) * grid.height) / 8}%"
		>
			{rank}
		</span>
	{/each}
</div>

<style>
	.coordinates {
		position: absolute;
		inset: 0;
		pointer-events: none;
		user-select: none;
		font-family: var(--skin-font, serif), var(--font-fallback, serif);
		line-height: 1;
		color: var(--coord-text);
		text-shadow: var(--coord-shadow);
	}

	span {
		position: absolute;
		translate: -50% -50%;
	}
</style>
