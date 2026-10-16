<script lang="ts">
	import type { Color } from 'chess.js';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { Orientation } from '#lib/board/geometry.ts';
	import { AUTO_FLIP_DELAY_MS } from '#lib/board/motion.ts';
	import Board from '#lib/components/Board.svelte';
	import Controls from '#lib/components/Controls.svelte';
	import Drawer from '#lib/components/Drawer.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import PlayerStrip from '#lib/components/PlayerStrip.svelte';
	import NewGameForm from '#lib/components/NewGameForm.svelte';
	import SettingsPanel from '#lib/components/SettingsPanel.svelte';
	import StatusBar from '#lib/components/StatusBar.svelte';
	import { Opponent } from '#lib/engine/opponent.svelte.ts';
	import { Game, type PromotionPiece } from '#lib/game/game.svelte.ts';
	import { numberedMove } from '#lib/game/notation.ts';
	import { DEFAULT_SETUP, pickColor, type GameSetup } from '#lib/game/setup.ts';
	import { statusText } from '#lib/labels.ts';
	import { loadGame, loadSettings, saveGame, saveSettings } from '#lib/persistence.ts';
	import { skinBaseUrl, type SkinId } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';

	// The game screen (§6): header, strips, board and control bar in one column below lg; the
	// status, move list and controls in a side panel from lg. New game, Settings and (below lg)
	// the move list open in drawers. The game and settings are saved as they change and resumed
	// on reload (§4.9). `?fen=` starts from a given position (handy for testing promotion,
	// mates, …), and `?mode=hotseat` / `?color=b` pick the first game's setup; any of them
	// starts a new game instead of resuming the saved one.
	const params = page.url.searchParams;
	const startFen = params.get('fen') ?? undefined;
	const settings = loadSettings();
	const resumed = ['fen', 'mode', 'color'].some((p) => params.has(p)) ? null : resume();
	let setup = $state<GameSetup>(
		resumed?.setup ?? {
			...DEFAULT_SETUP,
			mode: params.get('mode') === 'hotseat' ? 'hotseat' : DEFAULT_SETUP.mode,
			color: params.get('color') === 'b' ? 'b' : DEFAULT_SETUP.color,
			difficulty: settings.lastDifficulty
		}
	);
	/** The player's colour vs the computer. */
	let human = $state<Color>(untrack(() => resumed?.human ?? pickColor(setup.color)));
	let game = $state(resumed?.game ?? newGame());
	let orientation = $state<Orientation>(
		untrack(() => resumed?.orientation ?? (human === 'w' ? 'white' : 'black'))
	);
	/** The open drawer, if any (§6.3). */
	let drawer = $state<'new' | 'settings' | 'moves' | null>(null);
	/** Why the game isn't what was asked for, e.g. the engine failed to load. */
	let notice = $state<string | null>(null);
	let showCoordinates = $state(settings.showCoordinates);
	let showLegalMoves = $state(settings.showLegalMoves);
	let autoFlip = $state(settings.autoFlip);
	/** An auto-flip is due; input waits for it. */
	let turning = $state(false);

	/** The saved game, replayed; null if there is none or it no longer replays. */
	function resume() {
		const saved = loadGame();
		const game = saved && Game.replay(saved.startFen, saved.moves, saved.resigned);
		return saved && game ? { ...saved, game } : null;
	}

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
		drawer = null;
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

	// Save as things change (§4.9): the game on every move, undo, flip or new game, and the
	// settings as they are set. The skin is saved once it has loaded.
	$effect(() => {
		saveGame({
			startFen: game.startFen,
			moves: game.moves.map(({ from, to, promotion }) => ({
				from,
				to,
				...(promotion && { promotion: promotion as PromotionPiece })
			})),
			resigned: game.resigned,
			setup: $state.snapshot(setup),
			human,
			orientation
		});
	});
	$effect(() => {
		saveSettings({
			skinId: skin.current?.manifest.id ?? settings.skinId,
			showLegalMoves,
			showCoordinates,
			autoFlip,
			lastDifficulty: $state.snapshot(setup.difficulty)
		});
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

	// An invalid skin leaves the current one in place (§5.5), and the picker follows the
	// current skin.
	const changeSkin = (id: SkinId) => skin.use(skinBaseUrl(id), id);
	const closeDrawer = () => (drawer = null);
</script>

<svelte:head>
	<title>Chess</title>
</svelte:head>

<svelte:window {onkeydown} />

<div class="flex min-h-dvh flex-col">
	<header class="flex h-12 shrink-0 items-center justify-between px-4">
		<h1 class="text-xl">Chess</h1>
		<button
			class="-mr-2 rounded p-2 hover:text-accent"
			aria-label="Settings"
			onclick={() => (drawer = 'settings')}
		>
			<Icon name="settings" class="size-6" />
		</button>
	</header>

	<!-- Below lg: one column, the control bar at the bottom. From lg: board + side panel (§6.2). -->
	<main
		class="flex flex-1 flex-col items-center gap-2 px-4 pb-4 lg:flex-none lg:flex-row lg:items-stretch lg:justify-center lg:gap-6"
	>
		{#if skin.current}
			<!-- Board size: the full width below lg, unless the height is shorter (§6.1, §6.2). -->
			<div
				class="flex w-[min(100%,calc(100dvh-16rem))] flex-col gap-1 lg:w-[min(calc(100vw-23.5rem),calc(100dvh-10rem))]"
				data-board-column
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

		<!-- At lg the panel is as tall as the board column, and the move list scrolls in it. -->
		<div class="flex w-full flex-1 flex-col lg:relative lg:w-80 lg:flex-none" data-panel>
			<div class="flex flex-1 flex-col gap-2 lg:absolute lg:inset-0 lg:pt-9 lg:pb-9">
				<StatusBar {status} {lastMove} gameOver={game.isGameOver} onnew={() => (drawer = 'new')} />
				{#if notice}
					<p class="text-center text-sm text-danger lg:text-left" role="alert">{notice}</p>
				{/if}

				<div class="hidden min-h-0 flex-1 lg:flex">
					<MoveList startFen={game.startFen} moves={game.moves.map((m) => m.san)} class="" />
				</div>

				<div class="mt-auto lg:mt-0">
					<Controls
						{canUndo}
						canResign={!game.isGameOver}
						onnew={() => (drawer = 'new')}
						onundo={undo}
						onflip={flip}
						onresign={() => game.resign(vsComputer ? human : game.turn)}
						onmoves={() => (drawer = 'moves')}
					/>
				</div>
			</div>
		</div>
	</main>
</div>

<Drawer open={drawer === 'new'} title="New game" onclose={closeDrawer}>
	<NewGameForm
		initial={setup}
		{labels}
		eloRange={opponent.eloRange ?? undefined}
		onstart={startGame}
	/>
</Drawer>

<Drawer open={drawer === 'settings'} title="Settings" onclose={closeDrawer}>
	<SettingsPanel
		skinId={skin.current?.manifest.id ?? ''}
		onskin={changeSkin}
		bind:showLegalMoves
		bind:showCoordinates
		bind:autoFlip
		{vsComputer}
		bind:difficulty={setup.difficulty}
		{labels}
		eloRange={opponent.eloRange ?? undefined}
	/>
</Drawer>

<Drawer open={drawer === 'moves'} title="Moves" onclose={closeDrawer}>
	<MoveList startFen={game.startFen} moves={game.moves.map((m) => m.san)} class="" />
</Drawer>
