<script lang="ts">
	import { page } from '$app/state';
	import type { Orientation } from '#lib/board/geometry.ts';
	import Board from '#lib/components/Board.svelte';
	import { Game } from '#lib/game/game.svelte.ts';
	import { sideName } from '#lib/labels.ts';
	import { SKIN_IDS, skinBaseUrl, type SkinId } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';

	// Interim screen for milestone 3: hot-seat play with a skin switcher and toggles. Status
	// text, game flow and the real layout arrive in later milestones (§9).
	// `?fen=` starts from a given position (handy for testing promotion, mates, …).
	const startFen = page.url.searchParams.get('fen') ?? undefined;
	let game = $state(newGame());
	let orientation = $state<Orientation>('white');
	let showCoordinates = $state(true);
	let showLegalMoves = $state(true);

	function newGame(): Game {
		try {
			return new Game(startFen);
		} catch {
			return new Game();
		}
	}

	const flip = () => (orientation = orientation === 'white' ? 'black' : 'white');

	const status = $derived.by(() => {
		const labels = skin.current?.manifest.labels ?? {};
		const side = sideName(game.turn, labels);
		if (!game.isGameOver) return game.checkSquare ? `${side} to move — check!` : `${side} to move`;
		if (game.checkSquare)
			return `Checkmate — ${sideName(game.turn === 'w' ? 'b' : 'w', labels)} wins`;
		return 'Draw';
	});

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

<main class="flex min-h-dvh flex-col items-center gap-3 p-4">
	<h1 class="text-3xl text-accent">Chess</h1>

	<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
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
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={showLegalMoves} />
			Legal moves
		</label>
		<button class="rounded bg-surface-raised px-3 py-1" onclick={flip}>Flip board</button>
		<button class="rounded bg-surface-raised px-3 py-1" onclick={() => (game = newGame())}>
			New game
		</button>
	</div>

	<p class="text-muted" data-status aria-live="polite">{status}</p>

	{#if skin.current}
		<div class="w-[min(100%,calc(100dvh-12rem))]">
			<Board skin={skin.current} {game} {orientation} {showCoordinates} {showLegalMoves} />
		</div>
	{/if}
</main>
