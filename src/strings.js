// @ts-check
/**
 * New user-visible strings (file 01: "New strings live in src/strings.js").
 * Original strings stay where they are in src/template.html and src/app.js, word for word.
 * Each entry names the WP and spec row that introduces it.
 */
export const STRINGS = Object.freeze({
  /** File 04, woodblock row "Mouse click without drag" (shown by WP-06). */
  barDragHint: 'Drag the knob to the right',
  /** WP-06 coin table: the Sound coin's rim legend and its proxy's accessible name (a toggle; aria-pressed = sound on). */
  soundCoin: 'Sound',
  /** WP-13 step 9 / file 01 Accessibility: help switch (shown only when the device can run desk mode). */
  forceDesk: 'Use the 3D desk anyway',
  /** WP-09: help switch for people who need the normal pointer. */
  showPointer: 'Also show the normal pointer',
  /** WP-02 step 4 / file 03 P36: footer icon credit, start. The sources actually used are added by iconCredit(). */
  iconCredit: 'Item, piece and creature icons © Iron Gate AB, via the Jötunn documentation (MIT)',
  /** WP-02 step 4: added when valheim.tools icons are used. */
  iconCreditTools: 'valheim.tools',
  /** WP-02 step 4: added when Valheim wiki icons are used. */
  iconCreditWiki: 'the Valheim wiki',
  /** WP-02 step 5 / file 03 P40: added to the help privacy paragraph only if some icons are hotlinked. {host} = the image host(s). */
  iconHotlinkPrivacy: 'A few item icons load from {host}; your save is never sent.',

  /* ── WP-03 How-to control and popup ─────────────────────────────────────────────── */
  /** WP-03 "How-to control": visible label. */
  howTo: 'How to',
  /** WP-03 "How-to control": accessible name (flat button and desk coin proxy). */
  howToName: 'How to find your save and use Valheim Checkup',
  /** WP-03 popup title. */
  howToTitle: 'Find your Valheim character',
  /** Paul, WP-18 item 10: drawn (canvas) around the How-to coin while no save is loaded. */
  startHere: 'start here',
  /** WP-03 popup step 3, first sentence (the Steam Cloud sentence is copied from the help text). */
  howToChoose: "Choose your character's .fch file. Pick a recent one, not a world .db file or a backup.",
  /** WP-03 popup step 4: footer button that starts the tour. */
  showMeAround: 'Show me around',
  /** WP-03 popup step 4: accessible name of the close ×. */
  howToClose: 'Close',
  /** WP-03 popup step 2: Copy button, visible text. */
  copy: 'Copy',
  /** WP-03 popup step 2: rest of the Copy button's accessible name (visually hidden). {label} = the row heading. */
  copyFor: ' path for {label}',
  /** WP-03 popup step 2: toast after a copy. */
  pathCopied: 'Path copied.',
  /** WP-03: toast when the browser refuses both ways of copying (the path is left selected). */
  copyFailed: 'Copy did not work here. The path is selected: press Ctrl-C, or Command-C on a Mac.',
  /** WP-03 popup: label of the tab list. */
  platformTabs: 'Your computer',

  /* ── WP-03 tour ─────────────────────────────────────────────────────────────────── */
  /** "{n} of {total}" step counter on each slip. */
  tourStep: '{n} of {total}',
  /** Hint on every slip (there is no Done, Finish or Skip button by design). */
  tourHint: 'Click anywhere or press → to continue. ← goes back, Esc leaves the tour.',
  tour1Title: 'Load your Viking',
  tour1Desk: "Click the Load character coin, or drop a recent .fch file anywhere on the page. It's read in your browser and never uploaded.",
  /** Flat mode: step 1 says "button" instead of "coin" (WP-03, tour rules). */
  tour1Flat: "Click the Load character button, or drop a recent .fch file anywhere on the page. It's read in your browser and never uploaded.",
  tour2Title: 'Choose a collection',
  tour2Desk: 'Grab a knob and drag it to the left to open that collection. The one that was open slides back on its own.',
  /** Flat mode: step 2 says "Pick a collection from the list." (the sliding-back sentence is about the desk bars). */
  tour2Flat: 'Pick a collection from the list.',
  tour3Title: 'Read your progress',
  tour3: 'Completed, Missing, Unverified and Undiscovered show where you stand. Filter or search the list, and open Details to compare records, add a note or correct an item.',
});

/**
 * WP-03 popup step 2 (plus DECISIONS "WP-03 macOS path", verified on a real Mac): the save
 * folders per platform. Each row: heading, exact path (copied byte for byte), how to open it.
 * Steam installs. Order inside a tab is the order shown.
 * @type {ReadonlyArray<{id: 'windows'|'mac'|'linux', tab: string, rows: ReadonlyArray<{label: string, path: string, how: string}>}>}
 */
export const SAVE_PATHS = Object.freeze([
  {
    id: 'windows', tab: 'Windows', rows: [
      { label: 'Windows', path: '%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local', how: 'Paste into the File Explorer address bar and press Enter.' },
    ],
  },
  {
    id: 'mac', tab: 'macOS', rows: [
      { label: 'macOS', path: '~/Library/Application Support/IronGate/Valheim/characters_local', how: 'In Finder choose Go → Go to Folder (Shift-Command-G) and paste.' },
      { label: 'macOS, older or cloud saves', path: '~/Library/Application Support/IronGate/Valheim/characters', how: 'In Finder choose Go → Go to Folder (Shift-Command-G) and paste.' },
      { label: 'macOS, if that folder is missing', path: '~/Library/Application Support/com.coffeestain.Valheim', how: 'Same; look for a characters_local folder inside.' },
    ],
  },
  {
    id: 'linux', tab: 'Linux', rows: [
      { label: 'Linux', path: '~/.config/unity3d/IronGate/Valheim/characters_local', how: "Paste into your file manager's location bar (Ctrl-L)." },
      { label: 'Linux, Proton or Steam Deck', path: '~/.local/share/Steam/steamapps/compatdata/892970/pfx/drive_c/users/steamuser/AppData/LocalLow/IronGate/Valheim/characters_local', how: 'Same; show hidden folders if needed.' },
      { label: 'Linux, Flatpak Steam', path: '~/.var/app/com.valvesoftware.Steam/.config/unity3d/IronGate/Valheim/characters_local', how: 'Same.' },
    ],
  },
]);

/**
 * The footer credit line, worded to match the icon sources actually used (WP-02 step 4).
 * @param {{valheimTools?: boolean, wiki?: boolean}} used
 * @returns {string}
 */
export function iconCredit(used) {
  const extra = [used.valheimTools && STRINGS.iconCreditTools, used.wiki && STRINGS.iconCreditWiki].filter(Boolean);
  if (!extra.length) return STRINGS.iconCredit + '.';
  if (extra.length === 1) return `${STRINGS.iconCredit} and ${extra[0]}.`;
  return `${STRINGS.iconCredit}, ${extra[0]} and ${extra[1]}.`;
}
