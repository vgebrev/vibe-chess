# Vibe Chess — Product & Technical Spec (Draft 3)

_Status: **v1 complete** · 2026-10-18 · Draft 3 incorporated decisions from three review rounds; later changes are in the decision log (§11)._

## 1. Summary

A single-page browser chess game built with SvelteKit and designed mobile-first. One human plays a full game of standard chess against Stockfish running locally in the browser, or against another human on the same device. The board can be viewed from either side. Legal moves are shown on request, and pieces slide between squares. Everything visual comes from a swappable **skin**: board, pieces, move and capture indicators, font, colours and side labels. The first skin is **Pirate**.

## 2. Goals

1. **Standard chess.** Full FIDE rules, with legality enforced at all times.
2. **Computer opponent.** Stockfish in a Web Worker, with difficulty presets plus a custom Elo slider. No server needed.
3. **Board orientation.** The board can be shown from White's or Black's side and flipped at any time.
4. **Move guidance.** Selecting a piece shows every legal destination, and captures are marked distinctly.
5. **Skinnable.** A skin is a folder of assets plus a manifest. Adding a skin needs no code changes.
6. **Mobile-first.** The game is fully playable on a phone in portrait orientation and scales up to a side-panel layout on wider screens.

### Non-goals (v1)

Online multiplayer, accounts, ratings, time controls/clocks, opening books, analysis mode, PGN import, puzzles, native app packaging.

## 3. Game modes

| Mode                       | Description                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **vs Computer** (default)  | The player picks White, Black or Random, and a difficulty. Stockfish plays the other side. The board is oriented to the player's colour at the start. |
| **Two players (hot-seat)** | Both sides move on one device. An optional **auto-flip** setting turns the board to the side to move after each move, once the move has landed.       |

## 4. Functional requirements

### 4.1 Rules & game state

- Standard starting position.
- All legal moves are supported, including castling (both sides), en passant, double pawn push and promotion to Q/R/B/N.
- Illegal moves are rejected. A piece dropped on an illegal square slides back to where it started.
- End-of-game detection covers checkmate, stalemate, threefold repetition, the 50-move rule and insufficient material. Resignation is a UI action. Draw offers are deferred.
- Rules, move generation, FEN/SAN and game-over detection are delegated to **chess.js**. We do not hand-roll move generation.

### 4.2 Interaction

- **Click-to-move:** click a piece to select it, then click a destination. Clicking the selected piece again, or a non-target square, deselects it.
- **Drag-and-drop:** uses pointer events, so mouse and touch share one code path. The dragged piece follows the pointer and lifts slightly, using a scale and shadow from the theme. Dropping snaps it to the square with no slide animation.
- Only pieces of the side to move can be selected. In vs-Computer mode, only the human's pieces can be selected.
- **Promotion:** a picker shows the four piece options using the active skin's sprites. Cancelling the picker cancels the move.
- Input is locked while the engine is thinking.
- Touch: `touch-action: none` on the board prevents scroll and zoom while dragging. Touch targets are at least one board square; on a 360 px phone that is ≈ 40 px.
- **Implementation (M3):**
  - Pointer input is handled once on the board grid and mapped to a square from the pointer position.
  - A press on a legal target of the selected piece moves straight away. A press on a movable piece selects it and starts a potential drag, which becomes a drag after 4 px of travel.
  - A release without dragging on an already-selected piece deselects it. A drop anywhere other than a legal target returns the piece and keeps it selected, so click-to-move still works.
  - Each square is also a transparent `<button>`, for keyboard and screen-reader access (§6.5). There is a single tab stop: the last square focused, else the selected one, else the bottom-left corner. Arrow keys move between squares (M8). Enter or Space acts like a click.
  - Esc cancels the promotion picker, then a drag, then the selection.
  - The dragged piece is drawn with `scale: theme.dragScale` (default 1.15) and `filter: drop-shadow(theme.dragShadow)`.
  - The page accepts `?fen=<FEN>` to start from a position, which e2e tests use. Like `?mode=` and `?color=`, it starts a new game instead of resuming the saved one (§4.9).

### 4.3 Move guidance

- When a piece is selected, an indicator is drawn on every legal destination square:
  - **Quiet move:** `moveIndicator` image.
  - **Capture:** the `captureIndicator` image if the skin provides one. Otherwise the `moveIndicator` is drawn at `moveIndicator.captureScale` (and `moveIndicator.opacity`), which is upscaled so it frames the target piece. En passant counts as a capture, and its indicator is drawn on the destination square. (chess.js's `isCapture()` excludes en passant, so the code reads a move's `captured`, which it sets for en passant too.)
- All indicators are drawn in one layer **above the pieces**, with skin-defined **opacity**, so neither the square nor the piece underneath is fully hidden.
- Defaults are `opacity` 0.75 for moves and 0.6 for captures; skins can override both.
- When the pointer hovers over a target, or a dragged piece is over one, that indicator goes to `hoverOpacity` (default 0.85; per indicator in the manifest), giving feedback on where the piece will land without fully hiding the piece underneath.
- Additional highlights (each a theme colour, rendered as a translucent square overlay under pieces):
  - Selected square
  - Last move (from and to squares)
  - King in check
- **Setting:** "Show legal moves" (on by default). When it is off, legality is still enforced but no indicators are drawn.

### 4.4 Board orientation & coordinates

- `orientation: 'white' | 'black'` is independent of whose turn it is and of which colour the human plays.
- A **Flip board** button and the `F` keyboard shortcut toggle it. Flipping animates every piece to its mirrored position, using the same slide as moves.
- Flipping changes only how the board is rendered. Game state is unaffected. A drag in progress is cancelled.
- **Coordinates** (files a–h, ranks 1–8) are drawn in the **skin font** using theme colours:
  - **`board.inset` > 0:** labels sit **in the frame**. Files are centred under each column in the bottom frame strip, and ranks are centred beside each row in the left frame strip. Font size is a fraction of the inset (default 0.55 × inset height; overridable through `coordinates.fontScale`).
  - **`board.inset` = 0:** labels sit in a **gutter outside** the board image, along the bottom and left edges. The gutter width equals `coordinates.gutter` × square size (default 0.35). The board shrinks to make room, so the board plus its gutter always fits the available width. Label size is 0.75 × the gutter width. When coordinates are hidden there is no gutter and the board fills the box.
  - Labels follow orientation: from Black's side, files read h→a and ranks read 1→8 top to bottom.
  - Colour comes from `theme.coordText`, with an optional `theme.coordShadow` (text-shadow) for legibility on textured frames.
- **Setting:** "Show coordinates" (on by default).

### 4.5 Piece animation

- Each piece is rendered absolutely positioned within the board grid, using the CSS `translate` property (`translate: x% y%`). A change of square slides (200 ms, ease-out); fades take 200 ms. The durations live in `board/motion.ts`.
- **Stable piece identity:** each piece gets an id when the game starts (e.g. `wn-b1`). After each move the board diff is reconciled against chess.js's move record, so the moving piece keeps its id:
  - **Normal move or capture:** the mover keeps its id. The captured piece fades out (`--anim-capture-ms`) and is then removed.
  - **Castling:** the king and rook both slide.
  - **En passant:** the captured pawn fades out from its actual square, not the destination square.
  - **Promotion:** the pawn slides, then crossfades to the promoted piece, keeping the same id.
- The animation cases are:
  - The engine's move and the opponent's move in hot-seat mode always animate.
  - **Undo** animates in reverse, and captured pieces fade back in.
  - **Click-to-move** animates.
  - **Drag-drop** does not: the piece is already at the destination. An **illegal drop** slides back.
  - **New game / resume from storage** places pieces with no animation.
- `prefers-reduced-motion: reduce` sets all durations to 0.
- **Implementation (M4):**
  - Slides are FLIP animations with the Web Animations API, not CSS transitions. Before the DOM update, `Piece` notes where it is drawn. After the update, it animates `transform` from there to the new cell. `transform` applies after `translate`, so the returning piece's scale is about its own centre; if both were in one transform list, the scale would also stretch the piece's offset from the board corner. This starts interrupted slides from where the piece actually is, lets a dropped piece snap without a transition race, and lets a returned piece start from the drop point (scaling down from `dragScale`). A sliding piece is raised above the others.
  - Captures fade with a Svelte `out:` transition on the piece. Svelte makes a leaving piece `inert` from the moment its outro starts, which tests use to tell it apart. Pieces that reappear (undo) fade in with `in:`; an undo during the fade reverses it on the same element.
  - Promotion crossfades the old and new sprite. When the pawn also slides (an engine or opponent move), the crossfade waits until it lands.
  - While the promotion picker is open, the pawn is drawn on the promotion square: snapped there after a drag, slid there after a click. Cancelling slides it back.
  - A new game re-creates the piece layer (`{#key game}`), so nothing animates.

### 4.6 Computer opponent (Stockfish)

