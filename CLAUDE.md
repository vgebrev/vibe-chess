# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser chess game (vs Stockfish or hot-seat) with swappable skins, built with SvelteKit. **`SPEC.md` is the source of truth**: requirements, the skin manifest format, layout rules, proposed architecture (§7), milestones (§9) and a decision log (§11). Read the relevant section before implementing a feature, and when a decision changes, update the spec (including the decision log) rather than letting code and spec diverge. Work proceeds milestone by milestone (§9).

## Commands

```sh
npm run dev                  # dev server on http://localhost:24377 (strictPort)
npm run build                # static SPA in build/
npm run preview              # serves build/ on :24378 (strictPort)
npm run check                # svelte-check / TypeScript
npm run lint                 # prettier --check + eslint (prettier also checks SPEC.md)
npm run format               # prettier --write
npx vitest --run             # all unit/component tests once
npx vitest --run path/to/file.spec.ts   # single file; add -t "name" for a single test
npx playwright test          # e2e; builds + previews automatically
npx playwright test --project=phone     # one viewport (phone 390×844 | desktop 1280×800)
npm test                     # unit (single run) + e2e
```

The ports are deliberate (24377 spells CHESS on a keypad) so localStorage doesn't collide with other projects; don't change them or drop `strictPort`.

## Stack and configuration

- SvelteKit 3 + Svelte 5 **runes only** (forced in `vite.config.ts`), TypeScript, Tailwind v4 via `@tailwindcss/vite` (imported in `src/app.css`, no `tailwind.config`). SvelteKit config lives in `vite.config.ts` (no `svelte.config.js`).
- SPA mode: `ssr = false` in `src/routes/+layout.ts`, adapter-static with `fallback: 'index.html'`, no prerendering. Everything (chess state, engine, localStorage, `FontFace`) is browser-only. Deploy target is Cloudflare Pages as plain static output.
- SvelteKit 3 has no `$lib` alias: import through the `#lib/*` subpath import from `package.json`, **with the file extension** (`#lib/skins/schema.ts`, `#lib/components/Board.svelte`). `$app/paths` has no `base`; use `asset()` (typed against the files in `static/`).
- Vitest has two projects: `*.svelte.{test,spec}.ts` run as component tests in real Chromium (vitest-browser-svelte); other `*.{test,spec}.ts` run in Node. Playwright e2e files are `*.e2e.ts`. Browser tests can fetch project files by path (`/tests/fixtures/skins/test/`) and `static/` at the root (`/skins/pirate/`), but a request that 404s falls through to SvelteKit's dev SSR and logs a `wrapDynamicImport` TypeError, so stub `fetch` for missing-file cases. The `transform_index_html_unsupported` warning at Vitest startup is harmless.
- Keep non-reactive code out of `.svelte.ts` files: `svelte/prefer-svelte-reactivity` flags plain `Map`/`URL` there (hence `skins/loader.ts` vs the `skins/skin.svelte.ts` store).
- Mobile-first layout using **standard Tailwind breakpoints only**; the side panel appears at `lg`. Skin theme colours are exposed as CSS variables mapped through `@theme inline` (SPEC §6.0).
- Rules come from chess.js; the engine is the `stockfish` npm package's single-threaded lite WASM build in a Web Worker over UCI, lazy-loaded on the first vs-Computer game (SPEC §4.6, §7).

## Skins

- A served skin is a folder `static/skins/<id>/` with `skin.json` (the **only** manifest, edited by hand) plus `board.webp`, `pieces.webp` (6×2 grid of 320 px cells), `indicator-move.webp`, optional `indicator-capture.webp`, and `font/*.woff2` + `OFL.txt`. Skins: `pirate` (framed board, non-zero `inset`, coordinates drawn in the frame) and `default` (Marble, `inset` 0, coordinates in an outside gutter). Manifest fields are specified in SPEC §5.1.
- `"disabled": true` in a `skin.json` keeps a skin registered but off the menu; Marble is currently disabled, so Pirate is the only skin and the Settings picker is hidden (it shows only with two or more). E2E tests call `enableAllSkins(page)` (`src/routes/e2e-helpers.ts`) to play in Marble; `skins.e2e.ts` tests the shipped set.
- Original source art lives in `scratchpad/skins/<id>/assets/`, which is **not committed** (excluded via `.git/info/exclude`, intentionally not `.gitignore`). `scripts/convert-skin.py <id>` is a manual one-off converter, not a build step; it never writes `skin.json`. Run it with the gitignored project venv: `.venv/bin/python scripts/convert-skin.py <id>` (create with `python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt`). It centres sprites on their base and fits hand-drawn framed boards to an even grid (SPEC §5.6).
- Skins must stay data-only: adding a skin should not require code changes beyond the registry (SPEC §5.5).
