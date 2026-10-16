<script lang="ts">
	import type { Color } from 'chess.js';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { Orientation } from '#lib/board/geometry.ts';
	import { AUTO_FLIP_DELAY_MS } from '#lib/board/motion.ts';
	import Board from '#lib/components/Board.svelte';
	import Controls from '#lib/components/Controls.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import PlayerStrip from '#lib/components/PlayerStrip.svelte';
	import NewGameForm from '#lib/components/NewGameForm.svelte';
	import StatusBar from '#lib/components/StatusBar.svelte';
	import { Opponent } from '#lib/engine/opponent.svelte.ts';
	import { Game } from '#lib/game/game.svelte.ts';
	import { numberedMove } from '#lib/game/notation.ts';
	import { DEFAULT_SETUP, pickColor, type GameSetup } from '#lib/game/setup.ts';
	import { statusText } from '#lib/labels.ts';
	import { SKIN_IDS, skinBaseUrl, type SkinId } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';

	// Interim screen for milestone 6: vs-Computer and hot-seat play with a skin switcher and
	// toggles, and the lg side panel. The full layout and the drawers arrive in M7 (§9).
	// `?fen=` starts from a given position (handy for testing promotion, mates, …), and
	// `?mode=hotseat` / `?color=b` pick the first game's setup.
	const params = page.url.searchParams;
	const startFen = params.get('fen') ?? undefined;
	let setup = $state<GameSetup>({
		...DEFAULT_SETUP,
		mode: params.get('mode') === 'hotseat' ? 'hotseat' : DEFAULT_SETUP.mode,
		color: params.get('color') === 'b' ? 'b' : DEFAULT_SETUP.color
	});
	/** The player's colour vs the computer. */
	let human = $state<Color>(untrack(() => pickColor(setup.color)));
	let game = $state(newGame());
	let orientation = $state<Orientation>(untrack(() => (human === 'w' ? 'white' : 'black')));
	let newGameOpen = $state(false);
	/** Why the game isn't what was asked for, e.g. the engine failed to load. */
	let notice = $state<string | null>(null);
	let showCoordinates = $state(true);
	let showLegalMoves = $state(true);
	let autoFlip = $state(false);
	/** An auto-flip is due; input waits for it. */
	let turning = $state(false);

	function newGame(): Game {
		try {
			return new Game(startFen);
		} catch {
			return new Game();
		}
	}

	const opponent = new Opponent();
	const vsComputer = $derived(setup.mode === 'computer');
	/** The computer is to move. */
	const engineTurn = $derived(vsComputer && !game.isGameOver && game.turn !== human);

	function startGame(next: GameSetup) {
		opponent.cancel();
		setup = next;
		human = pickColor(next.color);
		game = newGame();
		orientation = vsComputer && human === 'b' ? 'black' : 'white';
		newGameOpen = false;
		notice = null;
	}

	const flip = () => (orientation = orientation === 'white' ? 'black' : 'white');
	// vs Computer, Undo takes back the player's move and the reply (§4.7).
	const canUndo = $derived(vsComputer ? game.canUndoTurn(human) : game.canUndo);
	function undo() {
		if (!vsComputer) return void game.undo();
		opponent.cancel();
		game.undoTurn(human);
	}

	// The computer plays its turns. A new position, undo or new game cancels a pending reply.
	$effect(() => {
		if (!engineTurn) return;
		const current = game;
		void current.fen;
		const difficulty = setup.difficulty;
		untrack(() => opponent.play(current, difficulty));
		return () => opponent.cancel();
	});

	// Start the engine as soon as a vs-Computer game begins, not on the first reply (§4.6).
	$effect(() => {
		if (vsComputer) untrack(() => opponent.load());
	});

	// If the engine can't load, carry on as a two-player game (§4.6).
	$effect(() => {
		if (opponent.status !== 'failed' || !vsComputer) return;
		setup = { ...setup, mode: 'hotseat' };
		notice = 'The computer opponent could not be loaded, so this is now a two-player game.';
	});

	const labels = $derived(skin.current?.manifest.labels ?? {});
	const status = $derived(
		statusText(
			{
				turn: game.turn,
				inCheck: game.checkSquare !== null,
				thinking: engineTurn,
				result: game.result
			},
			labels
		)
	);
	const lastMove = $derived(
		game.lastMove ? numberedMove(game.startFen, game.moves.length - 1, game.lastMove.san) : null
	);

	// Strips follow the board: the top one belongs to the side drawn at the top (§4.10).
	const bottom = $derived<Color>(orientation === 'white' ? 'w' : 'b');
	const top = $derived<Color>(bottom === 'w' ? 'b' : 'w');
	const advantage = (color: Color) => (color === 'w' ? game.material : -game.material);

	// Hot-seat auto-flip (§3): once a move has landed, turn the board to the side to move.
	$effect(() => {
		if (!autoFlip || vsComputer) return;
		const side: Orientation = game.turn === 'w' ? 'white' : 'black';
		if (untrack(() => orientation) === side) return;
		turning = true;
		const timer = setTimeout(() => {
			orientation = side;
			turning = false;
		}, AUTO_FLIP_DELAY_MS);
		return () => {
			clearTimeout(timer);
			turning = false;
		};
	});

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (e.altKey || target.closest('input, select, textarea, dialog')) return;
		if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if (!e.ctrlKey && !e.metaKey && (e.key === 'f' || e.key === 'F')) {
			flip();
		}
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

