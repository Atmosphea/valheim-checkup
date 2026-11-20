# Recorded sound overrides

Drop a recording here named after the sound in `src/config/audio-mix.json`, for example
`bar.latch.wav` or `stamp.big.ogg`, then rebuild (`npm run build:single`). The recording
replaces the synthesised version; its gain in `audio-mix.json` still applies. A recording for a
sound marked `"deferred": true` makes that sound play again.
