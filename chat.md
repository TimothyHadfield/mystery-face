# Mystery Face: session log

## 2026-11-06: first build (builder A)
- **Asked:** the whole game site: online with a friend (rooms, no strangers), same screen with look-away picking, decks + custom people, accounts, "don't know" phase, strict ask/answer/flip turns.
- **Built:** engine + tests, app (Play / People / Settings), accounts (Google + email), owner-only Firestore rules for saved sets (in `_online`, deployed), sample deck, PWA, icons.
- **Verified:** `node --test` 16/16; `tests/two-browsers.mjs` on live th-board-games (WebKit, custom 24-photo set, 3 strict turns, right guess, both locks match, rematch swaps starter, host leave closes room); same-screen flow headless at 393/320/landscape/laptop; account move + rename-later with the test account; pwa-check 18/18 (with a deck index).
- **Open:** merge with builder B's decks; Tim's calls on name/look/wording.
