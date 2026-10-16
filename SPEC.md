# Chess — Product & Technical Spec (Draft 3)

_Status: ready for implementation · 2026-10-16 · Draft 3 incorporates decisions from three review rounds (see §11)._

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

Online multiplayer, accounts, ratings, time controls/clocks, opening books, analysis mode, PGN import, puzzles, sound, native app packaging.

## 3. Game modes

| Mode                       | Description                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **vs Computer** (default)  | The player picks White, Black or Random, and a difficulty. Stockfish plays the other side. The board is oriented to the player's colour at the start. |
| **Two players (hot-seat)** | Both sides move on one device. An optional **auto-flip** setting turns the board to the side to move after each move.                                 |

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

### 4.3 Move guidance

- When a piece is selected, an indicator is drawn on every legal destination square:
  - **Quiet move:** `moveIndicator` image.
  - **Capture:** the `captureIndicator` image if the skin provides one. Otherwise the `moveIndicator` is drawn at `moveIndicator.captureScale`, which is upscaled so it frames the target piece. En passant counts as a capture, and its indicator is drawn on the destination square.
- All indicators are drawn in one layer **above the pieces**, with skin-defined **opacity**, so neither the square nor the piece underneath is fully hidden.
- Defaults are `opacity` 0.75 for moves and 0.6 for captures; skins can override both.
- When the pointer hovers over a target, or a dragged piece is over one, that indicator goes to full opacity, giving feedback on where the piece will land.
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

- Each piece is rendered absolutely positioned within the board grid, using `transform: translate(x%, y%)`. A change of square becomes a CSS transition (`--anim-move-ms`, default 200 ms, ease-out).
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

### 4.6 Computer opponent (Stockfish)

- Stockfish runs as WASM inside a dedicated **Web Worker** and communicates over **UCI**, the standard chess-engine protocol.
- **Difficulty:** the player either picks a preset or chooses **Custom** and sets an Elo:

  | Preset     | UCI config                              |
  | ---------- | --------------------------------------- |
  | Cabin Boy  | `Skill Level 0`                         |
  | Deckhand   | `Skill Level 5`                         |
  | Bosun      | `Skill Level 10`                        |
  | First Mate | `Skill Level 15`                        |
  | Captain    | `Skill Level 20`                        |
  | **Custom** | `UCI_LimitStrength true`, `UCI_Elo <n>` |

  The search time for every difficulty comes from the think-time model in §4.6.1.

  - The **Custom slider** has a **step of 50 Elo** and runs from **1350 to 3150**. These are the multiples of 50 inside Stockfish's supported `UCI_Elo` range of 1320–3190; read the exact range from the engine's `option name UCI_Elo … min … max` line at init and clamp to it.
  - The default custom value is **1350**, and it is also the slider's lower bound. The UI shows a note that this is a solid club player, and points beginners to the presets.
  - Switching to a preset sends `UCI_LimitStrength false`. Switching back to Custom sets it to `true`.
  - Preset names and descriptions can be overridden by the skin (`labels.difficulty`). The fallbacks are generic names: Beginner / Easy / Medium / Hard / Max.

- Engine flow:
  1. On init, send `uci`, wait for `uciok`, and record option ranges.
  2. Send `isready`, wait for `readyok`, then apply options.
  3. On the engine's turn, compute a think budget `T` (§4.6.1), then send `position fen <fen>` → `go movetime T`.
  4. Parse `bestmove e7e8q`. If it arrived before `T` elapsed (this can happen with mates or forced lines), wait out the remainder. Then apply the move through chess.js. The move animates.
- **Stale replies:** a new game, an undo or a mode change sends `stop`. Every request carries a sequence id, and a `bestmove` for an outdated id is discarded.
- **Load failure:** the app shows an error and falls back to hot-seat mode.

#### 4.6.1 Think time ("organic" pacing)

