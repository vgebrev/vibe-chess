# Vibe Chess

A weekend project to see how polished a chess game I could vibe code in a single weekend. Play against Stockfish or a friend on the same device, in a pirate skin with music, sound effects, character voices and speech bubbles. It is built with SvelteKit, runs entirely in the browser, and is playable on a phone. See [SPEC.md](SPEC.md) for the full specification and the decisions made along the way.

https://github.com/user-attachments/assets/a7c37bb7-ddcc-47ad-8b64-30934f32a641

## Credits

- **Meat Proxy:** [Veli Gebrev](https://veli.gebrev.com)
- **Code:** [Claude](https://claude.ai)
- **Graphics:** [ChatGPT](https://chatgpt.com)
- **Music:** [Suno](https://suno.com)
- **Sound Effects:** [ElevenLabs](https://elevenlabs.io)
- **Chess rules:** [chess.js](https://github.com/jhlywa/chess.js)
- **Engine:** [stockfish.js](https://github.com/nmrugg/stockfish.js)

## Development

```sh
npm install
npm run dev          # dev server on http://localhost:24377
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
npm run preview      # serve the build on http://localhost:24378
```

The output is a static SPA (adapter-static, `index.html` fallback) and can be deployed to Cloudflare Pages as-is.

## Skins

Served skins live in `static/skins/<id>/`; each `skin.json` is edited by hand. Source art is kept out of the repo. To re-export a skin after its art changes, place the originals in `scratchpad/skins/<id>/assets/` and run:

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt   # once
.venv/bin/python scripts/convert-skin.py <id>
```

## License

[MIT](LICENSE), for this project's own code and assets. The libraries and font it uses keep their own licenses: Stockfish is GPL-3.0, chess.js is BSD-2-Clause, and the Pirata One font is under the SIL Open Font License (`static/skins/pirate/font/OFL.txt`).
