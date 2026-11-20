# Valheim Checkup 3D: kit for Herder

Give this whole folder to your Claude Code session (unzip it into the project folder Herder will work in).

- `spec/` holds the build spec. Point Herder at `spec/00-orchestrator.md` first. `spec/valheim-checkup-herder-spec.md` is the same spec in one file.
- `reference/IMG_6272.png` is the look the 3D desk should match.
- `fixtures/private/` holds your test save and the character name the tests check. Keep this folder out of git and out of the final zip; the spec already says so.

A good first message to Herder:

> Read spec/00-orchestrator.md and follow it. Start with WP-00. Don't push anything; the final output is a zip.
