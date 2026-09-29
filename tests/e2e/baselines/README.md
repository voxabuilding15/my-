# Visual regression baselines

One folder per device (`phone`, `tablet`) with the reference screenshots `screen-<tab>-<light|dark>.png`,
compared by `scripts/compare-screenshots.ts` after every E2E run (fails above 1% changed pixels).

To create or update them after an intended UI change: open the E2E workflow run, download the
`e2e-phone` / `e2e-tablet` artifacts, copy `screenshots/screen-*.png` into the matching folder
here and commit. Screens without a baseline are reported as `no-baseline` and do not fail.
