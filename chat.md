# Mystery Face: session log

## 2026-11-28: fit pass (Tim, 2026-11-27: "make sure that they all are good in that aspect")
- **Asked:** every game: everything readable and on screen without scrolling, space shared well when crowded.
- **Found (measured, 30 longest names, 22 flipped, 16 questions):** every name cut to one line (30/30 on phone, 30/30 on laptop at 119 px tiles); each redraw (flip, face shown) drew the board at the 4 x 70 px default for a frame (board scrolled 347 px); the hidden-face "?" cover sat on the board's top-left corner; the question log's Close button below the screen; 32 px buttons; 320 px board scrolled.
- **Built:** fitBoards picks 1/2/3 name lines vs face size (cut names scored down), remembers the fit so redraws start right, faces 42 px on boards under 340 px; "Guess instead" moved into the question row (saves ~40 px); cover fix; log list scrolls inside its sheet; 36 px buttons. `tests/fit-ui.mjs`.
- **Verified:** fit-ui (WebKit, 5 sizes) fails on old code, passes now; `node --test` 67/67; pwa-check 17/18 (known image noise).
- **Open:** same screen at 320x568 with 30 faces still scrolls the board; sideways same screen keeps one name line.

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
