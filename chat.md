# Mystery Face: session log

## 2026-11-24: out of faces + group Sort/View
- **Asked:** a notice when swapping runs out of new faces with Recycle or Remove; one Sort button (Smart / Sort all); a View button per group.
- **Built:** engine `stuck` + `recycle`/`remove` swap options (4 new fail-first tests), stuck box, Sort chooser, View overlay. b7b4ff7, live.
- **Verified:** `node --test` 67/67; headless WebKit iPhone flow (box shows, Remove 24→22, Recycle clears stuck, no console errors); View grid at 393px.
- **Open:** online two-browser check of the box; laptop View.

## 2026-11-06: first build (builder A)
- **Asked:** the whole game site: online with a friend (rooms, no strangers), same screen with look-away picking, decks + custom people, accounts, "don't know" phase, strict ask/answer/flip turns.
- **Built:** engine + tests, app (Play / People / Settings), accounts (Google + email), owner-only Firestore rules for saved sets (in `_online`, deployed), sample deck, PWA, icons.
- **Verified:** `node --test` 16/16; `tests/two-browsers.mjs` on live th-board-games (WebKit, custom 24-photo set, 3 strict turns, right guess, both locks match, rematch swaps starter, host leave closes room); same-screen flow headless at 393/320/landscape/laptop; account move + rename-later with the test account; pwa-check 18/18 (with a deck index).
- **Open:** merge with builder B's decks; Tim's calls on name/look/wording.
