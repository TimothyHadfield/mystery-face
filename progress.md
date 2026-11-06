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
| PWA | 18/18 with a deck index present (17/18 while `decks/index.json` is missing: 404 noise) |
| Live | not deployed (manager merges) |

## Authorized next steps
- (2026-11-06) Manager merges branch `app` + builder B's decks; merge `_online` branch `mystery-face-sets`.

## Standing instructions (Tim's words)
- "remember the style of play is user 1 asks a question, user 2 answers, user 1 flips people, user 2 asks a question, and continue."
- "attatch the custome people with a user's account that they make. If the user makes a custome person without a name then also allow them to add their name in later if they need."
- "If the game randomly shows a character that the suer doesn't know, have a "doesn't know" phase before the game starts where the users both selecte any characters they don't know and the game gives new ones."

## Traps
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

## NOT verified
- Google sign-in popup (needs a real Google account in a real browser); email sign-in verified.
- Real iPhone (only WebKit headless); real Safari photo picking/camera.
- Builder B's real decks in the UI (only the sample deck).

## Rejected / parked
- (none yet)