**How fast is Stockfish here?** The single-threaded WASM build searches very roughly 0.3–1M nodes/s on a desktop and a few times slower on a phone. Even 100 ms reaches a search depth far beyond what a 1350–2000 Elo opponent needs. Playing strength comes from `Skill Level` / `UCI_Elo`, not from thinking time. On its own the engine would answer almost instantly, so the delay is effectively all presentation.

**Approach:** the pause is not artificial. The budget `T` is handed to the engine as `go movetime T`, so it searches for exactly the time the player sees it "thinking". Only one timer is needed, and longer thinks in complex positions cost nothing.

`T` is computed from a cheap complexity estimate of the position. It uses chess.js only, with no engine round-trip.

```
if only one legal move:          T = rand(350, 600) ms          // forced: answer quickly
else if ply < 8:                 T = rand(400, 900) ms          // opening: "book-like" speed
else:
  c = clamp01(                                             // complexity 0..1
        0.40 · min(legalMoves / 40, 1)                     // breadth
      + 0.30 · min(capturesAvailable / 6, 1)               // tactical tension
      + 0.15 · (inCheck || checksAvailable > 0 ? 1 : 0)    // forcing lines
      + 0.15 · min(nonPawnPieces / 10, 1)                  // middlegame vs endgame
      )
  if obviousRecapture: c *= 0.5     // opponent just captured and we can take back on that square
  T = lerp(600, 3000, c) · jitter   // jitter = log-normal, σ ≈ 0.25 (median 1.0)

T = clamp(T · personality, 500, 4500)   // applied to every branch above
```

**Difficulty personality:** stronger opponents take a little longer on average. This is a pure presentation touch, because strength still comes from `Skill Level` / `UCI_Elo`.

| Difficulty      | `personality`                                    |
| --------------- | ------------------------------------------------ |
| Cabin Boy (p0)  | 0.70                                             |
| Deckhand (p1)   | 0.80                                             |
| Bosun (p2)      | 0.90                                             |
| First Mate (p3) | 1.00                                             |
| Captain (p4)    | 1.15                                             |
| Custom Elo      | linear from **0.85 at 1350** to **1.20 at 3150** |

- All constants live in `engine/thinkTime.ts`, so they can be tuned by feel.
- During milestone M6, log nodes/s and depth from the engine's `info` lines on a desktop and a phone, to confirm the budgets are comfortably above what each difficulty needs.
- A settings toggle could add a **"Fast engine"** option that caps `T` at 300 ms. This is a stretch goal.
- **Possible v2:** use the engine's own signal for complexity, i.e. how much the best move and its score change between search depths in the `info` output. A position where the engine keeps changing its mind is "hard". This needs a short probe search first, so it is deferred.

- **Bundle:** the `stockfish` npm package, using its single-threaded "lite" WASM build (≈7 MB). It is lazy-loaded the first time a vs-Computer game starts, so hot-seat play and first paint stay light. Files are copied to `static/stockfish/` at build time. This stays within Cloudflare Pages' 25 MiB per-file limit.

### 4.7 Game controls

- New game (opens a dialog: mode, colour, difficulty)
- Undo. In vs-Computer mode this takes back the full move pair.
- Flip board
- Resign
- Move list: SAN in numbered pairs, current move highlighted, auto-scrolled to the end
- Status line: whose turn it is, check, game result, engine thinking
- Settings: skin, show legal moves, show coordinates, auto-flip (hot-seat only), difficulty

### 4.8 Side labels & status text

- Status strings use side labels from `skin.labels.white` / `skin.labels.black`. Fallbacks are **"White"** / **"Black"**.
- Message templates are fixed in code. The labels are substituted into them:
  - `"{side} to move"`
  - `"{side} is in check"`
  - `"Checkmate — {side} wins"`
  - `"Stalemate — draw"`
  - …and so on.

  Skins provide names, not sentences. That keeps grammar sane and leaves room for i18n later.

- The Pirate skin sets `"Red Crew"` / `"Blue Crew"`, giving for example "Red Crew to move".

### 4.9 Persistence

- `localStorage` holds:
  - the current game: start FEN, move list, mode, human colour, difficulty;
  - settings: skin, toggles, last difficulty.
