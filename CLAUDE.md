# Mystery Face

Tim's original ask-and-flip face guessing game (an original game, not Hasbro's: no Hasbro name, art or look).
Online with a friend (friend rooms only, no strangers, no computer player) or two players on one screen.
Read `progress.md` first.

## Layout
- `index.html`, `css/style.css` (Hub navy-slate tokens), `js/app.js` (the page), `js/engine.js` (pure rules,
  the `game` object the shared online kit runs), `js/faces.js` (decks, custom people, photo shrinking),
  `js/people.js` (People tab), `js/account.js` (Firebase Auth + saved sets), `js/kit.js` (achievements,
  rules sheet, quick questions).
- Kit copies, never edit here: `js/online.js` (../_online), `js/fx.js`, `js/coach.js` + `css/coach.css`,
  `js/profile.js` + `css/profile.css`, `js/pwa.js` + `sw.js` + `tools/make-icons.mjs` + `tools/pwa-check.mjs`,
  `js/table.js` + `css/table.css`. Update by copying the kit's new version in.
- `decks/<id>/deck.json` + `decks/index.json` + `CREDITS.md` belong to the deck builder; `decks/sample/` is
  the placeholder (`tools/make-sample-deck.mjs`).

## Rules for this game
- The turn order is strict (Tim): P1 asks, P2 answers, P1 flips then Done, P2 asks, and so on. A final
  guess replaces asking (or Done).
- Secrets never enter shared state: each phone keeps its face + salt (`mystery-face:sec:<code>:<round>`),
  the room holds only `sha256('mf1|face|salt')`. Flips stay on the phone; only the "left" count is shared.
- Custom people belong to the user's account (Firestore `games/mystery-face/users/{uid}/sets/{setId}`,
  owner-only, rules in `../_online/firestore.rules`). Signed out they stay on the device.
- All user text goes through `esc()`.

## Tests
- `node --test` (rules engine, fail-first). `node tests/two-browsers.mjs [url]` plays a real online game
  against th-board-games (serve the folder first). `node tools/pwa-check.mjs` checks offline + fresh builds.