<main class="flex min-h-dvh flex-col items-center gap-2 p-4">
	<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
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
		{#if !vsComputer}
			<label class="flex items-center gap-2">
				<input type="checkbox" bind:checked={autoFlip} />
				Auto-flip
			</label>
		{/if}
	</div>

	<!-- Below lg: one column. From lg: status, controls and moves in a side panel (§6.2). -->
	<div
		class="flex w-full flex-col items-center gap-2 lg:flex-row lg:items-start lg:justify-center lg:gap-6"
	>
		{#if skin.current}
			<div
				class="flex w-[min(100%,calc(100dvh-15rem))] flex-col gap-1 lg:w-[min(calc(100vw-20rem-3.5rem),calc(100dvh-10rem))]"
			>
				<PlayerStrip
					color={top}
					skin={skin.current}
					captured={game.captured[top]}
					advantage={advantage(top)}
					active={!game.isGameOver && game.turn === top}
				/>
				<Board
					skin={skin.current}
					{game}
					{orientation}
					{showCoordinates}
					{showLegalMoves}
					locked={turning}
					canMove={(color) => !vsComputer || color === human}
				/>
				<PlayerStrip
					color={bottom}
					skin={skin.current}
					captured={game.captured[bottom]}
					advantage={advantage(bottom)}
					active={!game.isGameOver && game.turn === bottom}
				/>
			</div>
		{/if}

		<div
			class="flex w-full max-w-xs flex-col items-center gap-2 lg:w-80 lg:max-w-none lg:items-stretch lg:pt-9"
			data-panel
		>
			<StatusBar
				{status}
				{lastMove}
				gameOver={game.isGameOver}
				onnew={() => (newGameOpen = true)}
			/>
			{#if notice}
				<p class="text-sm text-danger" role="alert">{notice}</p>
			{/if}

			<Controls
				{canUndo}
				canResign={!game.isGameOver}
				onnew={() => (newGameOpen = true)}
				onundo={undo}
				onflip={flip}
				onresign={() => game.resign(vsComputer ? human : game.turn)}
			/>

			<MoveList startFen={game.startFen} moves={game.moves.map((m) => m.san)} />
		</div>
	</div>

	{#if newGameOpen}
		<dialog
			{@attach (dialog: HTMLDialogElement) => dialog.showModal()}
			class="m-auto w-[min(100%-2rem,24rem)] rounded-lg bg-surface p-4 text-text backdrop:bg-black/50"
			aria-label="New game"
			oncancel={() => (newGameOpen = false)}
		>
			<NewGameForm
				initial={setup}
				{labels}
				eloRange={opponent.eloRange ?? undefined}
				onstart={startGame}
				oncancel={() => (newGameOpen = false)}
			/>
		</dialog>
	{/if}
</main>