- On reload the game is rebuilt by replaying the moves, so undo history survives. Every read and write is wrapped in try/catch, and the app works without storage.

## 5. Skin system

### 5.1 Skin manifest

Each skin is a folder at `static/skins/<id>/` holding a `skin.json` manifest and its assets. Paths in the manifest are relative to the skin folder.

```jsonc
{
	"manifestVersion": 1, // required; bumped on incompatible format changes
	"id": "pirate", // must match the folder name
	"name": "Pirate",

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
		"rowFor": { "w": 0, "b": 1 }, // sheet row per side
		"scale": 0.95, // sprite size relative to a square
		"anchorY": 0.02, // lift from the square bottom
		"anchorYFor": { "p": 0.1 } // optional per-type override (short pawns sit too low on the shared baseline)
	},

	"moveIndicator": {
		"image": "indicator-move.webp",
		"scale": 0.8, // relative to a square
		"opacity": 0.75,
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
		"danger": "#b3261e",
		"highlightSelected": "rgba(217,164,65,0.45)",
		"highlightLastMove": "rgba(240,200,90,0.30)",
		"highlightCheck": "rgba(200,30,30,0.55)",
		"coordText": "#f3e2b8",
		"coordShadow": "0 1px 2px rgba(0,0,0,0.8)",
		"pieceShadow": "drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0.25cqw 0.8cqw 1cqw rgba(0,0,0,0.55))", // CSS filter: outline + diffuse shadow (cqw = 1% of board width)
		"pieceShadowBlack": "drop-shadow(0 0 1px rgba(255,255,255,0.8)) …", // optional per-side override (also pieceShadowWhite)
		"dragShadow": "0 8px 16px rgba(0,0,0,0.5)",
		"scrim": "rgba(0,0,0,0.55)" // drawer / dialog backdrop
	},

	// Optional flavour text. Every key falls back to a default.
	"labels": {
		"white": "Red Crew",
		"black": "Blue Crew",
		"difficulty": {
			"p0": "Cabin Boy",
			"p1": "Deckhand",
			"p2": "Bosun",
			"p3": "First Mate",
			"p4": "Captain"
		}
	}
}
```

Validation rules (`src/lib/skins/schema.ts`):

- Every problem is reported with its JSON path (e.g. `pieces.order: expected each of …`), so a broken manifest can be fixed in one pass.
- Asset paths must be relative paths inside the skin folder with an extension: no leading `/`, no scheme, no `..`.
- `board.inset` sides are fractions in [0, 0.45]. `pieces.order` must list each of `k q b n r p` exactly once. `pieces.rowFor` rows must exist in the sheet.
- Optional fields get defaults: `pieces.scale` 1, `pieces.anchorY` 0, `pieces.anchorYFor` each type at `anchorY`, indicator `scale` 1, `moveIndicator.opacity` 0.75, `moveIndicator.captureScale` 1.1, `captureIndicator.opacity` 0.6, font file `weight` 400 and `style` normal, `font.fallback` serif, `coordinates.fontScale` 0.55, `coordinates.gutter` 0.35, `theme.coordShadow` none, `theme.pieceShadow` a firm dark outline plus a soft drop shadow, `theme.pieceShadowWhite`/`pieceShadowBlack` the value of `pieceShadow`, `labels` empty. Every other `theme` key is required.

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
- **Piece contrast:** every sprite gets `filter: var(--piece-shadow-white|black)` (`theme.pieceShadowWhite`/`pieceShadowBlack`, defaulting to `theme.pieceShadow`). `drop-shadow()` follows the sprite's alpha, so stacking a 0-offset 1 px shadow (outline) with a soft offset one (depth) gives an antialiased edge. Stacked filters compound, so two 1 px outlines read firmer than one. Dark pieces on dark squares need a **light** rim instead (Marble's `pieceShadowBlack`), which is why the shadow can differ per side.
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
- `loader.ts` fetches, validates and preloads (steps 1–3). The store in `skin.svelte.ts` applies and swaps (steps 4–5), and a newer load supersedes one still in flight.
- Loading a skin means:
  1. fetch `skin.json`
  2. validate it (a hand-written type guard is enough; zod is optional)
  3. preload all images and fonts in parallel
  4. apply the CSS variables
  5. swap the skin
