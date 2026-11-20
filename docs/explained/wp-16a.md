# WP-16A · Flashing, graphics load, zoom and the desk, in plain words

**The flashing:** it was one bug in the glow effect. Each frame the glow layer was meant to start from black, but it started from whatever colour the graphics card used last: sometimes the desk's brown, sometimes black. The brown frames washed the whole screen slightly lighter, about five times a second. It now always starts from black. A check that films the screen and measures its brightness frame by frame finds no flashes now; the same check finds 18 in version 2.0.0.

**The graphics card:** when nothing moves for a moment the desk now repaints 5 times a second instead of 60, and any mouse move, key, scroll or animation wakes it at once. Shadows are only redrawn when something casting one moves, they use a smaller map, the gauntlet's reflections refresh half as often, and its shine is a little softer. With the page sitting still, the card does about a tenth of the work it did. With the mouse moving it works as hard as before.

**The blue shadow:** the header strip that lifts off the paper left a bluish shadow over the page after the table was scrolled. Its shadow is now cut where the strip is cut, and coloured like paper.

**Zoom:** the scroll wheel zooms in up to 2.5× and out to 0.8×, smoothly, toward the pointer. Over the table the wheel still scrolls the table. A trackpad pinch zooms anywhere.

**Spark out:** with the spark out the view moves 30 % closer and frames the whole text page, so the table text is bigger. Push the pointer to the left edge and it lets go, so the board is always reachable.

**The desk:** the planks now have knots with the grain swirling round them, wavy grain, small cracks, worn lighter edges and dirt in the gaps. The desk looks darker than before.
