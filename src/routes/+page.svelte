<script lang="ts">
	import type { Color } from 'chess.js';
	import { flushSync, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Sound, type Bubble } from '#lib/audio/sound.ts';
	import { SLOW_TAUNT_MS } from '#lib/audio/voices.ts';
	import { bottomSide, flipped, orientationOf, type Orientation } from '#lib/board/geometry.ts';
	import { AUTO_FLIP_DELAY_MS, GAME_OVER_DELAY_MS } from '#lib/board/motion.ts';
	import Board from '#lib/components/Board.svelte';
	import Controls from '#lib/components/Controls.svelte';
	import Credits from '#lib/components/Credits.svelte';
	import Drawer from '#lib/components/Drawer.svelte';
	import GameOver from '#lib/components/GameOver.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import PlayerStrip from '#lib/components/PlayerStrip.svelte';
	import NewGameForm from '#lib/components/NewGameForm.svelte';
	import SettingsPanel from '#lib/components/SettingsPanel.svelte';
	import Splash from '#lib/components/Splash.svelte';
	import StatusBar from '#lib/components/StatusBar.svelte';
	import { targetElo } from '#lib/engine/difficulty.ts';
	import { Opponent } from '#lib/engine/opponent.svelte.ts';
	import { other } from '#lib/game/color.ts';
	import { Game } from '#lib/game/game.svelte.ts';
	import { numberedMove } from '#lib/game/notation.ts';
	import { outcome, resultImage } from '#lib/game/outcome.ts';
	import { DEFAULT_SETUP, pickColor, type GameSetup } from '#lib/game/setup.ts';
	import { outcomeTitle, reasonText, statusText } from '#lib/labels.ts';
	import { loadGame, loadSettings, saveGame, saveSettings } from '#lib/persistence.ts';
	import { availableSkins, skinBaseUrl, type SkinId, type SkinInfo } from '#lib/skins/index.ts';
	import type { SkinManifest } from '#lib/skins/schema.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';

	// The game screen (§6): header, strips, board and control bar in one column below lg; the
	// status, move list and controls in a side panel from lg. New game, Settings and (below lg)
	// the move list open in drawers. The game and settings are saved as they change and resumed
	// on reload (§4.9). `?fen=` starts from a given position (handy for testing promotion,
	// mates, …), and `?mode=hotseat` / `?color=b` pick the first game's setup; any of them
	// starts a new game instead of resuming the saved one, and skips the splash.
	const params = page.url.searchParams;
	const startFen = params.get('fen') ?? undefined;
	const settings = loadSettings();
	const linked = ['fen', 'mode', 'color'].some((p) => params.has(p));
	const resumed = linked ? null : resume();
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
		untrack(() => resumed?.orientation ?? orientationOf(human))
	);
	/** The open drawer, if any (§6.3). */
	let drawer = $state<'new' | 'settings' | 'moves' | 'credits' | null>(null);
	/** Why the game isn't what was asked for, e.g. the engine failed to load. */
	let notice = $state<string | null>(null);
	let showCoordinates = $state(settings.showCoordinates);
	let showLegalMoves = $state(settings.showLegalMoves);
	let autoFlip = $state(settings.autoFlip);
	let volumes = $state(settings.sound);
	let unmuted = $state(settings.unmuted);
	let haptics = $state(settings.haptics);
	// The splash (§4.13) at startup, over the resumed or a new game; Continue needs a game in
	// progress to go back to. A skin without one has no splash.
	let showSplash = $state(!linked);
	const canContinue = resumed !== null && resumed.game.moves.length > 0 && !resumed.game.isGameOver;
	$effect(() => {
		if (skin.current && !skin.current.splash) showSplash = false;
	});
	/** The New game form was opened from the splash, so it offers a game vs the computer. */
	let newFromSplash = $state(false);
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

	// A reply waits for the computer's taunt or its king's answer to a check to end, so it doesn't
	// seem to answer itself.
	const opponent: Opponent = new Opponent(undefined, () => sound.afterAnswer());
	const vsComputer = $derived(setup.mode === 'computer');
	/** The player's colour vs the computer; null in hot-seat, where both sides are players. */
	const player = $derived(vsComputer ? human : null);
	/** The computer's colour, vs Computer. */
	const computer = $derived(other(human));
	/** The computer is to move. */
	const engineTurn = $derived(vsComputer && !game.isGameOver && game.turn !== human);

	function startGame(next: GameSetup) {
		opponent.cancel();
		setup = next;
		human = pickColor(next.color);
		game = newGame();
		orientation = orientationOf(vsComputer ? human : 'w');
		closeDrawer();
		notice = null;
	}

	const flip = () => (orientation = flipped(orientation));
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

	// Sound (§4.11): the active skin's sounds at the chosen volumes, unlocked by the first press
	// or key. Moves (the player's or the computer's), undo, resignation and a new game are
	// heard from the game's changes; a resumed game starts silently.
	let bubble = $state<Bubble | null>(null);
	const sound: Sound = new Sound(
		(b) => (bubble = b),
		(move) => opponent.judge(move)
	);
	const soundCategories = $derived(Sound.categories(skin.current?.audio ?? null));
	$effect(() => sound.attach());
	$effect(() => {
		if (skin.current) sound.setSkin(skin.current);
	});
	$effect(() => sound.setVolumes($state.snapshot(volumes)));
	$effect(() => {
		sound.haptics.enabled = haptics;
	});
	let heard = untrack(() => ({ game, moves: game.moves.length, resigned: game.resigned }));
	$effect(() => {
		const current = { game, moves: game.moves.length, resigned: game.resigned };
		untrack(() => {
			const was = heard;
			heard = current;
			const g = current.game;
			if (g !== was.game) sound.newGame();
			else if (current.resigned && !was.resigned)
				sound.resign(current.resigned, g.kingSquare(current.resigned));
			else if (current.moves === was.moves + 1 && g.lastMove)
				sound.move(g.lastMove, {
					result: g.result,
					human: player,
					computerPieces: g.pieces.filter((p) => p.color === computer)
				});
			else if (current.moves < was.moves) sound.undo();
		});
	});

	// vs Computer, a player still thinking SLOW_TAUNT_MS into their turn is taunted for it, once
	// a turn, the first move of a game too (§4.11).
	$effect(() => {
		if (!vsComputer || game.isGameOver || game.turn !== human) return;
		const current = game;
		void current.fen;
		const timer = setTimeout(() => {
			sound.slow(
				computer,
				current.pieces.filter((p) => p.color === computer)
			);
		}, SLOW_TAUNT_MS);
		return () => clearTimeout(timer);
	});

	const labels = $derived(skin.current?.labels ?? {});
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
	// The game-over overlay (§4.7.1): shown when a game ends in play, not when a finished game is
	// resumed. An undo or a new game takes it away.
	let showResult = $state(false);
	let ended = untrack(() => ({ game, over: game.isGameOver }));
	$effect(() => {
		const now = { game, over: game.isGameOver };
		const was = ended;
		ended = now;
		showResult = false;
		if (now.game !== was.game || !now.over || was.over) return;
		const timer = setTimeout(() => (showResult = true), GAME_OVER_DELAY_MS);
		return () => clearTimeout(timer);
	});
	const ending = $derived(game.result && outcome(game.result, player));

	const lastMove = $derived(
		game.lastMove ? numberedMove(game.startFen, game.moves.length - 1, game.lastMove.san) : null
	);

	// Strips follow the board: the top one belongs to the side drawn at the top (§4.10).
	const bottom = $derived(bottomSide(orientation));
	const top = $derived(other(bottom));
	const sans = $derived(game.moves.map((m) => m.san));

	// Hot-seat auto-flip (§3): once a move has landed, turn the board to the side to move.
	$effect(() => {
		if (!autoFlip || vsComputer) return;
		const side = orientationOf(game.turn);
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
			moves: game.history,
			resigned: game.resigned,
			setup: $state.snapshot(setup),
			human,
			orientation
		});
	});
	$effect(() => {
		saveSettings({
			skinId: skin.current?.id ?? settings.skinId,
			showLegalMoves,
			showCoordinates,
			autoFlip,
			lastDifficulty: $state.snapshot(setup.difficulty),
			sound: $state.snapshot(volumes),
			unmuted: $state.snapshot(unmuted),
			haptics
		});
	});

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (e.altKey || target.closest('input, select, textarea, dialog')) return;
		const key = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if (!e.ctrlKey && !e.metaKey && key === 'f') {
			flip();
		}
	}

	// An invalid skin leaves the current one in place (§5.5), and the picker follows the
	// current skin.
	const changeSkin = (id: SkinId) => skin.use(skinBaseUrl(id), id);
	let skins = $state<SkinInfo[]>([]);
	availableSkins().then((s) => (skins = s));
	const closeDrawer = () => {
		drawer = null;
		newFromSplash = false;
	};