- If a manifest is invalid, the app logs the specific errors and stays on the current skin.
- **Skins in v1:** Marble (`default`, the default skin) and Pirate. The skin-system component tests use a small **fixture skin** in `tests/fixtures/skins/test/` (tiny generated images, inset 0, no capture indicator, no labels) so the frameless, coordinate-gutter and default-filling paths are covered independently of the real art. `tests/fixtures/skins/invalid/` covers the "stay on the current skin" path.

### 5.6 Skin assets: source art vs served files

- **Source art** lives in `scratchpad/skins/<id>/assets/`, as the original PNG and TTF files: `board.png`, `pieces.png`, `indicator-move.png`, an optional `indicator-capture.png`, and `font/*.ttf` + `OFL.txt`. It is kept locally for re-exports, is not served, and is not committed (`scratchpad/` is excluded via `.git/info/exclude`).
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
  - `font/*.woff2` and `font/OFL.txt`

  It never writes `skin.json`.

- **Piece-sheet normalisation** (part of the conversion):
  - It finds sprites by transparent gaps: first the gap between the 2 rows, then the gaps between the 6 sprites in each row.
  - It crops each sprite to its alpha bounding box.
  - It repacks them into a clean 6 × 2 grid of 320 px square cells. Each sprite sits on a common baseline and is centred horizontally **on its base** (the median centre of its bottom 15%), not its bounding box, so pieces holding a sword or flag out to one side still stand in the middle of the square. All sprites share **one** scale factor, so relative piece heights are preserved.
  - The script stops with an error if it doesn't find exactly 12 sprites.
- **Board grid fitting** (framed boards, i.e. inset > 0): the app places pieces on an even 8 × 8 grid inside the inset, but hand-drawn boards drift. The converter finds each inner square edge as the darkest line within 18% of a square of its even-grid position, prints the offsets, and resamples the image piecewise-linearly so the edges land on the even grid. Pirate's lines were off by up to 4 px (≈3% of a square), which together with bounding-box centring made pieces on files a–d look visibly left of centre.
- **Sprite authoring rule:** sprites only have to appear in the manifest's `order`, in two rows, separated by transparent space. They do not have to sit exactly on a grid. Neither original sheet was grid-aligned:
  - Pirate's spyglass, pointing hand and flag reached 6–23 px into the next cell.
  - Marble used a ≈288 px pitch, and its white bases crossed the row boundary.
- **Output sizes (2026-10-16 conversion):** Pirate ≈640 KB and Marble ≈430 KB in total, down from ≈9 MB of source PNGs. Indicators are 320 px and boards keep their native 1254 px.

## 6. Layout (mobile-first)

### 6.0 Breakpoints & styling

- **Tailwind CSS v4** with its **standard breakpoints**, left unchanged: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Components only use breakpoint prefixes (`lg:flex-row`, `lg:hidden`, …). No component contains a pixel value for a breakpoint or a custom media query.
- The layout switches from single-column to **board + side panel at `lg`**. Below that, including tablets in portrait, the board takes the full width.
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
│ ☠ Title          ⚙       │  header (compact)
├──────────────────────────┤
│ ● Blue Crew (Captain)    │  opponent strip: side, engine/diff, thinking dots
├──────────────────────────┤
│                          │
│          BOARD           │  width = 100vw − 2×16px gutter,
│   (coords in frame or    │  capped so the page fits without scrolling
│    gutter, see §4.4)     │
│                          │
├──────────────────────────┤
│ ● Red Crew — to move     │  player strip + status
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
- The last move in SAN is also shown in the status strip, so the drawer is optional during play.
- **Game over:** the result and a "New game" button replace the player-strip status inline. No modal is used.
- **Resign** (⚑) sits in the control bar. Its confirmation is an inline two-tap ("Resign?" ✓/✕) rather than a dialog.

