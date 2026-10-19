# Code review refactor: plan and progress

Branch `refactor/code-review`. Goal: remove dead code, simplify, and consolidate duplication into
shared helpers, keeping behaviour unchanged (except removing the voice-line odds, decided below).
Each phase ends with `npm run check`, `npm run lint` and the unit tests passing; e2e at the end.

## Decisions

- **Voice-line odds removed.** Every voice line always plays; repetition is solved by adding more
  variations per piece, not by chance. `Odds`, `ODDS`, `TUNED_ODDS` and the chance rolls go;
  taunts keep their 30 s wait. SPEC §4.11 updated.

## Phase 1: dead code and lint

- [x] Drop `BoardPiece.leaving` (never set) and its filter in `+page.svelte`
- [x] Drop `src/lib/index.ts` and the `#lib` import entry
- [x] Drop `difficultyName()`, `Playlist.current`
- [x] `Engine.#collect` → `#waitFor` (collected lines were unused)
- [x] Drop `src/lib/server/**` exclude (vite) and the empty eslint override block
- [x] Drop the unreachable `..` check in `isSkinPath`
- [x] Drop `void game` from Board's drag-cancel effect
- [x] Drop `MoveList`'s `class` prop
- [x] Remove the voice-line odds machinery (see Decisions)
- [x] Ignore the local `brag-output*/` in prettier/eslint so `npm run lint` passes

## Phase 2: types and helpers

- [x] One set of piece types: chess.js `Color`/`PieceSymbol` everywhere (drop schema's `Color`/`PieceType`)
- [x] `game/color.ts`: `other()`; `orientationOf`/`bottomSide`/`flipped` in `board/geometry.ts`; replace the ~10 inline flips
- [x] `geometry.sheetPosition()` shared by sprites and speech bubbles
- [x] voices.ts: king/piece lookups through chess.js, drop the hand-written FEN parser
- [x] thinkTime: ply from chess.js instead of re-parsing the FEN
- [x] One `isObj` (`src/lib/json.ts`, shared by schema and persistence)
- [x] Preset ids from `difficulty.ts` in the schema (`Labels`, validation)
- [x] `CATEGORIES` constant for sound categories; `Volumes` imported from one place
- [x] Inset parsing helper in schema (board inset, splash title inset)
- [x] `DEFAULT_SETTINGS.skinId` = `DEFAULT_SKIN_ID`
- [x] `+page.svelte`: PlayerStrip snippet, one `sans` derived, one `humanSide` derived
- [x] motion.ts helper; `personality()` from named constants; drop unused `clampElo` range param
- [x] Un-export internals (`CREDITS`, `PIECE_VALUES`, `SFX_NAMES`, `VOICE_EVENTS`, `SKIN_IDS`,
      `fenStart`, `parseUciMove`, `DRAWER_MS`); `Board`'s `bubble` prop uses the `Bubble` type
- [~] Coordinates inherits the skin font: **kept as is**, the explicit font keeps the
  component self-contained (its component test runs without `app.css`)

## Phase 3: UI consolidation

- [x] Shared modal dialog code for Drawer, GameOver and Splash (`components/dialog.ts`: `modal(focus)`
      attachment, `cancelWith`, `dialogClass`)
- [x] `--pieces-url` / `--sheet-size`: **changed approach**, one `piecesSheetStyle(skin)` helper
      used by Board and PlayerStrip. Setting them on `:root` would tie Board to the global skin
      store, but it takes its skin as a prop (and its tests switch skins that way)

## Phase 4: tests

- [x] Shared e2e helpers (`cell`, `settings`, `settle`) in `e2e-helpers.ts`. Storage keys stay
      literal: importing `persistence.ts` into Playwright pulls in `$app/paths`, which only Vite resolves
- [x] Shared component-test helpers: `lib/testing/skins.ts` (`testSkins()`, `settle()`)
- [x] Test-only helpers out of production modules: `lib/testing/random.ts` (`seeded`),
      `lib/testing/fakeWorker.ts`

## Phase 5: spec

- [x] SPEC §4.11 (odds), §4.6 (fake worker path), §7.2 (structure), §7.3 (state model), §8
      (tests), decision log #54

## Progress log

- Branch created; plan written.
- Phase 1 done: check, lint and unit tests pass. The voice tests now assert that every line
  plays; the random source only picks the taunting piece.
- Phase 2 done: check, lint and all 253 unit/component tests pass. `voices.pieceOn` now returns
  `wn`-style codes from chess.js (only compared for equality). The MoveList scroll test sizes
  the list itself, since the component no longer has a default height.
- Phase 3 done: check and all unit/component tests pass. The three dialogs share one focus rule:
  focus goes back to the trigger unless the dialog took focus itself. Drawers' `<dialog>` now also
  has `outline-none`; they never focus themselves, so nothing visible changes.
- Phase 4 done: check, lint and unit tests pass.
- Phase 5 done: SPEC updated.
- Final verification: `npm run check`, `npm run lint`, 253 unit/component tests and the e2e
  suite (110 passed, 2 skipped, both viewports) all pass. Nothing is committed yet.
