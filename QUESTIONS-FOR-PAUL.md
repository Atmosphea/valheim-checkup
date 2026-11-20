# Questions for Paul

Each question has a choice already made, so the app works as it is. Reply "keep" or "change" to each. Any change is one small setting; a Claude session can make it in minutes.

## Decisions waiting for you

1. **Graphics memory on a Retina screen.** The desk keeps its 3D picture under 300 MB of graphics memory, because your Mac has 8 GB. On a Retina (sharp) screen this can make the 3D desk and gauntlet look a little soft; the text always stays sharp. Raising the limit to 600 MB makes the 3D sharp but uses more memory. **Now: 300.**
2. **The gauntlet's reflections on High quality.** The steel's mirror image of the room is redrawn every 6th frame instead of every 3rd, to keep the hand cheap to draw. You'd only notice it as a very slight lag in the reflection when the hand moves fast. **Now: every 6th frame.**
3. **The glow on High quality.** The bright glints on the knuckles and the halo around the socket are drawn at half size, to stay under the 300 MB limit. They are a little smaller and dimmer than the spec. Full size needs the limit raised to 310 MB. **Now: half size.**
4. **One accessibility finding in the original page.** The Load character button's spoken name is "Load character", while it also shows the hint "click or drop .fch". An automatic checker flags that the hint isn't in the spoken name. Fixing it means changing text that the original app has, so it was left as it is. **Now: left as in the original.**
5. **The green "Completed" stamp on the desk.** It's 7 % darker than the spec's green, so it is easier to read on the desk's candle-lit paper. The flat page keeps the spec's green. **Now: darker on the desk.**
6. **The worn spots in the stamps.** Stamps have small worn spots, like a real rubber stamp. At full depth they could cut a letter (a "66" read as "65"), so they now only fade the ink by half. **Now: half depth.**
7. **The Aspects' icons.** The game's own pictures of the seven Aspects are blank, so each Aspect shows its boss's trophy tinted pale ghost-blue. **Now: blue trophy.**
8. **Flat page and desk side by side.** Do they look like one design to you? **Now: built to match.**
9. **Collection title ornaments (your item 27).** Titles are bigger and centred, with a drawn flourish on each side and a red first letter. **Now: flourishes + red initial.** Say "plainer" if it is too much.
10. **The Details button peel (item 25).** While Details is open, its button lifts about 7 px, curls and bobs slightly, then settles back. **Now: gentle peel.** Say "more" or "less".
11. **Ink wash speed (item 18).** The wash now takes 0.85 s at an even pace, so you can see it cross the heading. **Now: 0.85 s.** Say "faster" or "slower".
12. **Coin tilt (item 23).** The coins sit at different heights and rest tilted 1.6–3.2°. **Now: slight.** Say "more varied" if they still look lined up.
13. **Help note position (item 22).** "How progress is read" is on its own small strip of paper at the top right, under the coins. **Now: top right strip.** Is that the place you meant?
14. **The Carpenter's one slow frame (WP-17 item 23).** Now that every item shows by default, The Carpenter has about 400 rows. When you drop the gauntlet onto it, the page pauses once for about 0.1 s (80–120 ms) while the original app's code draws the rows. No other collection pauses. Making it shorter means changing how the original app draws its list. **Now: left as it is.** Say "fix it" if you notice the pause.
15. **The default list (item 23).** The first choice in the list menu is "All items, missing first", and it is the default. The five original choices follow. **Now: that wording.**
16. **The green for completed rows (item 23).** A dark moss green (#4a6631) with white text. **Now: moss green.** Say "lighter" or "darker".
17. **The burn on close (item 27).** It takes 1 s and starts at the edge nearest your click (from the lower left corner after Escape). It still plays the paper fold sound; a crackle would fit better. **Now: 1 s, fold sound.** Say "crackle", "faster" or "slower".
18. **Details wording (items 25 and 26).** The footer now says: "Found under its exact name in your save. “Completed” means the game recorded you doing it at least once; it does not look at what you carry now." Trophies that have no use of their own show "Used for Item Stand decoration". **Now: both as shown.**

19. **Main view framing (WP-18 item 6).** At 20 % closer, the main view trims about 1 cm off the table's left edge (the Completed column) and puts the coins at the window's top-right corner. Both are fully visible in the header view. **Now: as you asked, 20 % closer.** Say "a little less" if the trimmed edge bothers you.
20. **Coins over a scrolled table (items 4 and 8).** When the table scrolls, rows pass under the coins and the help note, as they did in 2.2.0. Nothing is covered when the table isn't scrolled. **Now: rows pass under.** Say "fade them" and the rows will fade out under the coins, like they do along the burned edge.
21. **"Start here" (item 10).** Red-brown script around the How-to coin, with a hand-drawn arrow, until a save is loaded (desk only; the flat page has none yet). **Now: as built.** Say if the script, colour or arrow should change, or if the flat page should have one too.
22. **The coins (items 8 and 9).** A tighter, uneven cluster, and a stronger hover (a hop and a 75° spin with a small overshoot). The Import ↥ coin was kept, as you chose. **Now: as built.**
23. **The burn when Details closes (item 15).** The letter takes 1.5 s (was about 1 s), drifts about 4 cm sideways on the wind, and a crackle plays. **Now: 1.5 s, gentle wind, crackle.** Say "faster", "less wind" or "different sound".
24. **Gourmet Details (item 17).** A "Makes n" or "n servings" line under the recipe, and the station pictures (for example, the Cauldron is a pot on a tripod). A few recipes name only their first station (Lox Meat Pie shows the Food Preparation Table, not the Stone Oven). **Now: as the wiki data gives it.**
25. **What can be cut for smoothness (WP-18P).** Nothing has been cut. Measured on your Mac with a Retina screen, switching to The Carpenter (the biggest list) dropped 13 frames with everything on. Three changes would help, and each one shows:
    - **Edge smoothing of the 3D layer (MSAA 4×).** Switching it to a lighter kind on sharp (Retina) screens takes the drops from 13 to about 2, and saves about 4 ms of graphics work per frame. On a Retina screen the edges are already fine, so this is the best trade. **Recommend: lighter smoothing on Retina.**
    - **The lamp's light on the printed page (the veil).** Drawing it at a quarter size on Retina screens (now half) would save part of its ~3 ms per frame. Turning it off also took the drops to about 2, but the page would lose the lamp's pool of light and the gauntlet's shadow, which is very visible. **Recommend: try quarter size; never off.**
    - **The ink wash on slow computers.** On a computer six times slower than yours, the big lists still stutter, even at the lowest quality. Only one thing helps there: showing the content at once instead of inking it in, on those computers only. **Recommend: yes, as the last step on struggling machines.** It would never happen on your Mac.
    - **Keep as they are (cheap now):** the glow on the spark (~2 ms), the shadows (redrawn only when something moves), the gauntlet's reflections, the film grain, the icons' printed look, and the Details burn.
    - **Two pauses that remain:** the first frame of a big list (about 0.1 s while the original app builds 400 rows) and the row-height burn (about 14 dropped frames). Shortening them means changing how the original app builds its list, or burning a still picture of the rows instead of the live rows. **Now: left as they are.** Say "fix them" if you notice them.
26. **Bosses in Highlights (item 18).** A big square tile per boss, dim until you've beaten it, with how many times you have. The save also has a second per-boss number that looks like "you landed the last hit". It matches the bosses' lifetime last-hit total, but not the same total for all enemies, so it isn't shown. Also, the lifetime boss totals count the seven main bosses only, not Hildir's three. **Now: kills only.**
27. **"Played on" (item 18).** The world settings come from what the save recorded, with defaults left out, for example "Combat: hard · Resources: much more · Enemy damage 150 % …". The line shows after you load the save file in a tab, until that tab closes: the settings are read from the file itself, and nothing extra is stored for good in your browser. **Now: as shown.**
28. **Viking records (item 19).** About 90 lifetime numbers in five groups, with plain labels. "Maximum building height" and "highest comfort level" are shown as the game stores them, with no unit. A few counters the game keeps aren't shown, because their meaning couldn't be confirmed (for example, how far you've explored north or south, and the deepest dungeon). **Now: as shown.** Say if a label reads oddly.

## Things to try on your Mac

Open `valheim-checkup.html` and load your save first.

- **Aspect tint:** open The Hunter and scroll to the "Aspect of …" rows. Does the pale blue read as a ghostly boss? (Question 7.)
- **Dark icons:** look through The Artisan and The Carpenter. Does any icon look too dark or muddy on the paper?
- **T-pose creatures:** in The Hunter, some creatures without a trophy picture are shown as the whole creature model, which can stand stiffly with its arms out (a "T-pose"). Are they fine, or distracting?
- **Paper warmth:** does the paper look too yellow, too grey, or right? Check both the desk and the flat page (add `?mode=flat` to the address).
- **Graphics memory 300 vs 600:** look closely at the gauntlet and the desk edges. If they look soft or blurry next to the text, say "try 600". (Question 1.)
- **Glow half vs full:** look at the gauntlet's knuckles and the glow at its socket. If they look weak, say "full glow". (Question 3.)
- **Desk green stamp:** compare the green Completed stamp on the desk and on the flat page. (Question 5.)
- **Stamp worn spots:** do the stamps look worn enough, or too clean? (Question 6.)
- **Small text on the desk:** is the small text on the 3D sheet easy to read on your screen?
- **Sound mix:** add `?soundboard` to the end of the address. Every sound has a play button and volume and pitch settings. If you change something, click Download and send the file.
- **Frame rate:** add `?perf` to the address, use the app for half a minute, then click Copy in the small panel at the top left and paste the text into a message. The first number is frames per second: higher and steadier is smoother.
- **Version 2.1.0 (your WP-16 list):** drag the line between two table headings to resize a column (double-click it to reset); open the help letter and Details to see the new folds; open a filter list on the desk. (Questions 9–13.)
- **Version 2.3.0 (your WP-18 list):** open Highlights to see Bosses, "Played on" and Viking records. Switch to The Carpenter and back with `?perf` added to the address to see the smoother changes. (Questions 19–28.)
- **Version 2.2.0 (your WP-17 list):** open a trophy's Details. Look at the drop chance, the toolbar and the footer. Close it by clicking outside to see the burn. Open a few items to check their stains differ. Click the desk once to zoom; drag to burn wood. (Questions 14–18.)

## One known problem

- **If the desk goes black** (for example after your Mac wakes from sleep, or when memory runs low), reload the page. The desk's pictures live on the graphics card and aren't rebuilt when it resets. This can be fixed later; say if you see it.