### 6.2 Wide layout (`lg` and up): board + side panel

```
┌──────────────────────────────────────────────────┐
│ ☠ Title                                   ⚙      │
├───────────────────────────────┬──────────────────┤
│ ● Blue Crew (Captain)         │ Status           │
│                               │ ──────────────── │
│            BOARD              │ Moves            │
│                               │ 1. e4   e5       │
│                               │ 2. Nf3  Nc6      │
│ ● Red Crew                    │ ──────────────── │
│                               │ [New] [Undo]     │
│                               │ [Flip] [Resign]  │
└───────────────────────────────┴──────────────────┘
```

- At `lg`, the controls and move list move from under the board into a side panel (≈ 320 px) next to it. The move list renders inline in the panel, not in the drawer, and the ☰ button is hidden (`lg:hidden`).
- Board size is `min(100dvh − header − 32px, 100vw − panel − 48px)`.

### 6.3 What goes where

**Principle:** simple controls fit into the main layout. A **composite** UI goes in a **Drawer** on narrow screens; a composite is a group of related inputs or content that doesn't fit the main column.

| UI                                                     | Narrow (below `lg`)  | Wide (`lg` and up)                  |
| ------------------------------------------------------ | -------------------- | ----------------------------------- |
| New / Undo / Flip / Resign                             | Control bar          | Side panel                          |
| Status, check, result, engine thinking                 | Player strips        | Player strips + side panel          |
| Move list                                              | **Drawer** (☰)      | Inline in side panel                |
| New Game setup (mode, colour, difficulty + Elo slider) | **Drawer**           | Drawer (opened from the side panel) |
| Settings (skin, guidance, coordinates, auto-flip)      | **Drawer** (⚙)       | Drawer                              |
| Promotion picker                                       | Overlay on the board | Overlay on the board                |
| Resign confirm, game-over                              | Inline               | Inline                              |

On wide screens, New Game and Settings could be shown as a centred dialog instead. The plan uses the same `Drawer` component everywhere for v1: one component, one behaviour, less to test. On `lg` the drawer can open as a side sheet from the right instead of a bottom sheet, through a `side` prop.

### 6.4 Drawer component

- `Drawer.svelte` is a generic sheet with a backdrop (`--scrim`). It comes up from the bottom on narrow screens and in from the right at `lg`.
- **Open:** a slide-up transition (respects reduced motion).
- **Close:** tap the backdrop, swipe down on the handle, press `Esc`, or use the close button.
- While open, focus is trapped and the background is `inert`. Focus returns to the trigger on close.
- Height is content-sized, capped at 70 dvh, with internal scroll.

### 6.5 Input & accessibility

- Keyboard: `F` flips the board, `Ctrl/Cmd+Z` undoes, `Esc` deselects, closes the picker or closes the drawer.
- Each square is a button with an `aria-label` (e.g. "e4, Red Crew pawn"). A visible focus ring is drawn from `--accent`.
- Status changes are announced through an `aria-live="polite"` region.
- Arrow-key square navigation is a stretch goal.

## 7. Architecture

### 7.1 Stack

