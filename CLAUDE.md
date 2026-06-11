# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hebrew math practice app for three specific kids (נעה/noa — 3rd grade, רז/raz — 1st grade, צורי/tzuri — kindergarten). The entire app is a single `index.html` file (HTML + CSS + JS, no external dependencies, works offline from `file://`). All UI text is Hebrew, feminine address forms ("נסי", "לחצי").

## Commands

- **Run tests:** `node _logic_test.js` — extracts the pure-logic section out of `index.html` and validates exercise generation (thousands of exercises per type: no negative subtraction results, no division remainders, choice options contain the answer exactly once) plus the adaptive level/reinforce state machine. Run this after any change to `CONFIG` or the exercise generators.
- **Open the app:** `Start-Process index.html`, or in a browser at https://dyfroman.github.io/math-app/.
- **Render smoke test:** headless Edge screenshot, e.g.
  `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --window-size=480,860 --screenshot=out.png "file:///C:/Users/dyfro/Desktop/math-app/index.html#noa"`
  The URL hash (`#noa`, `#raz`, `#tzuri`) deep-links straight into a profile's game screen — used both for testing and as a feature.
- **Deploy:** push to `main`. GitHub Pages (repo `dyfroman/math-app`) serves the branch root automatically. `gh` CLI is **not** installed; GitHub API calls work via the token from `git credential fill`.

## Architecture

Everything lives in the single `<script>` block of `index.html`, split in two by comment markers:

1. **Pure logic** between `==LOGIC-START==` and `==LOGIC-END==` — `CONFIG`, `TYPE_NAMES`, `genExercise(type, easy)`, `updateProgress(...)`, `chooseType(...)`, `defaultState()`. This section must stay free of `document`/`window`/`localStorage` references: `_logic_test.js` extracts it by those markers and runs it under Node via `eval`. New helper functions used by generators belong here.
2. **DOM/interaction code** below the end marker — screens, rendering, sounds (Web Audio, generated in code — no audio files), effects, parent dashboard.

Key design points that span the file:

- **`CONFIG` drives everything.** Each profile has `levels: [{title, types: [...]}]`; each type string maps to a `case` in `genExercise` and a label in `TYPE_NAMES`. Adding a level or exercise type means touching those three places only. Type ids are unique per child even for similar skills (e.g. `add10` is Raz's numpad addition, `tadd10` is Tzuri's emoji-based choice addition) because the generator output format differs.
- **Exercise object contract:** `{type, mode: 'numpad'|'choice', prompt, line?, visual?, answer, options?, hint, emojiLine?}`. `mode` decides the input UI: Tzuri's profile only uses `choice` (big tap targets, no typing); Noa/Raz use `numpad`. In `numpad` mode the `?` in `line` is replaced by the answer box. `hint` is an HTML string shown only after the second wrong attempt; after 4 attempts the answer is revealed and the session moves on.
- **Adaptive flow** (`updateProgress`): 5 first-try corrects in a row → level up; 3 wrong-first-try in a row on one type → "reinforce" mode (`st.reinforce = {type, left}`) which serves easy variants of that type until enough corrects; no level-ups while reinforcing. Stats count each exercise once: `c` if solved on the first try, `w` otherwise (later retries don't double-count).
- **Persistence:** one `localStorage` key per child — `math_app_noa`, `math_app_raz`, `math_app_tzuri` — holding the full state from `defaultState()`. `loadState` merges over defaults so adding new state fields is backward-compatible. Sessions are 10 exercises; `session.done` persists so a child resumes mid-session.
- **RTL/LTR:** the document is `dir="rtl"`, but arithmetic lines render inside `.exline` which forces `direction:ltr` so `3 + 4 = ?` reads left-to-right. The minus sign is `−` (U+2212), multiplication `×`, division `÷` — the test's line parser expects exactly these. Inline math inside Hebrew hint text is wrapped in `<span dir="ltr">`.
- **Parent screen** is gated by a multiplication question (`CONFIG.parentQuestions`) and reads all three profiles' stats directly from localStorage; profile reset is a two-tap confirm.
