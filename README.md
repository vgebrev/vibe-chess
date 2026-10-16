# Chess

A browser chess game built with SvelteKit: play against Stockfish or hot-seat, with skins. See [SPEC.md](SPEC.md) for the full specification.

## Development

```sh
npm install
npm run dev          # dev server
npm run check        # svelte-check / TypeScript
npm run lint         # prettier + eslint
npm run format       # prettier --write
npm run test:unit    # vitest (watch mode)
npm run test:e2e     # playwright, phone and desktop viewports
npm test             # unit (single run) + e2e
```

## Build

```sh
npm run build        # static output in build/
npm run preview      # serve the build locally
```

The output is a static SPA (adapter-static, `index.html` fallback) and can be deployed to Cloudflare Pages as-is.

## Skins

Served skins live in `static/skins/<id>/`; each `skin.json` is edited by hand. Source art is kept out of the repo. To re-export a skin after its art changes, place the originals in `scratchpad/skins/<id>/assets/` and run:

```sh
python scripts/convert-skin.py <id>   # needs pillow, fonttools, brotli
```
