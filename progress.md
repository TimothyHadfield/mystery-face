# Mystery Face: progress

## START HERE
Read this file, then `CLAUDE.md`, then `js/engine.js` (the rules). Last updated: 2026-11-06 (builder A, first build).

## Goal right now
First version: online with a friend + same screen, celebrity decks (builder B, parallel), custom people on accounts.

## Status
| Part | State |
|---|---|
| Rules engine (`js/engine.js`) | done, 16 unit tests |
| Online with a friend | done, two-browser test passes on live th-board-games |
| Same screen | done, driven headless to the end of a round |
| "Don't know" phase | done (decks only; custom sets skip it) |
| Custom people + accounts | done; Google + email sign-in; sets saved per account |
| Decks | `decks/sample/` placeholder only; real decks come from builder B |
| Face memory + smarter Mixed deal | done on branch v4-memory (2026-11-06): known/unknown/unused + games since, per device + account `_memory` doc; Mixed shares, franchise/actor caps; 12 new tests |
| Sort faces | done on branch v5-sort (2026-11-06): "Sort faces · N new" link by the Faces label opens `js/sorter.js`; ←/→ keys, buttons, swipe; undo; unused first, one card per person; then re-check don't-knows; 4 new tests |
| PWA | 18/18 with a deck index present (17/18 while `decks/index.json` is missing: 404 noise) |
| Live | not deployed (manager merges) |

## Authorized next steps
- (2026-11-06) Manager merges branch `app` + builder B's decks; merge `_online` branch `mystery-face-sets`.

## Standing instructions (Tim's words)
- "remember the style of play is user 1 asks a question, user 2 answers, user 1 flips people, user 2 asks a question, and continue."
- "attatch the custome people with a user's account that they make. If the user makes a custome person without a name then also allow them to add their name in later if they need."
- "If the game randomly shows a character that the suer doesn't know, have a "doesn't know" phase before the game starts where the users both selecte any characters they don't know and the game gives new ones."

## Traps
- (2026-11-09) `renderGame` must never rebuild the ask dock while the same ask step is on screen: it keeps the old `.dock.askdock` (data-k = kind:code:round:log length:turn) and swaps only the rest, else every room update wipes and blurs `#qIn` (Tim's bug). `U.qDraft` restores typed text after a full redraw. `tests/two-browsers.mjs --deck` checks it; the default (custom-set) mode of that test is stale (stops at "pick"), and WebKit logs deck-image "access control checks" errors on reload (also on old code, pwa-check 17/18).
- `online.js` caches the signed-in user: the app throws the online instance away when the account changes outside a room, and waits for `authStateReady` before making or joining a room.
- online.js `start()` only works from the lobby, so rematches happen inside the engine (`again`).
- `turnTimeoutSec: 0`: no computer takes over an away seat; if a computer ever sits in, it quits the game.
- Safari can't encode WebP: photos fall back to JPEG (cap 14,000 data-URL chars each).
- Imports must use one URL per module (no `?v=` on local imports), or faces.js state splits in two.
- Test account: `claude-test-mysteryface@example.com` (email/password, on th-board-games). Password is not in this public repo; keep it in `.claude/test/` (gitignored).

## Decisions
- Friend rooms only; 2 seats; host must wait for the friend before Start.
- Custom set online: the host sends at most N people in the room options (≈165 KB for 24 photos); deleted with the room.
- Same screen: the app answers "is that my face?" itself (it knows both faces).
- Turn timer is advisory (counts down, beeps at 0, nothing else happens).
- Answer review flags only questions asked with a kind chip (tagged), checked against the revealed face.

- Face memory: `mystery-face:memory` in localStorage, and on the account as `games/mystery-face/users/{uid}/sets/_memory` (people = [one JSON string]); the existing rules allow it (emulator-checked), no rules change. Merge at sign-in: union, unknown wins, newest sighting kept (smallest games-since).
- Deal: unknown faces never dealt unless the board can't fill; ~70% known (weight (1+gamesSince)^1.5) / ~30% unused. Mixed stars: characters 42%, sports 17%, politics 12%, custom 17% (without custom 45/20/13), rest = actors/music/history/TV/internet/art; 1 per franchise, never one actor twice.
- Sort faces Know = `k[id] = 0` (memMarkKnown; real sightings are game 1+): the deal reads it as max(g, 20) games unused, so it's dealt soon; merge keeps 0. Don't know = memMarkUnknown. All copies of a person (same name key) are marked.
- Online: host's memory goes in the room options; each player's arrives with the quiet swap at each round's start (`seen`); the host engine ages both at the end of each don't-know phase for the rematch deal.

## NOT verified
- Account memory sync in a real signed-in browser (only the rules were emulator-checked; the code path load/merge/save ran nowhere live).
- Sort faces: real finger swipe on an iPhone (only synthetic pointer events in WebKit); account sync of sorted faces signed in.
- Old cached app builds would show the `_memory` doc as a junk set "memory" until they update.
- Google sign-in popup (needs a real Google account in a real browser); email sign-in verified.
- Real iPhone (only WebKit headless); real Safari photo picking/camera.
- Builder B's real decks in the UI (only the sample deck).

## Rejected / parked
- (none yet)