- **SvelteKit** with **Svelte 5** (runes), **TypeScript**, **Vite**
- **@sveltejs/adapter-static** (SPA mode, `fallback: 'index.html'`). It runs locally with `vite preview` or any static server, and deploys to **Cloudflare Pages** as plain static output with no special headers or functions.
- `ssr = false` on the game route, because the chess state, engine, `localStorage` and `FontFace` are all browser-only.
- **Tailwind CSS v4** (`@tailwindcss/vite`), standard breakpoints, skin tokens mapped through `@theme inline` (§6.0)
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
      game.svelte.ts        # Game class: wraps chess.js; $state fen/history/selection
      pieces.ts             # stable piece-id reconciliation for animation
      types.ts
    board/
      geometry.ts           # square↔grid per orientation, sprite offsets, coordinate labels
    engine/
      engine.ts             # Promise-based UCI client (init, setOptions, bestMove, stop)
      uci.ts                # UCI line parsing
      difficulty.ts         # presets + custom Elo config
      thinkTime.ts          # complexity estimate → think budget (§4.6.1)
    skins/
      index.ts              # registry
      schema.ts             # Skin type + validation
      loader.ts             # fetch, validate, preload images + FontFace, CSS vars
      skin.svelte.ts        # active skin store: apply + swap
    components/
      Board.svelte          # grid, layers, orientation, pointer handling
      Piece.svelte          # sprite + transform/transition
      Highlights.svelte
      Indicators.svelte     # move + capture indicators
      Coordinates.svelte    # in-frame or gutter labels
      PromotionPicker.svelte
      PlayerStrip.svelte
      StatusBar.svelte
      MoveList.svelte
      Controls.svelte
      Drawer.svelte
      NewGameDialog.svelte  # incl. difficulty presets + Elo slider
      SettingsPanel.svelte
    labels.ts               # status templates + label fallbacks
    persistence.ts
static/
  skins/
    default/ pirate/        # skin.json, board.webp, pieces.webp, indicator-*.webp, font/…
  stockfish/                # copied from node_modules at build
tests/
  fixtures/skins/test/      # fixture skin (inset 0)
  fixtures/skins/invalid/   # deliberately broken manifest
```

### 7.3 State model

```ts
type Color = 'w' | 'b';
type Mode = 'computer' | 'hotseat';

type Difficulty =
	{ kind: 'preset'; id: 'p0' | 'p1' | 'p2' | 'p3' | 'p4' } | { kind: 'custom'; elo: number }; // multiple of 50, clamped to engine range

interface GameState {
	startFen: string;
	moves: { san: string; from: Square; to: Square; promotion?: PieceType }[];
	mode: Mode;
	humanColor: Color; // computer mode only
	difficulty: Difficulty;
	result: null | { winner: Color | 'draw'; reason: EndReason };
}

interface BoardPiece {
	// render model, for animation
	id: string; // stable across moves
	color: Color;
	type: PieceType;
	square: Square;
	leaving?: boolean; // captured, fading out
}

interface UiState {
	orientation: 'white' | 'black';
	selected: Square | null;
	legalTargets: { square: Square; capture: boolean }[];
	dragging: { id: string; x: number; y: number } | null;
	pendingPromotion: { from: Square; to: Square } | null;
	engineThinking: boolean;
	drawerOpen: boolean;
}

