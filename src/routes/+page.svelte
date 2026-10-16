<script lang="ts">
	import type { Orientation } from '#lib/board/geometry.ts';
	import Board from '#lib/components/Board.svelte';
	import { piecesFromFen } from '#lib/game/pieces.ts';
	import { SKIN_IDS, skinBaseUrl, type SkinId } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';

	// Milestone 2 screen: a static position, flip and a skin switcher. The real game
	// screen and layout arrive in later milestones (§9).
	const pieces = piecesFromFen();
	let orientation = $state<Orientation>('white');
	let showCoordinates = $state(true);

	const flip = () => (orientation = orientation === 'white' ? 'black' : 'white');

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, select, textarea')) return;
		if (e.key === 'f' || e.key === 'F') flip();
	}

	async function changeSkin(e: Event & { currentTarget: HTMLSelectElement }) {
		const select = e.currentTarget;
		const id = select.value as SkinId;
		// An invalid skin leaves the current one in place, so put the picker back too.
		if (!(await skin.use(skinBaseUrl(id), id))) select.value = skin.current?.manifest.id ?? '';
	}
</script>

<svelte:head>
	<title>Chess</title>
</svelte:head>

<svelte:window {onkeydown} />

<main class="flex min-h-dvh flex-col items-center gap-4 p-4">
	<h1 class="text-3xl text-accent">Chess</h1>

	<div class="flex flex-wrap items-center justify-center gap-3">
		<label class="flex items-center gap-2">
			Skin
			<select
				class="rounded bg-surface-raised px-2 py-1"
				value={skin.current?.manifest.id}
				onchange={changeSkin}
			>
				{#each SKIN_IDS as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={showCoordinates} />
			Coordinates
		</label>
		<button class="rounded bg-surface-raised px-3 py-1" onclick={flip}>Flip board</button>
	</div>

	{#if skin.current}
		<div class="w-[min(100%,calc(100dvh-10rem))]">
			<Board skin={skin.current} {pieces} {orientation} {showCoordinates} />
		</div>
	{/if}
</main>
