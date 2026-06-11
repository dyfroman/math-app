# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hebrew math practice app for three specific kids (נעה/noa — 3rd grade, רז/raz — 1st grade, צורי/tzuri — kindergarten). The entire app is a single `index.html` file (HTML + CSS + JS, no external dependencies, works offline from `file://`). All UI text is Hebrew, feminine address forms ("נסי", "לחצי").

## Commands

- **Run tests:** `node _logic_test.js` — extracts the pure-logic section out of `index.html` and validates exercise generation (thousands of exercises per type: no negative subtraction results, no division remainders, choice options contain the answer exactly once) plus the adaptive level/reinforce state machine. Its migration test also executes the **entire** `<script>` under Node with browser stubs, so it doubles as a syntax check for the DOM code. Run after any change to `index.html`.
- **Visually verify new exercise visuals** (SVG, hints): generate a temp gallery page from the extracted logic (small Node script that calls `genExercise`/`angleSVG`/`shapeSVG` and writes sample HTML), screenshot it with headless Edge, then delete the temp files. Deep levels can't be reached via the URL hash, so this is the way to see late-level content without playing through.
- **Open the app:** `Start-Process index.html`, or in a browser at https://dyfroman.github.io/math-app/.
- **Render smoke test:** headless Edge screenshot, e.g.
  `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --window-size=480,860 --screenshot=out.png "file:///C:/Users/dyfro/Desktop/math-app/index.html#noa"`
  The URL hash (`#noa`, `#raz`, `#tzuri`) deep-links straight into a profile's game screen — used both for testing and as a feature.
- **Deploy:** push to `main`. GitHub Pages (repo `dyfroman/math-app`) serves the branch root automatically. `gh` CLI is **not** installed; GitHub API calls work via the token from `git credential fill`.
- **Hebrew commit messages:** avoid ASCII double quotes (`"`) inside the message — even in a single-quoted PowerShell here-string, embedded `"` breaks native argument quoting for `git commit -m` (Windows PowerShell 5.1) and the text after the quote is parsed as a pathspec. Rephrase or use Hebrew gershayim (״) instead.

## Architecture

The app is `index.html` (markup + JS) plus `style.css` (all styling) and `assets/` (theme images + self-hosted Rubik woff2 fonts, all generated via Canva/Adobe MCP — total ~750KB, keep backgrounds ≤400KB JPG and mascots ≤200KB PNG). Everything still works offline from `file://`; if asset files are missing the app degrades gracefully (gradient backgrounds, no mascot, system font).

**Theming:** each child has an adventure world — noa=space (מסע בין כוכבים), raz=forest (יער הקסמים), tzuri=farm (חוות החיות). The `THEMES` object (DOM section of `index.html`) maps profile id → world name, background image, mascot poses (happy/cheer PNGs), journey-map node icons, and praise strings. `applyTheme(id)` sets `body[data-theme]`; all colors flow through CSS variables (`--accent`, `--accent-soft`, `--accent-ink`, `--key-shadow`, `--page-ink`, …) defined per theme in `style.css`. The background image sits on a fixed `body::before` layer (not `background-attachment:fixed`, which is broken on iOS); the body gradient behind it is the no-image fallback.

**Journey map:** `#screen-journey` + `renderJourney()` show a vertical zigzag path of the profile's levels (column-reverse — start at bottom), with done/current/locked node states and the mascot perched on the current node. A mini trail (`renderTrail()`) replaces the plain level text in the game HUD. On level-up the map auto-opens (~2.3s after the banner) with a `just-advanced` node animation. The mascot (`#mascot`, `setMascot(pose)`) reacts in `onCorrect`/`onWrong`/`nextExercise` and stars on the celebrate screen.

The JS in `index.html` is one `<script>` block, split in two by comment markers:

1. **Pure logic** between `==LOGIC-START==` and `==LOGIC-END==` — `CONFIG`, `TYPE_NAMES`, `genExercise(type, easy)`, `updateProgress(...)`, `chooseType(...)`, `defaultState(profile)`. This section must stay free of `document`/`window`/`localStorage` references: `_logic_test.js` extracts it by those markers and runs it under Node via `eval`. New helper functions used by generators belong here.
2. **DOM/interaction code** below the end marker — screens, rendering, sounds (Web Audio, generated in code — no audio files), effects, parent dashboard.

Key design points that span the file:

- **`CONFIG` drives everything.** Each profile has `levels: [{title, types: [...]}]`, plus `trackVersion`/`startLevel`; each type string maps to a `case` in `genExercise` and a label in `TYPE_NAMES`. Adding a level or exercise type means touching those three places only (and bumping the profile's `trackVersion` if the levels array is restructured — see migration below). Type ids are unique per child even for similar skills (e.g. `add10` is Raz's numpad addition, `tadd10` is Tzuri's emoji-based choice addition) because the generator output format differs. Noa's track mirrors her 3rd-grade end-of-year review sheet (place value, missing-factor, mental math, 4-digit ±, order of operations, rounding, sequences, word problems, angle/shape recognition).
- **Exercise object contract:** `{type, mode: 'numpad'|'choice', prompt, line?, visual?, answer, options?, hint, emojiLine?, meta?}`. `mode` decides the input UI: Tzuri's profile only uses `choice` (big tap targets, no typing); Noa/Raz mostly use `numpad` (Noa's geometry types use `choice` with string-valued answers — `submitAnswer` compares with `===`, which works for both). In `numpad` mode the `?` in `line` is replaced by the answer box. `hint` is an HTML string shown only after the second wrong attempt; after 4 attempts the answer is revealed and the session moves on. `meta` carries generator internals (e.g. `{n, unit}` for rounding) consumed only by the tests. Numbers ≥1000 are displayed with comma separators via `fmt()`.
- **Adaptive flow** (`updateProgress`): 5 first-try corrects in a row → level up; 3 wrong-first-try in a row on one type → "reinforce" mode (`st.reinforce = {type, left}`) which serves easy variants of that type until enough corrects; no level-ups while reinforcing. Stats count each exercise once: `c` if solved on the first try, `w` otherwise (later retries don't double-count).
- **Persistence:** one `localStorage` key per child — `math_app_noa`, `math_app_raz`, `math_app_tzuri` — holding the full state from `defaultState(profile)`. `loadState` merges over defaults so adding new state fields is backward-compatible. Sessions are 10 exercises; `session.done` persists so a child resumes mid-session. **Track migration:** if the saved `trackVersion` differs from the profile's, `loadState` keeps stars/bestStreak/stats (collection derives from stars) but resets level to `startLevel` and clears session/reinforce — this is how restructuring a child's levels array stays safe against stale saved level indexes.
- **RTL/LTR:** the document is `dir="rtl"`, but arithmetic lines render inside `.exline` which forces `direction:ltr` so `3 + 4 = ?` reads left-to-right. The minus sign is `−` (U+2212), multiplication `×`, division `÷` — the test validates any `line` containing `=` by substituting the answer for `?`, converting those symbols, and evaluating both sides (handles order-of-operations lines with parentheses too). Inline math inside Hebrew hint text is wrapped in `<span dir="ltr">`.
- **Parent screen** is gated by a multiplication question (`CONFIG.parentQuestions`) and reads all three profiles' stats directly from localStorage; profile reset is a two-tap confirm.
