# Code review, round 7: plan and progress

Branch `feat/volume-previews`. A seventh pass after rounds 1–6 (decision log #54–#58) found
two small things, done here alongside the volume samples (#59). Behaviour is unchanged apart
from the samples.

## Done

- [x] `app.css`: the pointer cursor for `[role='button']:not([aria-disabled='true'])` is gone;
      nothing has `role="button"`
- [x] persistence: `DEFAULT_VOLUMES`, one constant for `sound` and `unmuted`, which were two
      copies of the same literal (a changed default in one would unmute to the old level)
- [x] Volume samples (§4.11): `Sound.preview(category)`, called by Settings once a volume is set;
      a double-click on a slider resets it. `Sound` lists the skin's voice lines in one place
      (`#voiceUrls`) for the prefetch and the sample

## Looked at and kept

- Previous rounds' "kept" items still hold.
- Unused exports are all test-only or types named by exported functions.
- The e2e `settle(page)` beside the component tests' `settle()`: one runs through
  `page.evaluate`, the other in the browser.
- The per-file `setup()` helpers in the tests: each builds something different.

## Progress log

- `npm run check`, `npm run lint`, 258 unit/component tests and the e2e suite (112 passed,
  2 skipped, both viewports) pass. Nothing is committed yet.