</script>

<svelte:window {onkeydown} />

<!-- The computer's strip shows the Elo it plays at (§4.6). -->
{#snippet strip(color: Color, current: SkinManifest)}
	<PlayerStrip
		{color}
		skin={current}
		captured={game.captured[color]}
		advantage={color === 'w' ? game.material : -game.material}
		elo={player !== null && color !== player ? targetElo(setup.difficulty) : null}
		active={!game.isGameOver && game.turn === color}
	/>
{/snippet}

<!-- A header button that opens a drawer. -->
{#snippet opens(name: Exclude<typeof drawer, null>, icon: IconName, label: string)}
	<button class="rounded p-2 hover:text-accent" aria-label={label} onclick={() => (drawer = name)}>
		<Icon name={icon} class="size-6" />
	</button>
{/snippet}

<div class="flex min-h-dvh flex-col">
	<header class="flex h-12 shrink-0 items-center justify-between px-4">
		<h1 class="text-xl">Vibe Chess</h1>
		<div class="-mr-2 flex">
			{@render opens('credits', 'info', 'Credits')}
			{@render opens('settings', 'settings', 'Settings')}
		</div>
	</header>

	<!-- Below lg: one column, the control bar at the bottom. From lg: board + side panel (§6.2). -->
	<main
		class="flex flex-1 flex-col items-center gap-2 px-4 pb-4 lg:flex-none lg:flex-row lg:items-stretch lg:justify-center lg:gap-6"
	>
		{#if skin.current}
			<!-- Board size: the full width below lg, unless the height is shorter (§6.1, §6.2). -->
			<div
				class="flex w-[min(100%,calc(100dvh-16rem))] flex-col gap-1 lg:w-[min(calc(100vw-23.5rem),calc(100dvh-10rem))]"
			>
				{@render strip(top, skin.current)}
				<Board
					skin={skin.current}
					{game}
					{orientation}
					{showCoordinates}
					{showLegalMoves}
					locked={turning}
					canMove={(color) => !vsComputer || color === human}
					onselect={() => sound.select()}
					onillegal={() => sound.illegal()}
					{bubble}
				/>
				{@render strip(bottom, skin.current)}
			</div>
		{/if}

		<!-- At lg the panel is as tall as the board column, and the move list scrolls in it. -->
		<div class="flex w-full flex-1 flex-col lg:relative lg:w-80 lg:flex-none">
			<div class="flex flex-1 flex-col gap-2 lg:absolute lg:inset-0 lg:pt-9 lg:pb-9">
				<StatusBar {status} {lastMove} gameOver={game.isGameOver} onnew={() => (drawer = 'new')} />
				{#if notice}
					<p class="text-center text-sm text-danger lg:text-left" role="alert">{notice}</p>
				{/if}

				<div class="hidden min-h-0 flex-1 lg:flex">
					<MoveList startFen={game.startFen} moves={sans} />
				</div>

				<div class="mt-auto lg:mt-0">
					<Controls
						{canUndo}
						canResign={!game.isGameOver}
						onnew={() => (drawer = 'new')}
						onundo={undo}
						onflip={flip}
						onresign={() => game.resign(player ?? game.turn)}
						onmoves={() => (drawer = 'moves')}
					/>
				</div>
			</div>
		</div>
	</main>
</div>

{#if ending && game.result}
	<GameOver
		open={showResult}
		title={outcomeTitle(ending, labels)}
		reason={reasonText(game.result, labels)}
		image={resultImage(skin.current?.results ?? null, ending)}
		onnew={() => {
			showResult = false;
			drawer = 'new';
		}}
		onclose={() => (showResult = false)}
	/>
{/if}

{#if skin.current?.splash}
	<Splash
		open={showSplash}
		splash={skin.current.splash}
		{canContinue}
		onnew={() => {
			showSplash = false;
			newFromSplash = true;
			drawer = 'new';
		}}
		onclose={() => (showSplash = false)}
	/>
{/if}

<Drawer open={drawer === 'new'} title="New game" onclose={closeDrawer}>
	<NewGameForm
		initial={newFromSplash ? { ...setup, mode: 'computer' } : setup}
		{labels}
		onstart={startGame}
	/>
</Drawer>

<Drawer open={drawer === 'settings'} title="Settings" onclose={closeDrawer}>
	<SettingsPanel
		skinId={skin.current?.id ?? ''}
		{skins}
		onskin={changeSkin}
		bind:showLegalMoves
		bind:showCoordinates
		bind:autoFlip
		{vsComputer}
		bind:difficulty={setup.difficulty}
		{labels}
		bind:sound={volumes}
		bind:unmuted
		bind:haptics
		canVibrate={sound.haptics.support !== null}
		{soundCategories}
		onpreview={(category) => {
			flushSync(); // the mixer gets the new volume before the sample plays
			sound.preview(category);
		}}
	/>
</Drawer>

<Drawer open={drawer === 'moves'} title="Moves" onclose={closeDrawer}>
	<MoveList startFen={game.startFen} moves={sans} />
</Drawer>

<Drawer open={drawer === 'credits'} title="Credits" onclose={closeDrawer}>
	<Credits />
</Drawer>
