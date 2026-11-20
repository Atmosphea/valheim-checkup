# WP-18P · Smooth transitions and the quality governor, in plain words

**What was slow:** changing collection on the big tables (The Artisan, The Carpenter), opening and closing Details, and the row-height burn. The printed page sits in 3D, so the browser repainted the whole 400-row table, not just what you see, and several parts of the code measured the page in the middle of drawing it, which made the browser redo its layout.
**What changed:** icons of rows far outside the view aren't painted (the rows are all still there), buttons only get their "pressed" offset while they are pressed, and every measurement now happens at the start of a frame, before anything changes. All animations run from one shared clock instead of a dozen separate loops.
**Result on this Mac (median of 3 runs):** late frames per change went from 18–20 to 1 on The Artisan and The Carpenter, from 7 to 1 opening Details and from 13 to 1 closing it. In total, 96 → 40 late frames across every transition. Mid-way screenshots match the old build.
**Still not perfect:** the first frame of a big table (the original app builds 400 rows in one go, ~100 ms), the row-height burn (14 late frames) and start-up.
**Quality governor:** if a computer struggles, the desk first quietly lowers small things (how often the gauntlet's reflection refreshes, then the 3D sharpness a little), and only then a whole quality tier. It now also climbs back when there is room. It no longer drops this Mac to Low just because a view change had a few long frames, which the old rule did.
**For maintainers:** `docs/explained/architecture.md`.
**Try it:** add `?perf` to the address and switch between The Gourmet and The Carpenter.