interface Settings {
	skinId: string;
	showLegalMoves: boolean;
	showCoordinates: boolean;
	autoFlip: boolean;
	lastDifficulty: Difficulty;
}
```

The `Game` class owns the chess.js instance and exposes `$state`/`$derived` fields. Components never touch chess.js directly.

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
- UCI parsing: `bestmove`, promotion suffix, `option … UCI_Elo min/max`
- Difficulty: Elo snapping to 50 and clamping to the engine range
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
- Persistence round-trip (replay restores undo history)

**E2E (Playwright, run at both 390×844 and 1280×800)**

- Scholar's mate in hot-seat mode: the game ends with a checkmate status
- Promotion flow shows the picker, and the chosen piece appears on the board
- Flip: after flipping, h8 is at the bottom-left, and the coordinate labels mirror
- vs Computer: after the human's first move, the engine replies within 5 s
- Custom Elo: the slider moves in steps of 50
- Narrow viewport (390 px): the move list opens in a drawer and closes with Esc. Wide viewport (1280 px, i.e. `lg` and up): the move list is inline and there is no ☰ button.

**Acceptance checklist (v1 done)**

- [ ] A full game can be played to checkmate against Stockfish at every preset and at custom Elo
- [ ] Castling, en passant and promotion all work through both click and drag, with correct animations
- [ ] The board flips correctly (and animates) at any point
- [ ] With guidance on, indicators exactly match chess.js legal moves, and captures use the capture indicator or the fallback
- [ ] Coordinates render in the frame on Pirate and in the gutter on the fixture skin, in the skin font
- [ ] Status text uses skin labels, with "White"/"Black" fallbacks
- [ ] Reloading resumes the in-progress game
- [ ] Fully playable on a 360 px-wide phone in portrait with no page scroll
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
5. **Game flow:** status and labels, move list, game-over, undo, new game, hot-seat mode, auto-flip
6. **Engine:** lazy-loaded worker, UCI client, presets and custom Elo slider, think-time model and measuring nodes/s, vs-Computer mode
7. **Layout:** mobile-first shell, the `lg` side panel, Drawer (move list, New Game, Settings)
8. **Polish:** persistence, a11y pass, E2E suite, Cloudflare Pages deploy check

## 10. Open questions

None at the moment. Remaining tuning items, such as the board inset, think-time constants and animation durations, are tracked in the milestones.

## 11. Decision log

| #   | Question                    | Decision                                                                                                                                                                                                             |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which pirate crew is White? | Red = White (`rowFor: { w: 0, b: 1 }`)                                                                                                                                                                               |
| 2   | Status text                 | Optional skin `labels`, falling back to White/Black                                                                                                                                                                  |
| 3   | Difficulty                  | Presets + **Custom** Elo slider in 50-point steps (`UCI_LimitStrength`/`UCI_Elo`)                                                                                                                                    |
| 4   | Capture indicator           | Optional `captureIndicator`. Fallback is `moveIndicator` at `captureScale`                                                                                                                                           |
| 5   | Animations                  | In v1: slide moves, fade captures, animated flip, reduced-motion respected                                                                                                                                           |
| 6   | Hosting                     | Static build. Local preview first, then Cloudflare Pages. Single-threaded Stockfish, so no special headers                                                                                                           |
| 7   | Classic skin                | User will create it with the same tool as the Pirate set. A fixture skin covers tests meanwhile                                                                                                                      |
| 8   | Font delivery               | **Bundled in the skin folder** (woff2 + OFL), loaded through `FontFace`. A CDN `css` URL is allowed but not the default                                                                                              |
| 9   | Coordinates                 | Skin font + theme colours. In the frame when inset > 0, otherwise in an outside gutter                                                                                                                               |
| 10  | Layout                      | Mobile-first single column. At the breakpoint, controls move beside the board. On narrow screens the move list is in a bottom Drawer                                                                                 |
| 11  | Breakpoints                 | Standard Tailwind v4 breakpoints, unchanged. Components use prefixes only. Side panel at `lg`                                                                                                                        |
| 12  | Drawer usage                | Only composite UI goes in a Drawer (move list on narrow screens, New Game, Settings). Simple controls stay inline                                                                                                    |
| 13  | Custom Elo floor            | 1350 confirmed, and it is the default custom value                                                                                                                                                                   |
| 14  | Engine pacing               | Complexity-based think budget with log-normal jitter, passed to the engine as `movetime` (§4.6.1)                                                                                                                    |
| 15  | Phones in landscape         | No special handling in v1. The single-column layout applies, and users can rotate to portrait                                                                                                                        |
| 16  | Difficulty personality      | Think time is scaled per difficulty (0.70× Cabin Boy → 1.15× Captain; custom 0.85×–1.20× by Elo)                                                                                                                     |
| 17  | Indicator rendering         | Move and capture indicators are both drawn above the pieces with skin-set opacity. Hovering or dragging over a target shows it at full opacity                                                                       |
| 18  | Pirate capture indicator    | Crossed sabers (`-2`). Skull and flag kept as alternatives                                                                                                                                                           |
| 19  | Default skin                | "Marble": white marble and black granite, no frame, Marcellus font                                                                                                                                                   |
| 20  | Skin source vs served       | Source art in `scratchpad/skins/<id>/assets/` (local, not committed). Served assets and the only manifest in `static/skins/<id>/`. Conversion is a manual one-off run of `scripts/convert-skin.py`, not a build step |
| 21  | Manifest validation         | `manifestVersion: 1`, asset paths confined to the skin folder, optional fields filled with defaults, all errors reported with their paths (§5.1)                                                                     |
