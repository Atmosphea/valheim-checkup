# Start here

This folder holds **Valheim Checkup 2.0**, the version with the 3D desk. You don't need to install anything to use it.

## Open the app

1. Double-click **`valheim-checkup.html`**. It opens in your web browser. It was tested in Chrome; Edge works the same way. Safari and Firefox should work but weren't tested.
2. Click **Load character** (or drag your save file onto the page). Your save is a file ending in `.fch`. The **How to** button next to Load character shows where the game keeps it on Windows, macOS and Linux.
3. Your save never leaves your computer. The app has no internet connection of its own; it reads the file inside your browser.

On a computer with a mouse or trackpad and a big enough window, you get the **3D desk**: a candle-lit table, a parchment sheet, brass bars for the collections and a steel gauntlet that follows your pointer. On a phone, a small window, or with "reduce motion" turned on in your system settings, you get the **flat** page instead: the same parchment look as an ordinary web page. Both show exactly the same lists and numbers.

To pick one yourself, add `?mode=flat` or `?mode=desk` to the end of the address in the browser's address bar and press Enter.

## What each folder is

| Name | What it is |
| --- | --- |
| `valheim-checkup.html` | The whole app in one file. This is the one to use. |
| `site/` | The same app split into separate files. Only needed if you later put it on a website (for example GitHub Pages). Opening its `index.html` by double-click won't work; it needs a web server. |
| `source/` | Everything the app is made from: the code, the tests and the build notes. You only need this to change the app. |
| `docs/explained/` | Short, plain-language notes on each part of the build. Start with `docs/explained/README.md`. |
| `QUESTIONS-FOR-PAUL.md` | The few things that need your decision, and a list of things to try on your Mac. |
| `checker-reports/final-audit.md` | The last round of checks and their results. |
| `CHANGELOG.md` | What changed in each version. The "2.0.0 — 3D desk" section is the new one. |
| `LICENSES/` | The licence texts for the fonts, the 3D library and the icons. |

Words you may meet: a **browser** is the program you view web pages in. A **build** is the step that turns the source into the finished app file. A **test** is a small program that opens the app and checks it still works.

## Changing the app later (with a Claude session)

You don't need to know how to code. Open a Claude Code session in the `source/` folder and say what you want. It will need two things, which it can do itself:

1. **`npm install`**: downloads the tools the build uses (about 2 minutes; it needs Node.js, a free program from nodejs.org).
2. **`npm run dev`**: starts a preview of the app at `http://localhost:5173/` that updates as the code changes.

When the change is done, **`npm run build:all`** makes a new `dist/valheim-checkup.html` and `dist/site/`, and **`node scripts/package.cjs`** makes a fresh zip like this one.

Some tests check the numbers against your own save. Your save and the file with your character's name are **not** in this zip, on purpose. To run those tests, put your `.fch` file and `expected.json` back into `source/fixtures/private/` (keep that folder private).

`source/` has no history of earlier versions: the tool that records it (git) wasn't installed on the Mac this was built on.
