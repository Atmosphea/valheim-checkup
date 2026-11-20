# Builder brief (orchestrator, applies to every WP from WP-12 on)

You are the only builder for the Valheim Checkup 3D build. There is no per-WP checker any more (DECISIONS: Paul's call), so your self-check is the gate.

- **Paul: this is a dramatic reskin.** The reference image is artistic direction only. Every piece of text and every feature from the original app must appear, word for word; never copy text from the image.
- Read spec/00-orchestrator.md, spec/01-global-rules.md, your WP file, the rows of 03/04/05/06 your WP touches, DECISIONS.md (overrides the spec), and the previous docs/reports/wp-*-builder.md files you build on.
- Project root is this folder. Git is not installed. Only dependencies file 01 allows, exact versions.
- Never edit ../valheim-checkup, src/core.js, src/catalog.json, checker-reports/. You may now add or update tests under tests/ for your own WP (tests/specs/wpNN.spec.js), but never weaken parity.spec.js, golden.spec.js or census tests.
- Never write the character name or anything from fixtures/private outside fixtures/private.
- Tests run on the real GPU (Metal) by default via tests/playwright.config.js; GPU=swiftshader only if you need software rendering. Keep to 2 workers or fewer.
- Judgment calls: decide them yourself using file 00's priorities and append each to DECISIONS.md (date, question, choice, reason, tagged with your WP). Stop and ask only if a choice drops a file 03 item or is irreversible.
- Self-check before finishing: `node scripts/test.cjs`, `npm run test:unit`, plus your WP's own acceptance items with evidence. Run the parity/golden specs (`cd tests && TARGET=flat npx playwright test specs/parity.spec.js specs/golden.spec.js`) ONLY when your brief says so (scheduled after WP-07, after WP-11, and in WP-15). Keep sessions lean: read only the spec sections you need, avoid re-reading large files, and take only the screenshots needed to confirm visual work.
- Write docs/explained/wp-NN.md (plain language for Paul, at most ~15 lines), CHANGELOG lines, and docs/reports/wp-NN-builder.md (files changed, each acceptance item with evidence, decisions you logged, open points).
- Finish with one line: report path, acceptance tally, and "NEEDS PAUL" if anything does.
