# Notes for Claude

This repo is the public website for a D&D 5e campaign where Claude is the Dungeon Master. It's served by GitHub Pages (Jekyll) at https://devinc0922-prog.github.io/dndadventures/.

## Hard rule: nothing secret goes in this repo

The repo and site are public. Only commit player-facing material: recaps of what happened, NPCs the party has met, loot, house rules. Never commit hidden plot, upcoming encounters, NPC secrets, trap locations, or monster stats.

## Layout

- `_sessions/` — one Markdown file per session recap. Format in `SESSION-TEMPLATE.md`. Shown on `/log/` and the home page.
- `rules.md` — house rules and the drop-in/drop-out policy.
- `party/` — sign-in, roster, new character, DM's player list (Firebase).
- `sheet/` — the character sheet page. `?id=<firestore id>` for a real character, `?demo=sample-fighter` for the offline demo.
- `assets/sheet/sheet-engine.js` + `sheet.css` — the sheet. Renders any character from a build JSON.
- `assets/js/app.js` — Firebase auth and Firestore helpers. `firebase-config.js` holds the web app config.
- `firestore.rules` — security rules (members allowlist; owners edit their own characters, the DM edits all).

Character data is NOT in this repo. It lives in Firestore (`characters/{id}` with `build` and `state` stored as JSON text).

## Common jobs

- **Write a session recap:** add `_sessions/YYYY-MM-DD-slug.md` following `SESSION-TEMPLATE.md`, number sessions in order, commit to `main`.
- **Write or level up a character build:** follow `BUILD-FORMAT.md`. Give the JSON to the player to paste into their sheet (Party page for new characters, sheet → Gear & notes → Edit build for changes). Do the math right: attack bonus = ability mod + proficiency (+ magic), spell DC = 8 + prof + mod.
- **Change the sheet:** edit `assets/sheet/sheet-engine.js`. Keep it a plain script (no build step) and keep all user text escaped through `esc()`/`rich()`.