- Stockfish runs as WASM inside a dedicated **Web Worker** and communicates over **UCI**, the standard chess-engine protocol.
- **Difficulty:** the player either picks a preset or chooses **Custom** and sets an Elo. The presets are Stockfish's `Skill Level` 0–5; Custom limits the engine to an Elo with `UCI_LimitStrength`/`UCI_Elo`. Each preset's Elo comes from Stockfish's own formula, which turns a `UCI_Elo` into a Skill Level (a cubic fit against the Stash engine), inverted:

  | Preset (Pirate name) | Generic name | Skill Level | Elo       |
  | -------------------- | ------------ | ----------- | --------- |
  | Cabin Boy            | Beginner     | 0           | 1320      |
  | Deckhand             | Easy         | 1           | 1444      |
  | Bosun                | Medium       | 2           | 1566      |
  | Quartermaster        | Hard         | 3           | 1729      |
  | First Mate           | Expert       | 4           | 1953      |
  | Captain              | Master       | 5           | 2197      |
  | **Custom**           |              | `UCI_Elo`   | 1350–3150 |

  The search time for every difficulty comes from the think-time model in §4.6.1.

  - These are engine blitz ratings (CCRL), not human ones, so they are only a rough guide for people; 1320 is the engine's floor. The levels are about 100–250 Elo apart, where the old 0/5/10/15/20 presets jumped from 1320 to 2197 in one step.
  - The **Custom slider** has a **step of 50 Elo** and runs from **1350 to 3150** (the multiples of 50 inside Stockfish's 1320–3190), starting at 1350, for anything above the presets. A note under it says the ratings are Stockfish's own and only a rough guide for people.
  - Each preset shows its Elo in brackets ("Easy (1444)"), and the computer's player strip shows the Elo it plays at under its name ("1444 Elo"), following a mid-game change.
  - Preset names can be overridden by the skin (`labels.difficulty`). The fallbacks are generic names: Beginner / Easy / Medium / Hard / Expert / Master.
  - **History:** M6 used Skill Level 0/5/10/15/20; M9 replaced it with a human-like move choice for target Elos down to 450 (§4.6.2), which played too unnaturally and was removed (§11 #31, #43).

- Engine flow:
  1. On init, check the WASM can be fetched (a `HEAD` request; a failed download never reaches the worker's error event), start the worker, send `uci` and wait for `uciok`.
  2. Send `isready`, wait for `readyok`, then apply options.
  3. On the engine's turn, compute a think budget `T` (§4.6.1), set the difficulty's options if they changed (`UCI_LimitStrength` plus `Skill Level` or `UCI_Elo`), then send `position fen <fen>` → `go movetime T`.
  4. Wait for `bestmove`. If it arrived before `T` elapsed (this can happen with mates or forced lines), wait out the remainder, then apply it through chess.js. The move animates.
- **Stale replies:** a new game, an undo or a mode change sends `stop`. Every request carries a sequence id, and a `bestmove` for an outdated id is discarded.
- **Load failure:** the app shows an error and falls back to hot-seat mode. A start that hasn't reached `readyok` within 30 s counts as a failure.
- **Implementation (M6):**
  - `engine/engine.ts` is the UCI client. It talks to anything shaped like a Worker, so tests drive it with a scripted fake (`testing/fakeWorker.ts`); the browser Worker comes from `engine/worker.ts`. Every `go` gets exactly one `bestmove`, so pending searches form a queue; `stop()` marks them all cancelled and their replies resolve to `null`, including a search still waiting to start. Options are only sent when they change, and only once no search is running.
  - `engine/opponent.svelte.ts` owns the engine. It starts it when a vs-Computer game begins (not on first paint and not in hot-seat), computes `T`, searches at the difficulty, waits out the rest of `T`, and plays the move if the request is still current and the position unchanged. Its `status` (`idle`, `thinking`, `failed`) drives the status line and the fallback.
  - The page runs the opponent from an effect whenever it is the computer's turn; a new position, undo, resignation or new game cancels the pending reply. The player can only move their own pieces (`Board`'s `canMove`).
  - **New game** opens a form (`NewGameForm.svelte`): opponent (Computer / Two players), colour (the two side names or Random) and difficulty (the six presets or Custom with the Elo slider). It opens with the last game's choices, in a Drawer (§6.4). Playing Black orients the board to Black and the engine opens.
  - The first game is vs Computer, as White, at the weakest preset (`p0`, 1320). The page also reads `?mode=hotseat` and `?color=b`, alongside `?fen=`.
  - Resign in vs-Computer mode resigns the player. Auto-flip is a hot-seat setting and is hidden vs Computer.

#### 4.6.1 Think time ("organic" pacing)

**How fast is Stockfish here?** The single-threaded WASM build searches very roughly 0.3–1M nodes/s on a desktop and a few times slower on a phone. Even 100 ms reaches a search depth far beyond what a 1350–2000 Elo opponent needs. Playing strength comes from `Skill Level` / `UCI_Elo`, not from thinking time. On its own the engine would answer almost instantly, so the delay is effectively all presentation.

**Approach:** the pause is not artificial. The budget `T` is handed to the engine as `go movetime T`, so it searches for exactly the time the player sees it "thinking". Only one timer is needed, and longer thinks in complex positions cost nothing.

`T` is computed from a cheap complexity estimate of the position. It uses chess.js only, with no engine round-trip.

```
if only one legal move:          T = rand(350, 600) ms          // forced: answer quickly
else if ply < 8:                 T = rand(400, 900) ms          // opening: "book-like" speed
else:
  c = (                                                    // complexity 0..1: the weights add up to 1
        0.40 · min(legalMoves / 40, 1)                     // breadth
      + 0.30 · min(capturesAvailable / 6, 1)               // tactical tension
      + 0.15 · (inCheck || checksAvailable > 0 ? 1 : 0)    // forcing lines
      + 0.15 · min(nonPawnPieces / 10, 1)                  // middlegame vs endgame
      )
  if obviousRecapture: c *= 0.5     // opponent just captured and we can take back on that square
  T = lerp(600, 3000, c) · jitter   // jitter = log-normal, σ ≈ 0.25 (median 1.0)

T = clamp(T · personality, 500, 4500)   // applied to every branch above
```

**Difficulty personality:** stronger opponents take a little longer on average: `personality` runs linearly with the Elo from **0.70 at 1320** to **1.20 at 3150** (Captain, 2197, is about 0.94). Mostly a presentation touch: strength comes from the Skill Level or Elo limit, not the search time.

- All constants live in `engine/thinkTime.ts`, so they can be tuned by feel.
- During milestone M6, log nodes/s and depth from the engine's `info` lines on a desktop and a phone, to confirm the budgets are comfortably above what each difficulty needs. In dev builds each reply logs `[engine] <T> ms, depth <d>, <n>k nodes/s` to the console.
  - **Desktop (M6, headless Chromium):** about 750–800k nodes/s in middlegames, reaching depth 16 in an opening reply of 650 ms and depth 18–20 in 1.6–2.9 s middlegame thinks; a simple pawn endgame runs at 3.5M nodes/s. Even a phone several times slower reaches depth 14 or more, far beyond what a 1350–2000 Elo opponent needs, so the budgets stand.
  - **Phone:** not yet measured. Chromium's CPU throttling doesn't apply to workers, so this needs a real device.
- A settings toggle could add a **"Fast engine"** option that caps `T` at 300 ms. This is a stretch goal.
- **Possible v2:** use the engine's own signal for complexity, i.e. how much the best move and its score change between search depths in the `info` output. A position where the engine keeps changing its mind is "hard". This needs a short probe search first, so it is deferred.

- **Bundle:** the `stockfish` npm package (pinned at 19.0.0, Stockfish 19), using its single-threaded "lite" WASM build: a 21 KB loader script and a 1.8 MB `.wasm`. Both are imported with Vite's `?url`, so the build emits them as hashed, cacheable assets and nothing is copied by hand; the loader finds the `.wasm` through the URL fragment the worker is started with. They are only fetched when a vs-Computer game starts, so hot-seat play and first paint stay light. Both are far inside Cloudflare Pages' 25 MiB per-file limit. Stockfish is GPLv3; the app runs it unmodified as a separate program over UCI.

#### 4.6.2 Human-like play (removed)

M9 had the engine score every legal move at full strength and pick one the way a player of a target Elo might (a softmax over the loss in winning chances, favouring captures, checks and moves that look good at a glance), tuned by a calibration script against Stockfish's `UCI_Elo`. It matched its target Elos overall, but the mistakes felt unnatural: with every legal move in play, the many slightly worse ones added up, so it often ignored opening principles and sometimes left material hanging, and since every move in a won position is worth ~100% winning chances it never converted endgames such as king and rook against king. Removed in favour of Skill Levels (§11 #43); the code (`engine/humanize.ts`, `engine/analysis.ts`, `scripts/calibrate.ts`) is in git history (commit b93152f) if it's ever wanted again.

### 4.7 Game controls

- New game (opens a dialog: mode, colour, difficulty)
- Undo. In vs-Computer mode this takes back the full move pair.
- Flip board
- Resign
- Move list: SAN in numbered pairs, current move highlighted, auto-scrolled to the end
- Status line: whose turn it is, check, game result, engine thinking
- Settings: skin (only when more than one is available, §5.5), show legal moves, show coordinates, auto-flip (hot-seat only), difficulty
- **Implementation (M5):**
  - `Game` keeps the played moves (`moves`, chess.js verbose records) and derives `lastMove`, `result`, `captured` and `material` from them.
  - **Undo** takes back one ply in hot-seat mode, and rebuilds the render pieces by replaying the game from its start FEN. Ids come from starting squares, so every piece gets its id back: the mover slides home and a captured piece fades back in on its own square. An undo also clears the selection, a drag and a pending promotion. A checkmate or draw can be taken back; a **resignation is final**, so Undo is disabled after one.
  - **Resign:** in hot-seat mode the side to move resigns.
  - **Undo vs Computer (M6):** `Game.undoTurn(color)` takes back the player's last move and the reply, if there is one, so it is the player's turn again; while the engine is thinking that is just the player's move, and the pending reply is cancelled. Undo is disabled until the player has a move to take back.
  - `result` is `{ winner, reason }`; reasons are checked in the order resignation, checkmate, stalemate, insufficient material, threefold repetition, 50-move rule. Moves are refused once the game is over.
  - **Auto-flip** waits `AUTO_FLIP_DELAY_MS` (the 200 ms slide plus a 400 ms beat, in `board/motion.ts`) after a move or undo before turning the board, so the move is seen landing; board input is locked meanwhile. It is a pause rather than motion, so reduced motion keeps it.
  - The status line also shows the last move with its number ("12. Nf3", "12… Nf6"). When the game is over, a "New game" button sits next to the result.
  - Keyboard: `Ctrl/Cmd+Z` undoes (§6.5).
  - **Layout (M7):** the page is laid out as in §6.1/§6.2. New game, Settings and (below `lg`) the move list open in Drawers (§6.4). New game is a form that starts the game on **Start**; Settings apply as they change, with no save button. In Settings, auto-flip shows only in hot-seat games and the difficulty only vs Computer, where a change applies from the computer's next move. The difficulty picker (presets + custom Elo) is shared by both drawers.

#### 4.7.1 Game-over overlay

When a game ends in play, an overlay appears over the screen with a big picture, a headline and the reason, plus **New game** (opens the New game drawer) and **View board** (closes it to look at the final position). The result line under the board, with its own "New game" button, stays as it was.

- **When:** `GAME_OVER_DELAY_MS` (1 s: the 200 ms slide plus a beat, in `board/motion.ts`) after the game ends, so the last move is seen landing and its sound starts first. It is a pause, so reduced motion keeps it. Undo or a new game takes it away. A finished game resumed after a reload doesn't show it again, and neither does a `?fen=` that starts finished.
- **Closing:** View board, Esc or tapping the scrim. It is a modal dialog, like the drawers (§6.4). New game takes focus only when the game ended from the keyboard; after a tap the dialog itself takes it, so no focus ring shows. Focus goes back to where it was.
- **Headline:** vs Computer, from the player's side: "Victory!", "Defeat" (checkmated or resigned) or "Draw". In hot-seat, "{side} wins!" or "Draw". The reason line is "Checkmate", "{side} resigns", "Stalemate", "Threefold repetition", "50-move rule" or "Insufficient material".
- **Picture:** from the skin's optional `results` block (§5.1): a win in the winner's colours, a loss or resignation in the loser's (they are the skull, or raise the white flag):

  | Outcome                                                        | Picture                                                                                 |
  | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
  | Checkmate: the player's win vs Computer, or either in hot-seat | `win`, the winner's                                                                     |
  | Checkmated by the computer                                     | `loss`, the loser's (the player's)                                                      |
  | Resignation                                                    | `resign`, the loser's; else `loss` vs Computer (the player resigned), `win` in hot-seat |
  | Stalemate                                                      | `stalemate`, else `draw`                                                                |
  | Any other draw                                                 | `draw`                                                                                  |

  Without a picture the overlay is text only. The picture sits on a soft glow in the skin's `accent`, so dark art stands out from the surface. Pictures load in the background once the skin has loaded.

- **Pirate:** a Jolly Roger in the winning crew's colour for a win, the skull and crossbones with a bandana in the losing crew's colour for a loss (theirs is the crew that ended up as skeletons), a torn white flag for a resignation and crossed cutlasses (one red, one blue) for a draw. It has no stalemate picture, so a stalemate shows the draw one.
- The overlay adds no sound: the game's end already has its SFX and voice lines (§4.11).

### 4.8 Side labels & status text

- Status strings use side labels from `skin.labels.white` / `skin.labels.black`. Fallbacks are **"White"** / **"Black"**.
- Message templates are fixed in code. The labels are substituted into them:
  - `"{side} to move"`
  - `"{side} is in check"`
  - `"{side} is thinking…"` (the computer's turn; check takes precedence)
  - `"Checkmate — {side} wins"`
  - `"{side} resigns — {side} wins"`
  - `"Stalemate — draw"`, `"Threefold repetition — draw"`, `"50-move rule — draw"`, `"Insufficient material — draw"`

  Skins provide names, not sentences. That keeps grammar sane and leaves room for i18n later.

- The Pirate skin sets `"Blue Crew"` / `"Red Crew"`, giving for example "Blue Crew to move".

### 4.9 Persistence

- `localStorage` holds:
  - the current game: start FEN, move list, mode, human colour, difficulty;
  - settings: skin, toggles, sound volumes, last difficulty.
- On reload the game is rebuilt by replaying the moves, so undo history survives. Every read and write is wrapped in try/catch, and the app works without storage.
- **Implementation (M8):**
  - `persistence.ts` keeps two versioned keys, `chess:game:v1` and `chess:settings:v1`. A breaking change to either shape gets a new key rather than a migration.
  - The game record is `SavedGame` (§7.3): the start FEN, the moves as from/to/promotion, the resigning side (a resignation isn't on the board), the New game setup, the player's colour and the board orientation. The page saves it on every move, undo, flip and new game, and the settings as they change.
  - Loading validates the shape. A game that is malformed, or whose moves no longer replay (`Game.replay`), is dropped and a new game starts. A bad settings field falls back to its own default only.
  - The layout loads the saved skin if it is still available, falling back to the default skin and then the other available skins if it is not, or fails to load (§5.5).
  - A resumed vs-Computer game on the computer's turn has the engine reply as usual.
  - `?fen=`, `?mode=` and `?color=` start a new game instead of resuming, which keeps e2e tests independent of storage.

### 4.10 Captured pieces & material balance

- Each player strip (§6.1) shows the pieces **that side has captured**, drawn as small sprites from the active skin. They are grouped by type in the order queen, rook, bishop, knight, pawn. Sprites are 30 px; pieces of the same type overlap (each shows 12 px) and squeeze down to 6 px only when the strip runs out of room, so a full set fits on a 360 px phone. The last piece of each group is always whole.
- Next to the captures, the side that is **ahead on material** shows `+N`. Nothing is shown when material is level.
  - Values: pawn 1, knight 3, bishop 3, rook 5, queen 9.
  - `N` is computed from the material **on the board**, not from the captures, so promotions count correctly. A promoted queen adds 9 and removes the pawn's 1.
- Captures come from the move history (`captured` on each chess.js move, en passant included), so they always match the game. When a promoted piece is captured, it is shown as the piece it had become.
- Both values are derived from the game state, so undo, new game and resume from storage update them with no extra bookkeeping.
- Strips follow the board orientation: the top strip belongs to the side at the top of the board, so flipping swaps them.
- Accessibility: the strip has a text equivalent, for example "Blue Crew captured: queen, 2 pawns. +7".

### 4.11 Sound (M10)

Sound comes from the skin (`audio` in the manifest, §5.1), in three categories, each with its own volume slider in Settings:

| Category   | What                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Music**  | Background tracks                                                                                                       |
| **SFX**    | Generic game sounds: select, move, capture, castle, promotion, check, checkmate, draw, illegal move, new game, UI click |
| **Voices** | The pieces as characters: spoken lines, and the knights' and rooks' horse and cannon sounds                             |

- The horse and cannon sounds are **Voices**, not SFX: they belong to a character, not to a game event.
- Each volume is a number from 0 (off) to 1, set with a slider in 5% steps and persisted with the settings (§4.9). A **mute toggle** (a speaker icon) beside each slider sets it to 0, and unmuting brings back the last level above 0 (also persisted, so it survives a reload). A slider turned down to 0 shows as muted too. Defaults: music 0.5, SFX 0.8, voices 1.0, so the music sits under the game. An invalid stored value falls back to its default. A category the active skin has no sounds for has no slider.
- **Hearing a level.** Once a volume is set (a slider let go, or a mute toggle), Effects plays the move sound and Voices a random line of the skin's, cutting off the last such sample; the music needs no sample, as it is playing. A double-click on a slider puts it back to its default.
- Volume changes apply at once, ramped over about 50 ms to avoid clicks. At 0 a category plays nothing: no music is downloaded, and no voice line is chosen (so a muted taunt doesn't start its 30 s wait).
- Nothing plays before the player's first interaction (browser autoplay rules): the first press or key unlocks audio, and the music starts then. A touch's `pointerdown` isn't a user gesture, and iOS won't start audio from one, so `pointerup` and `touchend` unlock too; every press also resumes audio the browser has suspended or iOS has interrupted (a call, another app).

**Music.** The skin's tracks are **shuffled once per session** and played in that order, looping back to the first after the last. Setting music to 0 fades it out and pauses it; raising it again resumes the playlist. It pauses while the tab is hidden. While a voice line plays, the music dips (ducking) and comes back up afterwards. Matching the music to the board state is a possible v2.

**SFX.** Each move plays one SFX, the first that applies: checkmate, draw (any draw), check, promotion, castle, capture, move. An undo plays `move`. Selecting or picking up a piece plays `select`, a drag dropped where the piece can't go (it slides back) `illegal`, and a new game (not a resumed one) `start`. Resignation plays `checkmate`. Any other control (a button, link, option chip or toggle, by pointer or keyboard) plays `click`, once for a label and its input; the board and sliders don't. Pirate's castle and click are the move sound: the voice lines carry the flair.

**Voices.** Each piece type has pools of lines per side and **event**. A line is chosen at random from the pool for the event, never the same one twice in a row when the pool has more than one.

| Event      | Who speaks                                               | Pirate lines per side                              |
| ---------- | -------------------------------------------------------- | -------------------------------------------------- |
| `move`     | the piece that moved                                     | 3 (king, queen, bishop, pawn); 2 (knight, rook)    |
| `capture`  | the capturing piece                                      | 3; 2                                               |
| `captured` | the captured piece                                       | 2 (not kings)                                      |
| `check`    | the king in check                                        | 2 (kings only)                                     |
| `defeat`   | the checkmated (or resigning) king                       | 2 (kings only)                                     |
| `taunt`    | a computer piece, answering your move (vs Computer only) | 2 (king, queen, bishop, pawn); none (knight, rook) |

A move is **voiced from the side of the player who made it**. The rules, in order; the first that applies decides the move's voice:

1. **Checkmate:** the losing king's `defeat`, always. A resigning side's king says `defeat` too.
2. **Check:** the checked king's `check`, always.
3. **A player's capture:** the capturing piece's `capture`. The captured piece doesn't answer: by the time the line ends it has left the board, so an answer didn't flow.
4. **A player's other move:** vs Computer, a **taunt** when one is due (at most one per 30 s), from one of the computer's pieces still on the board: each kind of piece that has taunt lines is as likely, then one piece of that kind. Otherwise (and always in hot-seat) the moved piece's `move`. Castling is the king's move and promotion the pawn's; en passant is a capture. The taunt answers your move, so it never seems to come from the computer taunting itself after its own; a capture of yours isn't taunted.
5. **The computer's capture:** the computer stays silent, and **your** captured piece reacts with its `captured` line.
6. **The computer's other moves:** silent. No taunts in hot-seat.

**Every line always plays**: each move that has a line says it, which played better than lines by chance. Only taunts are spaced out, at most one per 30 s (`TAUNT_COOLDOWN_MS` in `audio/voices.ts`). Should the lines grow repetitive, the answer is more variations per pool in the skin, not chance (§11 #54).

- **Lines overlap.** Every line plays to its end: a newer move's line starts over one still playing rather than cutting it off (a cut-off taunt felt unnatural). The music stays dipped until the last one ends. Undo, a new game, a skin change and setting Voices to 0 stop every line, with a short fade.
- A draw has no voice line. Victory and castling lines are possible additions; they would follow the same rules (a castle line replacing the king's `move`).
- SFX and voices play together; the SFX marks the move, the voice adds character.

**Speech bubbles.** Without a picture, a line can be hard to place: a taunt from the queen after a king move, say. So while a line plays, a **speech bubble** shows over its speaker, if the skin has bubbles for that event (`emotes` in the manifest, §5.1; Pirate has them for taunts only). The bubble is a cell of the skin's emote sheet, chosen at random from the event's cells (never the same twice running), with its tail at the speaker's head; near the right edge it opens to the left, mirrored. It pops in (no animation with reduced motion), appears when the line actually starts, and goes 300 ms after it ends, or at once when a move changes what stands on its square (the speaker moved or was taken), on undo, a new game, a skin change or Voices at 0. A line that doesn't play (dropped as late, or at volume 0) shows no bubble. A `captured` line has none: its speaker has left the board. The bubble is decorative (`aria-hidden`); the line is heard, not read.

**Playback.** SFX and voices are short, so they are fetched in the background, at most 4 at a time: the SFX when the skin is applied, the voice lines once the first press unlocks audio (nothing can play before, and a sound needed at once jumps the queue). They are decoded into Web Audio buffers and played through one gain node per category; a slider's position is squared into the gain, so it feels even to the ear. A sound still loading when it is due is dropped if it would be late: after 250 ms for SFX, 1 s for a voice line, counted from when the audio context is running, since a new one can take a few hundred ms to open the device (about 270 ms in WebKit, which dropped the first tap's `select`). A sound waits at most 1 s for the context to start, then is dropped. Music streams through an `<audio>` element routed into the music gain, so only the playing track is downloaded. A missing or undecodable file is logged and skipped. Changing skin stops everything and loads the new skin's sounds.

- **Implementation (M10):** `audio/sfx.ts` and `audio/voices.ts` are the rules, pure apart from an injected clock and random source; `audio/playlist.ts` the shuffle; `audio/mixer.ts` the Web Audio graph and music element; `audio/sound.ts` turns game events into sounds. Speech bubbles come back from `Sound` through a callback, as timed by the mixer from when each line actually starts, and `Board` draws them (`SpeechBubble.svelte`). The page hears moves from the game's changes (a move more, fewer moves, a resignation, a new game object), so the player's and the computer's moves take the same path and a resumed game starts silently. `Board` reports selections and illegal drops through `onselect` and `onillegal`.

### 4.12 Haptics (M11)

On phones that can, game events give a short vibration alongside their sound: the same events as the SFX (§4.11), classified the same way, so the two never disagree. It doesn't depend on the skin or the sound volumes: muted SFX still vibrate.

| Event                       | Pattern (ms on, off, on, …) |
| --------------------------- | --------------------------- |
| UI click, select / pick up  | 30                          |
| Move (and undo)             | 60                          |
| Capture                     | 110                         |
| Castle (two pieces move)    | 60, 90, 60                  |
| Promotion                   | 60, 70, 130                 |
| Check                       | 100, 90, 100                |
| Checkmate (and resignation) | 150, 100, 150, 100, 400     |
| Draw                        | 150, 150, 150               |
| Illegal drop                | 50, 60, 50                  |
| New game                    | 80                          |

The API has no strength setting, and a phone's motor needs time to spin up, so length is what makes a buzz felt. These were chosen on an Android phone from a set of candidates; the first patterns (8–30 ms) could barely be felt.

- **Android** (Chrome): the Vibration API plays the patterns, the computer's moves included (after the first tap, which browsers require). Chrome doesn't vibrate while the phone is muted. Firefox for Android has no Vibration API, so it stays still.
- **iPhone:** Safari has no Vibration API. iOS 18 and later give a system tick when an iOS switch control (`<input type="checkbox" switch>`) is toggled, so a hidden one is toggled instead: one light tick, whatever the event, and only during a tap (`navigator.userActivation`). So the player feels their own actions but not the computer's moves.
- **Desktop:** nothing. Support needs a coarse pointer, so a desktop browser with a no-op `navigator.vibrate` doesn't count.
- A **Vibration** toggle in Settings (in the Sound group), on by default and persisted, shown only where haptics work.
- **Implementation (M11):** `haptics.ts` holds the patterns and the two ways to play them; `Sound` plays the haptic for every SFX event it handles (`sound.haptics`), so a new sound event gets its haptic for free. The hidden iOS switch is marked so its own click doesn't count as a UI click.

### 4.13 Splash screen

A start screen over the game when the app opens, from the skin's optional `splash` picture (§5.1); a skin without one has none.

- **When:** every time the app starts, over the resumed game (or a new one if there is none). A link that sets up the game (`?mode=`, `?color=`, `?fen=`, §4.9) skips it, as it skips resuming.
- **Picture:** the skin's picture for `md` and up, and below `md` its optional portrait picture (`splash.portrait`, laid out with its own title area and button height; Pirate's is a tavern scene) or else the same one. It is a `<picture>` element, so only the picture for the screen is downloaded, and the skin's load waits for just that one. The picture is as large as fits the screen (at most 64rem wide), with rounded corners over a near-opaque backdrop in the theme's `bg`. The title **"Vibe Chess"** is set in the skin's font over the area at `splash.title.inset` (fractions of the picture inset from each edge: Pirate's parchment banner), as large as fits it, in `splash.title.color` (default: the theme's `text`).
- **Buttons:** **New Game** (opens the New game drawer, §6.3, set to vs Computer whatever the game behind is, keeping its colour and difficulty) and **Continue** (back to the game behind), in a panel of the theme's `surface` (slightly see-through, blurring the art) near the bottom of the picture, so they don't get lost in it. The panel sits `splash.buttons.bottom` of the picture's height up from its bottom edge (default 4%), so a skin can keep it clear of its art: Pirate's is 15%, over the sea and above the crest in its frame, and 6% on its portrait picture, over the tavern floor. Without a portrait picture, the landscape one is too small below `sm` to put them on, so they sit under it. Continue is enabled only when a resumed game is in progress (at least one move and not over). The accent button is Continue when it can be used, else New Game.
- **Closing:** New Game, Continue or Esc (Esc goes back to the game, like Continue). It is a modal dialog, like the game-over overlay (§4.7.1), labelled by its title, and fades out. It opens before any input, so the dialog itself takes focus.
- The splash adds no sound of its own, but its buttons are the first press, so they unlock audio: their click plays and the music starts (§4.11).
- The picture holds up the skin's load like the board does, since it is on screen first.

## 5. Skin system

### 5.1 Skin manifest

Each skin is a folder at `static/skins/<id>/` holding a `skin.json` manifest and its assets. Paths in the manifest are relative to the skin folder.

```jsonc
{
	"manifestVersion": 1, // required; bumped on incompatible format changes
	"id": "pirate", // must match the folder name
	"name": "Pirate",
	"disabled": false, // optional; true leaves the skin out of the choices (§5.5)

	"board": {
		"image": "board.webp",
		// Playing-area offset as a fraction of the image size.
		// 0 on all sides = no frame; coordinates then render outside the board.
		"inset": { "top": 0.06, "right": 0.06, "bottom": 0.06, "left": 0.06 }
	},

	"pieces": {
		"image": "pieces.webp",
		"columns": 6,
		"rows": 2,
		"order": ["k", "q", "b", "n", "r", "p"], // column order in the sheet
		"rowFor": { "w": 1, "b": 0 }, // sheet row per side
		"scale": 0.95, // sprite size relative to a square
		"anchorY": 0.02, // lift from the square bottom
		"anchorYFor": { "p": 0.1 } // optional per-type override (short pawns sit too low on the shared baseline)
	},

	"moveIndicator": {
		"image": "indicator-move.webp",
		"scale": 0.8, // relative to a square
		"opacity": 0.75,
		"hoverOpacity": 0.85, // optional; target under the pointer or dragged piece
		"captureScale": 1.1 // fallback capture rendering
	},

	// Optional. If absent, moveIndicator @ captureScale is used.
	"captureIndicator": {
		"image": "indicator-capture.webp",
		"scale": 0.9,
		"opacity": 0.6
	},

	"font": {
		"family": "Pirata One",
		"files": [{ "src": "font/PirataOne-Regular.woff2", "weight": 400, "style": "normal" }],
		"fallback": "Georgia, serif",
		"license": "font/OFL.txt"
	},

	"coordinates": {
		"fontScale": 0.55, // × inset (framed boards)
		"gutter": 0.35 // × square size (frameless boards)
	},

	"theme": {
		"bg": "#1b120b",
		"surface": "#2b1d12",
		"surfaceRaised": "#3a2716",
		"text": "#f3e2b8",
		"textMuted": "#bfa77a",
		"accent": "#d9a441",
		"danger": "#f2766b",
		"highlightSelected": "rgba(217,164,65,0.45)",
		"highlightLastMove": "rgba(240,200,90,0.30)",
		"highlightCheck": "rgba(200,30,30,0.55)",
		"coordText": "#f3e2b8",
		"coordShadow": "0 1px 2px rgba(0,0,0,0.8)",
		"pieceShadow": "drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0.25cqw 0.8cqw 1cqw rgba(0,0,0,0.55))", // CSS filter: outline + diffuse shadow (cqw = 1% of board width)
		"pieceShadowBlack": "drop-shadow(0 0 1px rgba(255,255,255,0.8)) …", // optional per-side override (also pieceShadowWhite)
		"dragShadow": "0 8px 16px rgba(0,0,0,0.5)", // x y blur colour, used in drop-shadow()
		"dragScale": "1.15", // optional
		"scrim": "rgba(0,0,0,0.55)" // drawer / dialog backdrop
	},

	// Optional flavour text. Every key falls back to a default.
	"labels": {
		"white": "Blue Crew",
		"black": "Red Crew",
		"difficulty": {
			"p0": "Cabin Boy",
			"p1": "Deckhand",
			"p2": "Bosun",
			"p3": "Quartermaster",
			"p4": "First Mate",
			"p5": "Captain"
		}
	},

	// Optional speech bubbles over a speaking piece (§4.11): a sheet of square cells, and per voice
	// event (not "captured") the cells to pick from, numbered across then down.
	"emotes": {
		"image": "emotes.webp",
		"columns": 4,
		"rows": 2,
		"scale": 1.3, // bubble width in squares (default 1)
		"events": { "taunt": [0, 1, 2, 6] }
	},

	// Optional game-over pictures (§4.7.1). win, loss and resign take one path, or one per side (the
	// winner's for win, the loser's for loss and resign); stalemate falls back to draw. Any may be left out.
	"results": {
		"win": { "w": "result-win-blue.webp", "b": "result-win-red.webp" },
		"loss": { "w": "result-loss-blue.webp", "b": "result-loss-red.webp" },
		"resign": "result-resign.webp",
		"draw": "result-draw.webp",
		"stalemate": "result-stalemate.webp"
	},

	// Optional start screen (§4.13): a picture, and the area on it for the title, as fractions of the
	// picture inset from each edge, with the title's colour (default: theme text).
	"splash": {
		"image": "splash.webp",
		"title": {
			"inset": { "top": 0.0605, "right": 0.312, "bottom": 0.8115, "left": 0.311 },
			"color": "#4a2a12"
		},
		"buttons": { "bottom": 0.15 }, // the buttons' distance up from the bottom edge (default 0.04)
		// Optional picture below md, laid out the same way; the title colour defaults to the one above.
		"portrait": {
			"image": "splash-mobile.webp",
			"title": { "inset": { "top": 0.066, "right": 0.182, "bottom": 0.85, "left": 0.186 } },
			"buttons": { "bottom": 0.06 }
		}
	},

	// Optional. Every part is optional; a skin without audio is silent (§4.11).
	"audio": {
		"music": ["audio/music/sailing.mp3", "audio/music/shanty.mp3"], // shuffled per session
		"sfx": {
			// each optional: start, select, move, capture, castle, promotion, check, checkmate, draw, illegal, click
			"move": "audio/sfx/move.mp3",
			"capture": "audio/sfx/capture.mp3"
		},
		"voices": {
			// side → piece type → event → pool of variations
			"w": {
				"k": {
					"move": ["audio/voices/w-king-move-1.mp3", "audio/voices/w-king-move-2.mp3"],
					"check": ["audio/voices/w-king-check-1.mp3"]
				},
				"n": { "capture": ["audio/voices/w-knight-capture-1.mp3"] }
			},
			"b": {}
		}
	}
}
```

Validation rules (`src/lib/skins/schema.ts`):

- Every problem is reported with its JSON path (e.g. `pieces.order: expected each of …`), so a broken manifest can be fixed in one pass.
- Asset paths must be relative paths inside the skin folder with an extension: no leading `/`, no scheme, no `..`. Validation resolves them against the skin folder, so the manifest the app works with holds absolute URLs and nothing else resolves paths.
- `board.inset` sides are fractions in [0, 0.45]. `pieces.order` must list each of `k q b n r p` exactly once. `pieces.rowFor` rows must exist in the sheet.
- Optional fields get defaults: `pieces.scale` 1, `pieces.anchorY` 0, `pieces.anchorYFor` each type at `anchorY`, indicator `scale` 1, `moveIndicator.opacity` 0.75, `moveIndicator.captureScale` 1.1, `captureIndicator.opacity` 0.6, indicator `hoverOpacity` 0.85, `disabled` false, font file `weight` 400 and `style` normal, `font.fallback` serif, `coordinates.fontScale` 0.55, `coordinates.gutter` 0.35, `theme.coordShadow` none, `theme.dragScale` 1.15, `theme.pieceShadow` a firm dark outline plus a soft drop shadow, `theme.pieceShadowWhite`/`pieceShadowBlack` the value of `pieceShadow`, `labels` empty, `audio` none. Every other `theme` key is required.
- `emotes` cells are integers within the sheet, per event a non-empty array; `captured` and unknown events are errors. The art is expected to draw each bubble's tail at its bottom left. The sheet loads in the background, not holding up the skin.
- `results` keys are `win loss resign draw stalemate`; unknown ones are errors. A per-side value needs both `w` and `b`.
- `audio.voices` sides are `w`/`b`, piece types `k q b n r p`, events `move capture captured check defeat taunt`; pools are non-empty arrays of asset paths. Unknown `sfx` names are errors, so a typo doesn't silently drop a sound.

### 5.2 Fonts: bundled with the skin (decision)

**Recommendation: bundle the font files in the skin folder** (`woff2`), declared through the manifest above. Do not load them from the Google Fonts CDN.

Why:

- **Self-contained skins.** A skin is one folder. Copying it in is enough to add a skin, which matches the "no code changes" goal.
- **Works offline and locally.** The app already runs fully client-side, Stockfish included. Fonts shouldn't be the one thing that needs a network.
- **Preloadable with the rest of the skin.** The app loads fonts with the `FontFace` API alongside the images, then swaps the skin in one step. Board labels never flash in a fallback font.
- **No third-party requests.** Avoids the GDPR concerns around Google Fonts.
- **Licensing is fine.** Pirata One is SIL OFL 1.1, which allows redistribution. Ship `OFL.txt` with it.

The manifest **may** also accept `"css": "https://fonts.googleapis.com/css2?family=..."` instead of `files`, for quick experiments. Bundled files are the documented path, and the Pirate skin uses them.

### 5.3 Pirate skin: asset notes

The skin's served assets are in `static/skins/pirate/`.

| File                                                        | Size            | Notes                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pirate-board.png` → `board.png`                            | 1254×1254, RGB  | Wooden frame. The inset was measured from the grout lines: top 0.059, right 0.060, bottom 0.064, left 0.060. Squares are ≈138 px and hand-drawn, so they vary by ±5 px; check the alignment visually in M2. a1 is dark, so the image is drawn from White's side.                                                  |
| `pirate-pieces.png` → `pieces.png`                          | 2172×724, RGBA  | 6 × 2 grid of 362 px cells. Columns: King (captain), Queen (spyglass), Bishop (navigator), Knight (horse), Rook (cannon tower), Pawn (deckhand). Row 0 = **Red = White**, row 1 = **Blue = Black**.                                                                                                               |
| `pirate-move-indicator.png` → `move-indicator.webp`         | 1254×1254, RGBA | Gold and rope compass ring with a transparent centre. ~0.8 MB at this size: **downscale to ~256 px and convert to WebP**, since it renders at most one square.                                                                                                                                                    |
| `pirate-capture-indicator-2.png` → `capture-indicator.webp` | 1254×1254, RGBA | **Crossed sabers** (chosen). Its open X shape covers the least of the captured piece, and its steel and gold match the move ring. Downscale to ~256 px WebP. The alternatives (`-1` skull and crossbones, `-3` Jolly Roger flag) are kept outside `static/` and can be tried by changing one line in `skin.json`. |
| `fonts/PirataOne-Regular.woff2`                             | —               | From Google Fonts / google/fonts repo, with `OFL.txt`.                                                                                                                                                                                                                                                            |

Asset budget: the board and pieces should also be exported as WebP (keeping PNG as a fallback is unnecessary for current browsers), with the board at ≈1024 px. Target total skin weight: under 1.5 MB.

### 5.3.1 Default (Marble) skin: asset notes

| File                    | Notes                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `board.png` 1254×1254   | White marble and black granite squares with **no frame** (inset 0), so coordinates go in the gutter outside the board. a1 is dark. |
| `pieces.png` 2172×724   | Staunton set in marble and granite, with the same column order and rows as Pirate. **Not on a 362 px grid** (see §5.6).            |
| `indicator-move.png`    | Small marble dot, about 24% of the image. At `scale` 1.0 it is drawn about a quarter of a square wide.                             |
| `indicator-capture.png` | Bevelled marble X. It is light grey, so it may have low contrast over the white pieces on light squares; check this in M3.         |
| Font                    | **Marcellus** (OFL).                                                                                                               |

### 5.4 Rendering approach

- **Board:** the board image is the background of a square container. An 8×8 grid is positioned inside it using `inset` (as percentages). Highlights, indicators and pieces all align to that grid, so the layout is resolution-independent.
- **Pieces:** a `<div>` per piece uses the sprite sheet as `background-image`, with `background-size: 600% 200%` and `background-position` computed from (column, row). No slicing step is needed.
- **Piece contrast:** every sprite gets `filter: var(--piece-shadow-white|black)` (`theme.pieceShadowWhite`/`pieceShadowBlack`, defaulting to `theme.pieceShadow`). `drop-shadow()` follows the sprite's alpha, so stacking a 0-offset 1 px shadow (outline) with a soft offset one (depth) gives an antialiased edge. Stacked filters compound, so two 1 px outlines read firmer than one. Dark pieces on dark squares need a **light** rim instead (Marble's `pieceShadowBlack`), which is why the shadow can differ per side. Sprites that draw their own bold outline need much less: Pirate's revised sheet uses one faint 0.5 px hairline (to smooth the downscaled edge) and a lighter, tighter drop shadow.
- **Flip:** the square→grid mapping is mirrored. The board image itself is not rotated, because the board looks the same either way round and rotating the image would put the frame's shading upside-down.
- **Theme:** `theme` keys are written to CSS custom properties (`--bg`, `--accent`, `--coord-text`, …) on `:root`. Components use only these variables.
- **Font:** loaded through `FontFace` from the manifest and exposed as `--skin-font` (the quoted family) plus `--font-fallback`. All UI text uses `var(--skin-font), var(--font-fallback)`, through Tailwind's `font-skin`. The runtime variable is not called `--font-skin`, because that name is Tailwind's theme variable for the `font-skin` utility and would reference itself.
- **Layers** (bottom to top):
  1. board image
  2. square highlights
  3. pieces
  4. move and capture indicators (translucent)
  5. dragged piece
  6. promotion picker

### 5.5 Skin registry & loading

- `src/lib/skins/index.ts` lists the available skin ids. A skin's folder URL comes from `asset('skins/<id>/skin.json')`, which is typed against the files in `static/`, so registering an id without a manifest fails `npm run check`.
- `loader.ts` fetches, validates and preloads (steps 1–3), and returns the validated manifest. The store in `skin.svelte.ts` applies and swaps (steps 4–5), and a newer load supersedes one still in flight.
- Loading a skin means:
  1. fetch `skin.json`
  2. validate it (a hand-written type guard is enough; zod is optional)
  3. preload all images and fonts in parallel
  4. apply the CSS variables
  5. swap the skin
- If a manifest is invalid, the app logs the specific errors and stays on the current skin.
- **Availability:** a manifest with `"disabled": true` keeps its skin registered but leaves it out of the choices. `availableSkins()` reads every registered manifest once, keeping the enabled skins with their names; a manifest that can't be read stays listed, so loading it reports the problem.
  - At start-up the layout tries the saved skin, then the default, then the other available skins, in that order, and uses the first that loads. If every skin is disabled, the default is used anyway.
  - The Settings skin picker shows only when more than one skin is available. With one, it is simply applied.
- **Skins in v1:** Marble (`default`, the default skin) and Pirate. **Marble is currently disabled**, so Pirate is the only skin on offer and the picker is hidden. The e2e tests enable every skin by rewriting the manifests in the browser (`enableAllSkins`), so gameplay is tested in Marble with its White/Black labels, and `skins.e2e.ts` covers the skins as shipped. The skin-system component tests use a small **fixture skin** in `tests/fixtures/skins/test/` (tiny generated images, inset 0, no capture indicator, no labels) so the frameless, coordinate-gutter and default-filling paths are covered independently of the real art. `tests/fixtures/skins/invalid/` covers the "stay on the current skin" path.

### 5.6 Skin assets: source art vs served files

- **Source art** lives in `scratchpad/skins/<id>/assets/`, as the original PNG and TTF files: `board.png`, `pieces.png`, `indicator-move.png`, an optional `indicator-capture.png`, an optional `emotes.png`, and `font/*.ttf` + `OFL.txt`. It is kept locally for re-exports, is not served, and is not committed (`scratchpad/` is excluded via `.git/info/exclude`).
- **Served skin** lives in `static/skins/<id>/`. It holds the optimised assets plus `skin.json`, which is the **only** manifest and is edited by hand.
- **Conversion is a manual, one-off step, not part of the build.** When source art changes, run:

  ```
  .venv/bin/python scripts/convert-skin.py [<id> ...]
  ```

  Run it with the project venv: `python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt` once, then `.venv/bin/python scripts/convert-skin.py <id>`. `.venv/` is gitignored. It writes:
  - `board.webp`
  - `pieces.webp`
  - `indicator-move.webp`
  - `indicator-capture.webp`
  - `emotes.webp`: speech bubbles drawn on white, on an even grid (the manifest's `emotes.columns` × `rows`). The white connected to the edges is cut out and the rim un-blended from white, so no pale halo; each cell keeps only the bubble around its centre (neighbours' edges can cross the grid lines); the bubbles are repacked at one shared scale into centred 256 px cells. Pirate's 8 bubbles: 113 KB.
  - `result-*.webp`, from any `result-*.png`: game-over pictures (§4.7.1), cropped to the art, centred in a square with a little padding, 512 px. About 50 KB each.
  - `splash.webp` and `splash-mobile.webp`, from `splash.png` and `splash-mobile.png`: the start screen's landscape and portrait pictures (§4.13), opaque, at most 1920 px on the longest side, at WebP quality 75 rather than 88: busy art that is on screen at first load, so a third smaller with no visible loss. Pirate's: 331 KB and 203 KB.
  - `font/*.woff2` and `font/OFL.txt`

  It never writes `skin.json`.

- **Piece-sheet normalisation** (part of the conversion):
  - It splits the sheet into its 2 rows at the transparent gap between them, then finds the 6 sprites in each row by their **connected outlines**: each sprite is one of the 6 largest connected shapes, and stray specks join the nearest one. Sprites may overlap horizontally as long as they don't touch, so a tightly packed sheet is cut out without clipping.
  - It crops each sprite to its own pixels' bounding box.
  - It repacks them into a clean 6 × 2 grid of 320 px square cells. Each sprite sits on a common baseline and is centred horizontally **on its base** (the median centre of its bottom 15%), not its bounding box, so pieces holding a sword or flag out to one side still stand in the middle of the square. All sprites share **one** scale factor, so relative piece heights are preserved.
  - The script stops with an error if it doesn't find exactly 12 sprites.
- **Board grid fitting** (framed boards, i.e. inset > 0): the app places pieces on an even 8 × 8 grid inside the inset, but hand-drawn boards drift. The converter finds each inner square edge as the darkest line within 18% of a square of its even-grid position, prints the offsets, and resamples the image piecewise-linearly so the edges land on the even grid. Pirate's lines were off by up to 4 px (≈3% of a square), which together with bounding-box centring made pieces on files a–d look visibly left of centre.
- **Sprite authoring rule:** sprites only have to appear in the manifest's `order`, in two rows separated by transparent space, and must not touch each other. They do not have to sit exactly on a grid, and their bounding boxes may overlap. Neither original sheet was grid-aligned:
  - Pirate's spyglass, pointing hand and flag reached 6–23 px into the next cell.
  - Marble used a ≈288 px pitch, and its white bases crossed the row boundary.
- **Output sizes (2026-10-16 conversion):** Pirate ≈640 KB and Marble ≈430 KB in total, down from ≈9 MB of source PNGs. Indicators are 320 px and boards keep their native 1254 px.
- **Audio** (M10), from `assets/audio/{music,sfx,voices}/`, through ffmpeg (the `imageio-ffmpeg` package, so no system install). `--only audio` (or `images`, `fonts`) converts just that part; the output folder `audio/` is fully regenerated, and repeat runs give identical files.
  - Music is levelled (−20 dB gated RMS) and re-encoded to stereo MP3 at 112 kbps. SFX and voice clips become mono 44.1 kHz MP3 at 64 kbps, with silence trimmed from both ends (anything 45 dB under the loudest moment, keeping 10 ms before and 100 ms after, so a sound lands with its move), 5 ms and 40 ms fades, and one common level (−18 dB gated RMS, peaks under −1 dBFS). MP3 decodes everywhere, including Safari's Web Audio.
  - SFX are named by event; `game-start`, `castling`, `illegal-move` and `stalemate` become `start`, `castle`, `illegal` and `draw`. An unknown name stops the script.
  - **Recorded voice lines:** each spoken character's lines come as one file per side and piece (`white-king.mp3`), with the script in a CSV (`colour,piece,action,line`, in recording order; `checkmate_defeat` is the `defeat` event). A separate one-off script, `scripts/cue-voices.py <id>`, transcribes the files with Whisper (word timings), aligns them with the CSV, cuts at the quietest point between lines, transcribes each cut again to check it holds its line, and writes the cut points next to the CSV as `voice-cues.json`. The converter cuts at those points only, so it doesn't need Whisper; the cue script's extra requirement is in `scripts/requirements-cues.txt` (faster-whisper; the model download is about 1.5 GB).
  - Clips are named `<w|b>-<piece>-<event>-<n>.mp3` (`w-king-check-2.mp3`). Files already holding one sound, named `<colour>-<piece>-<event>[-alt].mp3` (the knights and rooks), are numbered with the plain file first. The converter prints the `audio` block for `skin.json`, which is still edited by hand.
  - **Pirate (2026-10-17):** the 8 recordings gave 84 clips, all confirmed by the second transcription. One flag was a laugh ("Ha ha!") recorded before the white pawn's "Down ye go!", kept as part of the line. With the knights and rooks that's 108 voice clips (1.5 MB, down from 3.2 MB), 10 SFX (128 KB) and 7 music tracks (16 MB, down from 27 MB; only the playing track is downloaded).

## 6. Layout (mobile-first)

### 6.0 Breakpoints & styling

- **Tailwind CSS v4** with its **standard breakpoints**, left unchanged: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Components only use breakpoint prefixes (`lg:flex-row`, `lg:hidden`, …). No component contains a pixel value for a breakpoint or a custom media query.
- The layout switches from single-column to **board + side panel at `lg`**. Below that, including tablets in portrait, the board takes the full width.
- **UI scale:** on big screens the whole UI grows, like browser zoom: the root font size is `clamp(100%, min(100vw / 64, 100vh / 36), 150%)`, so it scales up to 1.5× only as far as the screen still fits the desktop layout at 1024×576 in scaled pixels. Phones and portrait tablets stay at 1×; 1280×800 gets 1.25×, a 1920×1080 screen 1.5×. Sizes are in `rem`, so text, spacing, panels and drawers scale together, and the board already sizes itself from the viewport minus `rem` margins, so the result matches 150% zoom. Media-query `rem`s always mean the browser's default font size, so the breakpoints don't move.
- **Skin tokens in Tailwind:** `app.css` maps the runtime CSS variables into Tailwind's theme. Components can then use `bg-surface`, `text-accent`, `font-skin`, … and the values follow the active skin:

  ```css
  @import 'tailwindcss';
  @theme inline {
  	--color-bg: var(--bg);
  	--color-surface: var(--surface);
  	--color-surface-raised: var(--surface-raised);
  	--color-text: var(--text);
  	--color-muted: var(--text-muted);
  	--color-accent: var(--accent);
  	--color-danger: var(--danger);
  	--font-skin: var(--skin-font, serif), var(--font-fallback, serif);
  }
  ```

- Board internals use plain CSS (scoped `<style>`), because they need percentage-based geometry computed from the manifest. Examples are piece transforms, inset positioning and sprite offsets.

### 6.1 Base layout (narrow, below `lg`): single column

```
┌──────────────────────────┐
│ ☠ Vibe Chess    ⓘ ⚙      │  header (compact)
├──────────────────────────┤
│ ● Red Crew ♟♟♞    +2     │  opponent strip: side, captures, +N, engine/thinking
├──────────────────────────┤
│                          │
│          BOARD           │  width = 100vw − 2×16px gutter,
│   (coords in frame or    │  capped so the page fits without scrolling
│    gutter, see §4.4)     │
│                          │
├──────────────────────────┤
│ ● Blue Crew ♙♗ — to move │  player strip: side, captures, +N, status
├──────────────────────────┤
│ [New][Undo][Flip][⚑][☰]  │  control bar (icon buttons + short labels)
└──────────────────────────┘
          ☰ opens ↓
┌──────────────────────────┐
│ ▔▔▔▔  Moves              │  bottom drawer (sheet)
│ 1. e4    e5              │
│ 2. Nf3   Nc6             │
└──────────────────────────┘
```

- Board size is `min(100vw − 32px, 100dvh − header − strips − control bar)`. The board is always fully visible without scrolling, on any phone in portrait.
- **Implementation (M7):** the status sits on its own line under the player strip, rather than inside it, so a full row of captures still fits on a 360 px phone. The line shows the status (whose turn, check, thinking, result) and the last move in SAN, so the drawer is optional during play. The control bar sits at the bottom of the screen, in reach of a thumb. Its buttons are icons with short labels (New, Undo, Flip, Resign, Moves), and their accessible names are the full names (e.g. "Flip board").
- **Game over:** the result and a "New game" button replace the status inline, and the game-over overlay (§4.7.1) shows the result with the skin's picture.
- **Resign** (⚑) sits in the control bar. Its confirmation is an inline two-tap ("Resign?" ✓/✕) that takes over the bar, rather than a dialog. "No" puts focus back on Resign.

### 6.2 Wide layout (`lg` and up): board + side panel

```
┌──────────────────────────────────────────────────┐
│ ☠ Vibe Chess                            ⓘ ⚙      │
├───────────────────────────────┬──────────────────┤
│ ● Red Crew ♟♟♞   +2           │ Status           │
│                               │ ──────────────── │
│            BOARD              │ Moves            │
│                               │ 1. e4   e5       │
│                               │ 2. Nf3  Nc6      │
│ ● Blue Crew ♙♗                │ ──────────────── │
│                               │ [New] [Undo]     │
│                               │ [Flip] [Resign]  │
└───────────────────────────────┴──────────────────┘
```

- At `lg`, the controls and move list move from under the board into a side panel (≈ 320 px) next to it. The move list renders inline in the panel, not in the drawer, and the ☰ button is hidden (`lg:hidden`).
- **Implementation (M7):** the panel is exactly as tall as the board column (strips included). The status line sits level with the board's top edge and the controls (2×2, icon + full name) with its bottom edge, and the move list scrolls in between.
- Board size is `min(100dvh − header − 32px, 100vw − panel − 48px)`.

### 6.3 What goes where

**Principle:** simple controls fit into the main layout. A **composite** UI goes in a **Drawer** on narrow screens; a composite is a group of related inputs or content that doesn't fit the main column.

| UI                                                     | Narrow (below `lg`)   | Wide (`lg` and up)                  |
| ------------------------------------------------------ | --------------------- | ----------------------------------- |
| New / Undo / Flip / Resign                             | Control bar           | Side panel                          |
| Status, check, result, engine thinking                 | Line under the strips | Side panel                          |
| Captured pieces, material `+N` (§4.10)                 | Player strips         | Player strips                       |
| Move list                                              | **Drawer** (☰)       | Inline in side panel                |
| New Game setup (mode, colour, difficulty + Elo slider) | **Drawer**            | Drawer (opened from the side panel) |
| Settings (skin, guidance, coordinates, auto-flip)      | **Drawer** (⚙)        | Drawer                              |
| Credits                                                | **Drawer** (ⓘ)        | Drawer                              |
| Promotion picker                                       | Overlay on the board  | Overlay on the board                |
| Resign confirm, game-over status                       | Inline                | Inline                              |
| Game-over overlay (§4.7.1)                             | Modal over the screen | Modal over the screen               |
| Splash screen (§4.13)                                  | Modal over the screen | Modal over the screen               |

The game is called **Vibe Chess** (the header and the page title). The ⓘ button beside Settings opens the **Credits** drawer: Meat Proxy (Veli Gebrev), Code (Claude), Graphics (ChatGPT), Music (Suno), Sound Effects (ElevenLabs), and the chess.js and stockfish.js libraries, each linking to its site or repository in a new tab.

On wide screens, New Game and Settings could be shown as a centred dialog instead. The plan uses the same `Drawer` component everywhere for v1: one component, one behaviour, less to test. On `lg` the drawer can open as a side sheet from the right instead of a bottom sheet, through a `side` prop.

### 6.4 Drawer component

- `Drawer.svelte` is a generic sheet with a backdrop (`--scrim`). It comes up from the bottom on narrow screens and in from the right at `lg`.
- **Open:** a slide-up transition (respects reduced motion).
- **Close:** tap the backdrop, swipe down on the handle, press `Esc`, or use the close button.
- While open, focus is trapped and the background is `inert`. Focus returns to the trigger on close.
- Height is content-sized, up to the screen's height less 4 rem (a strip of backdrop stays to tap), with internal scroll beyond that.
- **Implementation (M7):**
  - A native modal `<dialog>` (`showModal()`) fills the viewport and draws its own scrim and sheet, so both can be animated. The modal dialog provides the focus trap and the inert background. The trigger's focus is restored once the sheet has slid out, if the trigger is still on the page.
  - Esc is caught on the dialog's `cancel` event and routed through `onclose`, so the sheet slides out instead of vanishing.
  - The slide direction comes from CSS variables set by breakpoint classes (`--sheet-x`/`--sheet-y`), so the component has no media query (§6.0). Durations come from `motion.drawer` (250 ms, 0 with reduced motion).
  - The handle is shown below `lg` only. A swipe of more than 64 px closes the sheet; a shorter one springs back.
  - The content mounts when the drawer opens, so the New game form always starts from the last game's setup.

### 6.5 Input & accessibility

- Keyboard: `F` flips the board, `Ctrl/Cmd+Z` undoes, `Esc` deselects, closes the picker or closes the drawer.
- Each square is a button with an `aria-label` (e.g. "e4, Blue Crew pawn"). A visible focus ring is drawn from `--accent`.
- Status changes are announced through an `aria-live="polite"` region.
- Arrow keys move between squares as seen on screen, so they follow a flip. Home and End go to the ends of the row. (Promoted from a stretch goal in M8: with a single tab stop, the board could not be played from the keyboard without them.)
- **Implementation (M8):**
  - The announcement includes the move that caused the status, e.g. "1… e5. White to move", so a screen reader hears the computer's reply. The visible status line is unchanged.
  - A global `:focus-visible` outline in `--accent`; board squares and the promotion picker draw theirs inside the square.
  - Enabled buttons and sliders get the pointer cursor (Tailwind v4 resets buttons to the default), matching the option chips and toggles; disabled ones keep the arrow.
  - The promotion picker only accepts a click whose press started on it, or one from the keyboard. On a phone the move happens on touch-down, so the picker opens under the finger and the tap's click lands on the queen; without this, every tap-move promotion became a queen.
  - The promotion picker focuses the queen only when the move was made with the keyboard (the square had a visible focus ring). After a tap or click nothing in it is focused, so no ring shows.
  - When the promotion picker closes with focus in it, focus goes back to the board: to the promotion square after a choice, to the pawn after a cancel.
  - Text colours meet WCAG AA contrast on the skin surfaces. Both skins' `danger` became `#f2766b`; `#b3261e` was about 2.2:1 on their dark surfaces.
  - `a11y.e2e.ts` runs axe (`@axe-core/playwright`) over each state of the screen in both skins, and plays moves with the keyboard alone.

## 7. Architecture

### 7.1 Stack

- **SvelteKit** with **Svelte 5** (runes), **TypeScript**, **Vite**
- **@sveltejs/adapter-static** (SPA mode, `fallback: 'index.html'`). It runs locally with `vite preview` or any static server, and deploys to **Cloudflare Pages** as plain static output with no special headers or functions.
- `ssr = false` on the game route, because the chess state, engine, `localStorage` and `FontFace` are all browser-only.
- **Tailwind CSS v4** (`@tailwindcss/vite`), standard breakpoints, skin tokens mapped through `@theme inline` (§6.0)
- **Cloudflare Pages (M8 check):**
  - The build is about 21 MB in under 200 files, well under Pages' limits (20,000 files, 25 MiB per file); the largest files are the Pirate music tracks at about 2.5 MB each.
  - With no `404.html`, Pages serves `index.html` for unknown paths, matching the SPA fallback.
  - `static/_headers` caches `/_app/immutable/*` (hashed) for a year; `index.html` and the skins keep the default revalidation.
  - Checked locally with `wrangler pages dev build`, which serves deep links as `index.html`, the WASM as `application/wasm` and the cache header; the whole e2e suite passes against it. Wrangler isn't a project dependency; run it with `npx`.
  - **Deploy:** served at `https://chess.gebrev.com` from a Pages project connected to the GitHub repo: every push to `main` builds (`npm run build`, output `build/`) and goes live, and other branches get preview URLs. `.node-version` pins the build's Node to 24 (SvelteKit 3 needs ≥ 22.17).
  - **Link previews:** `src/app.html` carries a description and Open Graph / Twitter card tags with `og-image.png` (1200×630). They are static and use absolute `https://chess.gebrev.com/` URLs, since link crawlers don't run the SPA.
- **chess.js**: rules
- **stockfish** (npm, single-threaded lite WASM): engine
- **Vitest** for unit tests, **Playwright** for end-to-end smoke tests

### 7.2 Proposed structure

```
src/
  app.css                   # Tailwind import + @theme inline token mapping
  routes/
    +layout.svelte          # skin loading, CSS vars, app shell
    +layout.ts              # export const ssr = false (SPA via the index.html fallback)
    +page.svelte            # game screen (responsive layout)
  lib/
    game/
      game.svelte.ts        # Game class: wraps chess.js; reactive position, moves, result; history for saving
      pieces.ts             # stable piece-id reconciliation for animation
      material.ts           # captured pieces + material balance (§4.10)
      notation.ts           # move list rows, numbered SAN
      setup.ts              # new-game setup: mode, colour choice, difficulty
      outcome.ts            # a result as win/loss/resign/draw/stalemate, and its picture (§4.7.1)
      color.ts              # other(): the opposing side
    board/
      geometry.ts           # orientation helpers, square↔grid per orientation, sprite-sheet cells, coordinate labels
      motion.ts             # animation durations (zeroed for reduced motion), auto-flip and game-over pauses
    engine/
      engine.ts             # Promise-based UCI client (start, setOptions, search, stop)
      worker.ts             # the Stockfish Web Worker (lazy-loaded WASM)
      uci.ts                # UCI line parsing
      difficulty.ts         # Skill Level presets + custom Elo → UCI options
      thinkTime.ts          # complexity estimate → think budget (§4.6.1)
      opponent.svelte.ts    # starts the engine, times and plays its replies, cancellation
    skins/
      index.ts              # registry
      schema.ts             # Skin type + validation (asset paths resolved to URLs)
      loader.ts             # fetch, validate, preload images + FontFace, CSS vars and url()s
      skin.svelte.ts        # active skin store: apply + swap
    components/
      Board.svelte          # grid, layers, orientation, pointer handling
      Piece.svelte          # positioned piece: FLIP slides, capture and promotion fades
      Sprite.svelte         # one sprite from the sheet (pieces, drag layer, promotion picker)
      Highlights.svelte     # selected, last move, check (check is a radial glow so the king stays readable)
      Indicators.svelte     # move + capture indicators
      Coordinates.svelte    # in-frame or gutter labels
      PromotionPicker.svelte
      SpeechBubble.svelte   # a voice line's bubble over the speaking piece (§4.11)
      PlayerStrip.svelte
      StatusBar.svelte
      MoveList.svelte
      Controls.svelte
      Drawer.svelte
      GameOver.svelte       # game-over overlay: picture, headline, New game / View board
      Splash.svelte         # start screen: the skin's picture, title, New Game / Continue
      NewGameForm.svelte    # mode, colour, difficulty (in a Drawer)
      DifficultyPicker.svelte  # presets + custom Elo slider, shared by New game and Settings
      SettingsPanel.svelte  # skin, guidance, coordinates, auto-flip, sound, vibration, difficulty
      Credits.svelte        # who and what made the game, in the Credits drawer
      Icon.svelte           # stroked icons for the control bar, header and drawers
      Choices.svelte        # a radio group drawn as option chips (skin, opponent, colour, difficulty)
      styles.ts             # shared class strings: legends, sliders, primary/secondary buttons
      dialog.ts             # shared modal dialog: open/focus attachment, Esc handling, class
    audio/
      voices.ts             # which line (if any) a move gets: rules, taunt wait (§4.11)
      sfx.ts                # which SFX a move gets
      playlist.ts           # session shuffle + looping order
      mixer.ts              # Web Audio: unlock on first input, buffers, category gains, ducking, music element
      sound.ts              # turns game events into sounds from the active skin, at the set volumes, and haptics
    haptics.ts              # vibration patterns; Vibration API or the iOS switch tick (§4.12)
    labels.ts               # status templates + label fallbacks
    persistence.ts
    json.ts                 # guards for untrusted JSON (manifests, saved state)
    math.ts                 # clamp()
    testing/                # test-only helpers: fake engine worker, seeded random, test skins
static/
  favicon.*, icon-*.png, apple-touch-icon.png, site.webmanifest   # app icons (source in scratchpad/)
  og-image.png              # link-preview picture, 1200×630 (source in scratchpad/og/)
  skins/
    default/ pirate/        # skin.json, board.webp, pieces.webp, indicator-*.webp, font/…
tests/
  fixtures/skins/test/      # fixture skin (inset 0)
  fixtures/skins/invalid/   # deliberately broken manifest
```

### 7.3 State model

```ts
type Color = 'w' | 'b';
type Mode = 'computer' | 'hotseat';

type Difficulty =
	{ kind: 'preset'; id: 'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' } | { kind: 'custom'; elo: number }; // multiple of 50, 1350–3150

interface SavedGame {
	// persisted (§4.9); everything else is replayed from it
	startFen: string;
	moves: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }[];
	resigned: Color | null; // a resignation isn't on the board
	setup: { mode: Mode; color: Color | 'random'; difficulty: Difficulty }; // New game choices
	human: Color; // computer mode: the player's colour after a random choice
	orientation: 'white' | 'black';
}

interface BoardPiece {
	// render model, for animation
	id: string; // stable across moves
	color: Color;
	type: PieceSymbol;
	square: Square;
}

interface Settings {
	skinId: string;
	showLegalMoves: boolean;
	showCoordinates: boolean;
	autoFlip: boolean;
	lastDifficulty: Difficulty;
	sound: { music: number; sfx: number; voices: number }; // §4.11, volumes 0–1 (defaults 0.5, 0.8, 1)
	unmuted: { music: number; sfx: number; voices: number }; // the level each goes back to when unmuted, > 0
	haptics: boolean; // §4.12, default true
}
```

The `Game` class owns the chess.js instance and exposes `$state`/`$derived` fields. Components never touch chess.js directly. Colours and piece types are chess.js's own (`Color`, `PieceSymbol`), skin manifests included. UI state is local where it is used: the selection, drag, hover and a pending promotion in `Board`; the orientation, open drawer and overlays in the page.

## 8. Testing & acceptance

**Unit (Vitest)**

- Square↔grid mapping for both orientations
- Sprite background-position for all 12 pieces
- Piece-id reconciliation:
  - quiet move
  - capture
  - castling (both sides)
  - en passant
  - promotion
  - undo of each
- UCI parsing: `bestmove`, promotion suffix, `info` depth and nodes/s
- UCI client (scripted fake worker): start-up handshake, options sent only when changed, search with scored moves (bounded scores ignored), stale replies after `stop` (including a search not yet started), no option changes mid-search, load failure and timeout
- Opponent: waits out the think budget, drops a cancelled or outdated reply, sets the Skill Level or Elo limit only when it changes, reports a failed start
- Undo vs Computer takes back the move pair, or just the player's move while the engine thinks
- Difficulty: Elo snapping to 50 and clamping to 1350–3150, each preset's Skill Level and Elo, UCI options per difficulty, personality by Elo
- Think time (seeded RNG):
  - forced moves and opening positions fall in their ranges
  - a quiet endgame gets a shorter budget than a sharp middlegame
  - a recapture is shortened
  - higher difficulty yields a longer median budget for the same position
  - results are always within [500, 4500] ms
- Skin manifest validation:
  - valid manifest
  - optional captureIndicator absent
  - inset 0
  - bad paths
- Label fallbacks
- Captured pieces and material balance: captures (including en passant), a promotion (+8 for a queen), a captured promoted piece, and undo
- Game results: each end reason, resignation (final, no undo), taking back a checkmate
- Game-over outcome: win, loss, resignation, stalemate and draw; the picture in the winner's colours for a win and the loser's for a loss or resignation, and its fallbacks; the headline from the player's side or the winner's; the `results` manifest block and its errors
- Move list numbering, including games that start with Black to move
- Persistence round-trip (replay restores undo history, a promotion, a custom start and a resignation); missing, throwing or malformed storage falls back to defaults
- Keyboard: arrow keys move between squares as seen on screen (also when flipped), one tab stop, focus back to the board when the promotion picker closes
- Status announcement includes the last move
- Drawer: modal dialog named by its title, Esc / close button / scrim ask to close, focus returns to the trigger, swipe threshold
- Settings panel: skins listed by name, no skin picker with a single skin, auto-flip only in hot-seat, difficulty only vs Computer
- Skin availability: the `disabled` flag is validated; the start order is the saved skin, the default, then the rest, skipping disabled ones
- Controls: full accessible names, Moves button, focus back on Resign after "No"
- Sound rules (§4.11): each SFX case; a player's move and capture always voiced (with no answer), the computer's capture answered by the player's piece, taunts (only vs Computer, answering the player's quiet move in place of its line, from pieces that have them, 30 s apart; never on the computer's move or after a capture), check and checkmate always, castling and promotion speakers, missing lines; variations never repeat; the playlist shuffles every track once and loops; the `audio` manifest block and its errors; volumes in [0, 1] falling back on their own, unmute levels above 0; the `emotes` block and its errors
- Settings panel: a volume slider and mute toggle per category the skin has sound for, none for a silent skin; muting and unmuting (back to the last level above 0, also after sliding to 0)
- Haptics (§4.12): each event's pattern, nothing when off or unsupported, no support without a window; the Vibration toggle only where the device can vibrate

**E2E (Playwright, run at both 390×844 and 1280×800)**

- Scholar's mate in hot-seat mode: the game ends with a checkmate status, and the game-over overlay, closed by View board
- Game-over overlay: New game opens the New game drawer, Esc and the scrim close it, undo takes it away, a stalemate shows a draw, a resumed finished game doesn't show it; as shipped, Pirate's picture for the result
- Promotion flow shows the picker, and the chosen piece appears on the board
- Flip: after flipping, h8 is at the bottom-left, and the coordinate labels mirror
- vs Computer: after the human's first move, the engine replies within 5 s, and the player can't move the computer's pieces meanwhile
- vs Computer: undo takes back the pair; undo while the engine thinks cancels its reply; playing Black turns the board and the engine opens; a failed engine download falls back to two players
- Custom Elo: the slider moves in steps of 50
- Narrow viewport (390 px): the move list opens in a drawer and closes with Esc, giving focus back to the Moves button. Wide viewport (1280 px, i.e. `lg` and up): the move list is inline and there is no Moves button.
- The page fits without scrolling at 390×844, 1280×800 and 360×640, control bar included
- Drawers: settings apply at once and the drawer closes from its scrim; a short swipe on the handle springs back and a long one closes it; vs Computer, Settings offer the difficulty and not auto-flip
- Reload: the game resumes with its undo history, board side, skin and settings; a resignation stays final; vs Computer, Undo still takes back the pair and a reload on the computer's turn gets a reply; an unreplayable saved game starts afresh; the game plays with storage blocked
- Skins as shipped: Pirate only, with no picker; a saved skin that has since been disabled falls back to an enabled one. With every skin enabled, the picker switches skin and the choice survives a reload
- Sound, with the browser's Web Audio and media calls recorded: a move plays its SFX and the piece's line, a capture by the capturing piece alone, check by the checked king; two quick moves' lines overlap, neither stopped; music waits for the first press; volumes are kept across a reload, and 0 plays (and downloads) nothing in that category; a mute toggle sets 0 and, after a reload, brings the level back; the player's first move gets the computer's taunt, with a speech bubble over one of its pieces while the line plays; UI controls click once (a label and its checkbox too), the board and sliders don't
- Haptics, on a browser made to look like a phone that vibrates: picking up and moving a piece vibrate their patterns, and turning Vibration off (kept across a reload) stops them
- Splash, in Pirate as shipped: opens at startup with the portrait picture on a phone and the landscape one on desktop, the title on the banner in the skin's font; Continue is disabled without a game in progress; New Game opens the New game drawer; Continue and Esc go back to the game in progress; a link that sets up the game skips it
- Accessibility: no axe violations in each state of the screen (settings, start, selection, new game, move drawer, resign confirmation, game-over overlay, game over, promotion picker) in both skins, and on the splash; a move played with the keyboard alone

**Acceptance checklist (v1 done)**

- [ ] A full game can be played to checkmate against Stockfish at every preset and at custom Elo
- [ ] Castling, en passant and promotion all work through both click and drag, with correct animations
- [x] The board flips correctly (and animates) at any point
- [ ] With guidance on, indicators exactly match chess.js legal moves, and captures use the capture indicator or the fallback
- [x] Coordinates render in the frame on Pirate and in the gutter on the fixture skin, in the skin font
- [x] Status text uses skin labels, with "White"/"Black" fallbacks
- [x] Reloading resumes the in-progress game
- [x] Fully playable on a 360 px-wide phone in portrait with no page scroll
- [ ] Works in current Chrome, Firefox and Safari (including iOS)
- [ ] Builds to static output and runs on Cloudflare Pages and under `npm run preview`

## 9. Milestones

1. **Scaffold:** SvelteKit + TS + adapter-static + Tailwind v4, lint/format, Vitest, Playwright
2. **Board render:**
   - Skin manifest validation and loading (assets already converted, §5.6)
   - Static position and sprites
   - Coordinates in the frame, plus the fixture skin with a gutter
   - Flip
3. **Interaction:** select, guidance (move and capture indicators), click-move, drag-move, promotion, through chess.js
4. **Animation:** piece-id reconciliation, slide/fade transitions, reduced motion
5. **Game flow:** status and labels, player strips with captured pieces and material balance (§4.10), move list, game-over, undo, new game, hot-seat mode, auto-flip
6. **Engine:** lazy-loaded worker, UCI client, presets and custom Elo slider, think-time model and measuring nodes/s, vs-Computer mode
7. **Layout:** mobile-first shell, the `lg` side panel, Drawer (move list, New Game, Settings)
8. **Polish:** persistence, a11y pass, E2E suite, Cloudflare Pages deploy check
9. **Human-like opponent:** presets as target Elos for casual players (450–2250), full-strength analysis of every candidate move, a move choice that makes plausible mistakes for the target Elo, a calibration script, Elo shown on presets and the computer's strip (§4.6.2). Later removed for Skill Levels 0–5 (§11 #43); the Elo display stayed
10. **Sound:** music, SFX and character voices from the skin, with a volume slider for each (§4.11); converting the Pirate audio, including splitting the recorded voice lines (§5.6)
11. **Haptics:** vibration on game events on supporting phones: patterns on Android, a tick on iPhone, a Settings toggle (§4.12)
12. **Game-over overlay:** a picture, headline and reason when a game ends, from the skin's `results` pictures (§4.7.1)
13. **Splash screen:** a start screen from the skin's `splash` picture, with the title and New Game / Continue (§4.13)

**v1 is complete** (2026-10-18, §11 #45). Next, **v1.1:** many more Pirate voice lines, so each pool has more variations and repeats less often (§4.11).

## 10. Open questions

None at the moment. Remaining tuning items, such as the board inset, think-time constants and animation durations, are tracked in the milestones.

## 11. Decision log

| #   | Question                             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which pirate crew is White?          | Red = White (`rowFor: { w: 0, b: 1 }`); superseded by #32                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Status text                          | Optional skin `labels`, falling back to White/Black                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3   | Difficulty                           | Presets + **Custom** Elo slider in 50-point steps (`UCI_LimitStrength`/`UCI_Elo`); superseded by #31                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Capture indicator                    | Optional `captureIndicator`. Fallback is `moveIndicator` at `captureScale`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Animations                           | In v1: slide moves, fade captures, animated flip, reduced-motion respected                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | Hosting                              | Static build. Local preview first, then Cloudflare Pages. Single-threaded Stockfish, so no special headers                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | Classic skin                         | User will create it with the same tool as the Pirate set. A fixture skin covers tests meanwhile                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Font delivery                        | **Bundled in the skin folder** (woff2 + OFL), loaded through `FontFace`. A CDN `css` URL is allowed but not the default                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 9   | Coordinates                          | Skin font + theme colours. In the frame when inset > 0, otherwise in an outside gutter                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | Layout                               | Mobile-first single column. At the breakpoint, controls move beside the board. On narrow screens the move list is in a bottom Drawer                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11  | Breakpoints                          | Standard Tailwind v4 breakpoints, unchanged. Components use prefixes only. Side panel at `lg`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | Drawer usage                         | Only composite UI goes in a Drawer (move list on narrow screens, New Game, Settings). Simple controls stay inline                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 13  | Custom Elo floor                     | 1350 confirmed, and it is the default custom value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14  | Engine pacing                        | Complexity-based think budget with log-normal jitter, passed to the engine as `movetime` (§4.6.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 15  | Phones in landscape                  | No special handling in v1. The single-column layout applies, and users can rotate to portrait                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 16  | Difficulty personality               | Think time is scaled by the difficulty's Elo, 0.70× at 1320 to 1.20× at 3150                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 17  | Indicator rendering                  | Move and capture indicators are both drawn above the pieces with skin-set opacity. Hovering or dragging over a target raises it to `hoverOpacity` (0.85 by default)                                                                                                                                                                                                                                                                                                                                                                                     |
| 18  | Pirate capture indicator             | Crossed sabers (`-2`). Skull and flag kept as alternatives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 19  | Default skin                         | "Marble": white marble and black granite, no frame, Marcellus font                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 20  | Skin source vs served                | Source art in `scratchpad/skins/<id>/assets/` (local, not committed). Served assets and the only manifest in `static/skins/<id>/`. Conversion is a manual one-off run of `scripts/convert-skin.py`, not a build step                                                                                                                                                                                                                                                                                                                                    |
| 21  | Manifest validation                  | `manifestVersion: 1`, asset paths confined to the skin folder, optional fields filled with defaults, all errors reported with their paths (§5.1)                                                                                                                                                                                                                                                                                                                                                                                                        |
| 22  | Captured pieces & material           | Shown in the player strips: each side's captures as small skin sprites, plus `+N` for the side ahead, computed from material on the board (§4.10)                                                                                                                                                                                                                                                                                                                                                                                                       |
| 23  | Animation technique                  | FLIP slides with the Web Animations API in `Piece` (not CSS transitions), Svelte fades for captures, durations in `board/motion.ts` zeroed by `prefers-reduced-motion` (§4.5)                                                                                                                                                                                                                                                                                                                                                                           |
| 24  | Undo and game end                    | Undo rebuilds pieces by replaying from the start FEN, so ids and animations come for free. Checkmates and draws can be taken back; a resignation is final. Hot-seat auto-flip waits for the move to land (§4.7)                                                                                                                                                                                                                                                                                                                                         |
| 25  | Engine delivery                      | The lite single-threaded build is imported with Vite `?url` (hashed assets, nothing copied to `static/`) and started when a vs-Computer game begins. A `HEAD` check catches a failed download, which falls back to hot-seat. vs Computer, Undo takes back the move pair (§4.6, §4.7)                                                                                                                                                                                                                                                                    |
| 26  | Shell and drawers                    | Drawers are native modal `<dialog>`s with their own scrim and sheet. The status gets its own line under the strips rather than sitting in them, and the narrow control bar is at the bottom. Settings apply at once; difficulty can be changed mid-game vs Computer (§6.1, §6.4)                                                                                                                                                                                                                                                                        |
| 27  | Persistence                          | Two versioned localStorage keys, game and settings. The game is saved as moves and replayed, with the resigning side, setup and orientation. Bad data falls back to a new game or default settings. URL parameters start a new game instead of resuming (§4.9)                                                                                                                                                                                                                                                                                          |
| 28  | Accessibility pass                   | Arrow-key board navigation is in v1, since the single tab stop needs it. The live region names the last move. Accent focus ring everywhere. `danger` lightened for contrast. axe runs in e2e (§6.5)                                                                                                                                                                                                                                                                                                                                                     |
| 29  | Cloudflare Pages                     | No `404.html`, so Pages serves the SPA fallback. `_headers` caches hashed assets for a year. Verified with `wrangler pages dev` and the e2e suite, without adding wrangler as a dependency. Deployed by Pages' Git integration (push to `main` goes live at chess.gebrev.com) rather than direct upload, since a direct-upload project can't later switch to Git builds (§7.1)                                                                                                                                                                          |
| 30  | Disabling skins                      | Optional `"disabled": true` in `skin.json` leaves a registered skin out of the choices without code changes. The picker is hidden when only one skin is available. Marble is disabled for now, leaving Pirate as the only skin (§5.5)                                                                                                                                                                                                                                                                                                                   |
| 31  | Human-like opponent                  | Presets are target Elos 450/900/1350/1800/2250 (Custom 450–3000). Stockfish analyses at full strength and the app picks a move by cost in winning chances and salience, tuned per Elo by a calibration script against Stockfish's `UCI_Elo` and 450-point gaps. Replaces Skill Level, whose floor (~1350) was too strong for casual players (§4.6.2). Superseded by #43                                                                                                                                                                                 |
| 32  | Pirate crews by complexion           | The revised sheet gives the Blue Crew light skin, hair and beards, a white horse and a silver cannon, and the Red Crew dark ones with a black horse. So Blue = White, on the sheet's second row (`rowFor: { w: 1, b: 0 }`); the sheet's rows can be in either order. The new sheet packs sprites so tightly that their boxes overlap, so the converter now cuts sprites out by their outlines (§5.6)                                                                                                                                                    |
| 33  | Sound                                | Skin-supplied music, SFX and character voices, each with a 0–1 volume slider (0 = off; defaults 0.5, 0.8, 1). Music is shuffled per session and loops. A move is voiced from the side of the player who made it: a player's capture can get the captured piece's answer (half as often), the computer's own moves stay silent except for occasional taunts, and its captures get your piece's reaction. No taunts in hot-seat. Recorded voice lines are split at cut points found once with Whisper and a script CSV. Haptics move to M11 (§4.11, §5.6) |
| 34  | Mute toggles, speech bubbles         | A mute toggle beside each volume slider, restoring the last level above 0. A speech bubble from the skin's emote sheet over a piece while it speaks, so a taunt can be placed; Pirate shows them for taunts. For now every voice chance is 1, to check the cooldowns and capture answers by ear (§4.11)                                                                                                                                                                                                                                                 |
| 35  | No answer to a capture, UI click     | The captured piece no longer answers a player's capture: it played after the piece had gone, and didn't flow. Your piece still reacts when the computer takes it. Buttons, links, chips and toggles play a skin `click` SFX (§4.11)                                                                                                                                                                                                                                                                                                                     |
| 36  | No voice cooldown                    | The 3 s cooldown between lines is gone: moves alternate, so any move may speak, and a newer line cuts off one still playing. Taunts still come at most every 30 s (§4.11)                                                                                                                                                                                                                                                                                                                                                                               |
| 37  | Overlapping lines                    | Voice lines play to their end and overlap rather than a newer one cutting off an older one; a bubble stays until its line ends unless its speaker moves or is taken (§4.11)                                                                                                                                                                                                                                                                                                                                                                             |
| 38  | Every line always                    | Every voice chance is 1: each move gets its line, which played better than lines by chance. Taunts stay at most one per 30 s. More lines per pool are coming, to keep it from repeating (§4.11)                                                                                                                                                                                                                                                                                                                                                         |
| 39  | Haptics                              | Vibration on the same events as the SFX, driven from the same place. Android plays patterns through the Vibration API; iPhone, with none, gets one tick from toggling a hidden iOS switch, only during a tap. A Vibration toggle in Settings where it works (§4.12)                                                                                                                                                                                                                                                                                     |
| 40  | Longer vibrations                    | Patterns lengthened 2–4× (taps 30 ms, a move 60 ms, a capture 110 ms, up to 400 ms for checkmate) after the first ones were too faint to feel on an Android phone (§4.12)                                                                                                                                                                                                                                                                                                                                                                               |
| 41  | Name and credits                     | Called Vibe Chess. A Credits drawer, opened from an ⓘ button in the header, links to the people, tools and libraries behind the game (§6.3)                                                                                                                                                                                                                                                                                                                                                                                                             |
| 42  | App icons                            | A purple-to-pink gradient with a white pawn: SVG, ICO and PNG favicons, an Apple touch icon, and a web manifest (192/512 px and a maskable icon, standalone display, theme colour `#7C3AED`). Served from `static/`, with sources in `scratchpad/` (§7.2)                                                                                                                                                                                                                                                                                               |
| 43  | Skill Level presets                  | Six presets on Stockfish `Skill Level` 0–5 (about 1320, 1444, 1566, 1729, 1953 and 2197 Elo, from Stockfish's own Elo↔level formula), Custom `UCI_Elo` 1350–3150, default the weakest. Replaces the human-like opponent (#31), whose mistakes felt unnatural (hanging pieces, aimless openings, unconverted endgames). Nothing plays below ~1320 (§4.6)                                                                                                                                                                                                 |
| 44  | Game-over overlay                    | A modal over the screen when a game ends in play, after a 1 s pause: a big picture, a headline from the player's side (Victory!/Defeat/Draw, or the winner in hot-seat), the reason, New game and View board. The inline result stays. Pictures come from an optional skin `results` block, in the winning side's colours, so Pirate's flag and skull match the crews; resignation gets its own (a white flag) and draws a neutral one. Replaces "no modal" for game over (§4.7.1)                                                                      |
| 45  | v1 complete                          | v1 is called done on 2026-10-18, at the end of the weekend it was built in. The README introduces Vibe Chess as that weekend project and lists the credits. More Pirate voice lines are planned for v1.1 (§9)                                                                                                                                                                                                                                                                                                                                           |
| 46  | iOS audio unlock                     | Checked in WebKit (Playwright, iPhone 13 emulation): audio also unlocks on `pointerup` and `touchend`, since a touch's `pointerdown` isn't a user gesture and iOS won't start audio from it, and resumes from iOS's `interrupted` state. A sound's lateness counts from when the audio context is running, so a new context's start-up (about 270 ms in WebKit) no longer drops the first tap's `select` (§4.11)                                                                                                                                        |
| 47  | Splash screen                        | A start screen from an optional skin `splash` picture, with the title set in the skin's font over an area the manifest gives (so the art carries an empty banner rather than baked-in text), and New Game / Continue over the bottom of the picture (under it below `sm`). Shown on every start, but not for a link that sets up the game, so links and the e2e tests go straight in. Continue needs a game in progress, and Esc acts like it (§4.13)                                                                                                   |
| 48  | Loss pictures in the loser's colours | A loss or resignation picture is now the loser's: they are the skull (or raise the white flag), so vs the computer a loss shows the player's own crew. A win stays in the winner's colours. Replaces the winner's colours for losses in #44 (§4.7.1)                                                                                                                                                                                                                                                                                                    |
| 49  | UI scale on big screens              | At 100% zoom on a desktop the UI looked small; 150% zoom looked right. The root font size now scales with the viewport, up to 1.5×, as far as the desktop layout still fits at 1024×576 in scaled pixels, rather than a fixed 1.5× (which would squeeze a 1280-wide window) or browser zoom (which also moves the breakpoints) (§6.0)                                                                                                                                                                                                                   |
| 50  | Portrait splash                      | Phones get a portrait splash picture (`splash.portrait`) below `md`, with its own title area and button height, and the buttons on it rather than under it; the landscape one is for `md` and up, phones held sideways included. A `<picture>` element, so each screen downloads one (§4.13)                                                                                                                                                                                                                                                            |
| 51  | Taunts answer your move              | The computer taunted after its own moves, which could sound like it taunting itself. A taunt now answers a quiet move of yours vs Computer, in place of your piece's line, still at most one per 30 s; the computer's quiet moves are silent (§4.11)                                                                                                                                                                                                                                                                                                    |
| 52  | Taller drawers                       | Drawers were capped at 70 dvh, so Settings scrolled on a 384×700 phone with room to spare above it. The cap is now the screen's height less 4 rem (§6.4)                                                                                                                                                                                                                                                                                                                                                                                                |
| 53  | Link previews                        | Shared links showed no picture or description. `app.html` now has Open Graph and Twitter card tags with a 1200×630 picture; static, since crawlers don't run the SPA (§7.1)                                                                                                                                                                                                                                                                                                                                                                             |
| 54  | Code review cleanup                  | Every voice line always plays: the chance machinery (`ODDS`, `TUNED_ODDS`) is gone, and repetition is answered with more variations per pool in the skin. Alongside: dead code removed (`BoardPiece.leaving`, `difficultyName`, `Playlist.current`, the `#lib` index), one set of piece types (chess.js's), shared helpers for colours and orientation, sprite-sheet cells, JSON guards, modal dialogs and test setup, and test-only code in `lib/testing/` (§4.11, §7.2, §7.3)                                                                         |
| 55  | Code review, round 2                 | Skin asset paths are resolved to absolute URLs once, during validation, so a loaded skin is just its manifest (the `LoadedSkin` wrapper and its `urls` copy are gone). Buttons share their colours (`components/styles.ts`), and `Game` saves its own move history and finds kings. Dead code removed: unused search statistics, an unread error field, a duplicate icon, redundant cursor rules (§5.1, §5.5, §7.2, §7.3)                                                                                                                               |
| 56  | Code review, round 3                 | Fixed lists (SFX names, voice events, promotion pieces) are `as const` arrays with their types derived from them, so the two can't drift. Shared: the skin validator's unknown-key check, a `cssUrl()` for skin images in CSS, the splash's `md` media query, legend and slider styles, the start position in tests (chess.js's) and an alpha mask in the converter. Dead code removed: a CSS rule that did nothing, a repeated page title, unused converter options (§5.1, §5.6, §7.2)                                                                 |
| 57  | Code review, round 4                 | The option chips (skin, opponent, colour, difficulty) are one `Choices` component instead of four copies of the same markup. Shared: a `clamp()` (five copies), grouping captured pieces by type (the player strip and its text equivalent each did it), the dev and preview servers' network options, and small test helpers. Dead code removed: twelve `data-` attributes nothing read, a clamp on a sum that can't leave 0..1, a test option with no effect (§4.6.1, §7.2)                                                                           |
| 58  | Code review, round 5                 | Captures are read from chess.js's `captured` everywhere (it covers en passant), and piece tracking uses `Move`'s descriptor methods instead of its deprecated `flags`. The mixer is the one place volumes are kept, `Game.resign` takes the resigning side, and the e2e tests share a `play()` helper. Dead code removed: an anchor field superseded by the per-type anchors, and an unused move type (§4.3)                                                                                                                                            |
| 59  | Volume samples                       | Setting the Effects or Voices volume plays a sample of it (the move sound, a random line), so the level can be heard; a double-click resets a slider to its default. Alongside, from a review: the default volumes are one constant, and a cursor rule for `role="button"`, which nothing has, is gone (§4.11)                                                                                                                                                                                                                                          |
