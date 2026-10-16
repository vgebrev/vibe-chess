Skin fixtures for component tests (SPEC §5.5). Served by Vitest's browser-mode dev server at `/tests/fixtures/skins/<id>/`.

- `test/`: a minimal valid skin with **inset 0** (coordinates go in the gutter), no capture indicator and no labels, so every optional default is exercised. Tiny generated images; the font is a copy of Marcellus (OFL) under the family name "Fixture Serif".
- `invalid/`: a manifest with deliberate errors, for the "stay on the current skin" path.
