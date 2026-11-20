# Retired check tools

Kept for history; they no longer match the app and are not run.

- `wp06-check.cjs`: drives the WP-06 slider (rest right, drag left, timed linkage). Paul's WP-16 items 9–10 reversed the direction and coupled the bars; `tools/wp16b-check.cjs slider` checks the new behaviour.
- `wp09-check.cjs`: drives the WP-09 gauntlet zone with the wall hover. Paul's WP-16 items 15–16 replaced it with freeze and catch; `tools/wp16b-check.cjs freeze,catch` checks them.

Retired in WP-16C (DECISIONS, 2026-11-11). They require `../wp08-check.cjs` and the tests' Playwright, so they still start from this folder if someone wants to read their old numbers.
- `wp16a-zoom-spark.cjs.txt`: the wheel/pinch zoom and spark-out framing block cut from `tools/wp16a-check.cjs`. Paul's WP-17 item 2 removed both; `tools/wp17a-check.cjs camera` checks the new camera rules. Kept as text because it needs that file's helpers. Retired in WP-17A (DECISIONS, 2026-11-11).
