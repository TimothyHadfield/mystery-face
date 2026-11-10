# Mystery Face: progress

## START HERE
Read this file, then `CLAUDE.md`, then `docs/library-plan.md` (groups + deck format + smart sort), then `js/engine.js` (the rules). Last updated: 2026-11-10 (library expansion live, 990eaae).

## Goal right now
Big face library: 91 groups / ~4,240 faces, group browser, smart know/don't-know sorting. Live; waiting on Tim's feedback.

## Status
| Part | State |
|---|---|
| Rules engine (`js/engine.js`) | done, unit tests |
| Online with a friend | done, `tests/two-browsers.mjs --deck` passes |
| Same screen | done |
| "Don't know" phase | done (decks only; custom sets skip it) |
| Custom people + accounts | done; Google + email sign-in; sets saved per account |
| Face memory + deal | done; repeat fix 2026-11-10 (old faces before last game's) |
| Library (2026-11-10) | live: 7 first decks (now with fame, 41 faces re-centred) + 84 groups: sports 15, history/science/books 20, film/music/internet 21, characters/animated/games 28. `tools/groups/<family>.py/.txt` build them; `tools/deck-index.py` writes the index + checks (0 problems); then `tools/deck-credits.py` |
| Group browser | live: "+ Groups" by the Faces label; search at top (name matches first, then "Has someone by that name"); Broad / Specific sorted by "you know ~X%"; Add / Sort / Sort all |
| Smart sorter | live: threshold search on fame (~4 cards per 40 people), franchise = one unit (Harry Potter = 1 card); "Sort all" = every face (Tim, 2026-11-09) |
| Tests | `node --test` 63/63; pwa-check 17/18 (known WebKit image noise) |
| Live | https://timothyhadfield.github.io/mystery-face/ @ 990eaae |

## Authorized next steps
- (none open) Library expansion done 2026-11-10. Worktrees `C:/Users/timha/AppData/Local/Temp/claude/wt/mystery-face-*` merged; removal failed (lock), weekly sweep cleans them.

## Standing instructions (Tim's words)
- "remember the style of play is user 1 asks a question, user 2 answers, user 1 flips people, user 2 asks a question, and continue."
- "attatch the custome people with a user's account that they make. If the user makes a custome person without a name then also allow them to add their name in later if they need."
- "If the game randomly shows a character that the suer doesn't know, have a "doesn't know" phase before the game starts where the users both selecte any characters they don't know and the game gives new ones."
- (2026-11-09) Library: "a long list of very specific groups that you chane browse through and add to the main screen ... minimize the number of characters it shows the user as much as possible while still being good at predicting who that user knows ... sort the groups by how well that user knows the characters in that group ... Make sure there's a search bar at the top of the group selection." Full quote in `docs/library-plan.md`.
- (2026-11-09) "also allow the user to sort every single character from a specific group if they want to do that."

## Traps
- `renderGame` must never rebuild the ask dock while the same ask step is on screen (keeps `.dock.askdock`, data-k); `U.qDraft` restores typed text. `tests/two-browsers.mjs --deck` checks it; its default custom-set mode is stale.
- WebKit logs deck-image "access control checks" errors on reload (old too; pwa-check 17/18).
- `online.js` caches the signed-in user: the app drops the online instance when the account changes outside a room, and waits for `authStateReady`.
- online.js `start()` only works from the lobby, so rematches happen inside the engine (`again`).
- `turnTimeoutSec: 0`: no computer takes over an away seat.
- Safari can't encode WebP: photos fall back to JPEG (cap 14,000 data-URL chars each).
- Imports must use one URL per module (no `?v=` on local imports), or faces.js state splits in two.
- Assumed known/unknown marks are never stored: `sorter.js` derives them from real answers (`withAssumed`), memory format unchanged. Answers shared across groups by name key.
- sw.js precaches only `decks/index.json`; the app warms at most 400 images itself.
- Engine fill order: old faces at franchise caps 1/2/∞ before any recent face. Loosening this brings repeats back.
- Never commit a builder's `decks/index.json` / `credits.txt`; regenerate after merging.
- Test account: `claude-test-mysteryface@example.com` (email/password, th-board-games). Password in `.claude/test/` (gitignored).

## Decisions
- Friend rooms only; 2 seats; host waits for the friend before Start.
- Custom set online: host sends at most N people in the room options; deleted with the room.
- Same screen: the app answers "is that my face?" itself.
- Turn timer is advisory.
- Face memory: localStorage `mystery-face:memory` + account `_memory` doc; merge = union, unknown wins.
- Deal: unknown never dealt unless the board can't fill; ~70% known / ~30% unused; 1 per franchise, never one actor twice.
- Smart sort: units ranked by fame (franchise = one unit in character groups); stop at a gap of 3 people / 1 franchise or 6 cards; real answers beat assumptions; missing fame = deck order.
- Broad groups: "All <category>" per category + the old 7 decks. Added groups saved in settings (`added`); none saved = the old 7. Pool capped at 1500.
- Fame = 12-month English Wikipedia pageviews ranked within the group (spikes capped by the history builder; ~85 character values estimated, marked in tools/groups/characters.py output).
- Content: no minors, dictators, people known mainly for crimes/abuse (O.J., Tyson, Kanye, Diddy, Gaiman, etc. left out). Kept (flagged to Tim): Michael Jackson, Columbus, Marx, Ayn Rand, Marjorie Taylor Greene, Valorant/Apex "hero shooters" group (mostly estimated fame).
- Plain UI choices (Tim may change): "+ Groups" link, "All <category>" names, Broad/Specific headings.

## NOT verified
- Real iPhone (WebKit headless only), real finger swipe in the sorter, account sync of sorted faces signed in.
- Google sign-in popup.
- Weak pictures left: Wii Fit Trainer, Vegeta/Beavis slightly cut, Sauron small, dark Lumière/Smaug/Totoro/Chernabog, Teen Titans "WIKI" logo, Kurt Cobain blurry, some NFL helmets.
- Team names in sports `from` are as of late 2026.

## Rejected / parked
- (none yet)
