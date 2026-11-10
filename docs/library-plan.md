# Library expansion plan (2026-11-09)

## Tim's words
> "I think the biggest improvement on the app right now is expanding the characters and groups by a lot. I think there should be a long list of very specific groups that you chane browse through and add to the main screen. Here are some examples: NBA Players, Disney Princesses, Presidents, Marvel Characters, Famous Scientists, Famous Authors, Harry Potter Characters, etc. Because we're expanding our total list of characters so much, we won't be able to have a user go through all of them with the "know/don't know" sorting. Instead, we need to make a smarter, algorithmic sorting where it shows the user specific characters and then makes decisions based on it through assumptions, for example, if the user knows niche presidents from the 1830s, then they will also know current and more recent presidents. If they know lesser-known NBA players, they'll know the big names aswell. I think a good idea is to rate every character on how well known they are within that specific group and then assume that the user knows any character that much more well known than them, and then keep giving characters to the player until the game finds the mark on which characters that user knows/doesn't know. Another thing is specific groups, for example if a user is familiar with a character from a specific game/TV show/movie/book, then they'll very likely know all the characters from that movie or book, so you only need to show maybe 1-2 characters for that group. Come up with the algorithm however you want, but try to minimize the number of characters it shows the user as much as possible while still being good at predicting who that user knows. Then when showing the list of specific groups, sort the groups by how well that user knows the characters in that group. Again, work on expanding the groups of people the most. Right now when I play nearly all the characters that are shown were in the last game I played too (in "movie characters" for example). Also make more generalized groups aswell, like how it is now with "movie characters", "cartoons", "animated", "sports", etc. Make sure there's a search bar at the top of the group selection. Also some of the character's picture isn't centered which makes their face or picture not shown well. Expanding our library so much is going to take a lot of work so I would recommend deploying many sub-agents to build it all."

## What gets built
1. **Many specific groups** (target 60+ groups, 2,000+ faces), each its own deck `decks/<groupId>/`.
2. **Broad groups** = every group in one category (Sports, History & Politics, ...), made in the app, plus the 7 first decks kept as they are (saved face memory uses their ids).
3. **Group browser**: search bar at the top, every group (broad + specific), sorted by how well this user knows it; tap to add a group to / remove it from the main Play screen.
4. **Smart sorting**: a fame score per person within the group; a threshold search per group; franchise shortcuts for characters. Few cards shown, the rest assumed.
5. **Centred pictures**: re-crop the off-centre faces (first decks + all new ones checked on contact sheets).

## Deck format (shared contract: every builder follows it exactly)
`decks/<groupId>/deck.json`:
```json
{ "id": "nba", "title": "NBA Players", "cat": "sports",
  "people": [ { "id": "lebron-james", "name": "LeBron James", "from": "Los Angeles Lakers",
    "gender": "m", "kind": "sports", "tags": ["sports", "nba"], "fame": 100, "pv": 9123456,
    "img": "img/lebron-james.webp",
    "credit": { "author": "...", "license": "CC BY-SA 4.0", "licenseUrl": "...", "source": "https://commons.wikimedia.org/wiki/File:..." } } ] }
```
- `id`: lowercase a-z 0-9 and `-`, at most 40 chars; group ids unique across the repo.
- `cat`: one of `sports, politics, science, books, film, music, internet, characters, animated, games` (`mix` is Mixed stars only). Display names (app): Sports · History & Politics · Science & Inventors · Books & Art · Movie & TV stars · Music · Internet & Business · Movie & TV characters · Animated & Cartoons · Video games.
- `from`: short context (team, show, era, book), at most 40 chars.
- `kind`: same words as now: actor, music, sports, politics, history, internet, tv, character, art (science people use `history`, authors `art`).
- `pv`: English Wikipedia pageviews over the last 12 full months (Wikimedia REST API `metrics/pageviews/per-article/en.wikipedia/all-access/user/<title>/monthly/<from>/<to>`, free, send a User-Agent). For a character with no article of its own, use its fandom-wiki page views if available, else the character's own section/article on Wikipedia, else estimate from its film's pageviews and mark it in the builder's report.
- `fame`: 1–100 within this group, from `pv` rank: `fame = round(1 + 99 * (n-1-rank)/(n-1))` with rank 0 = most viewed. A builder may move someone by hand when pageviews clearly mislead (e.g. a namesake) and says so in its report.
- `franchise` (required for `characters`, `animated`, `games`): the film/show/book/game series the character is from, spelled the same everywhere (e.g. `Harry Potter`, `Toy Story`). Real people may carry `team` / `era` in `from` only.
- `sub` for characters: `animated` or `live`. `actor` for live-action characters, as now.
- Picture: 256×256 WebP, face centred (eyes about 40% from the top, the whole face visible, not cut), at most 20 KB (aim for 14 KB). Real people: free-licence Wikimedia Commons only (same rules as `tools/deck-fetch.py`). Characters: the studio's official image from the franchise's fandom wiki, credit `{author: studio, license: "© owner, fan use", source: wiki page}` (same as the current Movie characters deck).
- Group size: 25–60 people. Specific groups must include both the household names and the deeper cuts (that spread is what makes the threshold search work).
- Content rules (unchanged from `tools/deck-people.txt`): no one under 18; no dictators; skip people known mainly for major criminal or abuse controversies; politicians balanced across parties; current world leaders only where uncontroversial. US Presidents may be all of them (historical office).
- `python -I tools/deck-index.py --check <ids>` must pass. **Never commit `decks/index.json` or `decks/credits.txt`**: the manager regenerates both after merging (`tools/deck-index.py`, then `tools/deck-credits.py`).

`decks/index.json` (generated): `[{ id, title, cat, count, broad, preview: [4 img paths, most famous first] }]`.

## Smart sorting (algorithm)
- **Per group threshold search.** People sorted by `fame`. Show the person at the middle of the unknown range. Know → everyone at least as famous is assumed known; Don't know → everyone at most as famous is assumed unknown. Repeat until the gap is small (about 3 fame ranks) or 4–5 cards were shown. Expected ~log2(n) ≈ 4–6 cards for 40 people; stop early when the first card is "Don't know" on the top person (the whole group unknown) or "Know" on the bottom one.
- **Franchise shortcut** (character groups): treat each franchise as one unit ranked by its best-known character; search over franchises; a "Know" on any character marks the whole franchise known (except its very low-fame members, which stay "assumed" and get one check only when cheap); "Don't know" on the franchise's best-known face marks it unknown.
- **Shared people.** The same person in several groups (name key) carries one answer everywhere.
- **Assumed vs answered.** Inferred marks are stored as assumptions; a real answer (sorter or the in-game "Don't know" phase) always wins, and a contradiction narrows that group's threshold again.
- **Familiarity of a group** = share of its people known (answered or assumed); unsorted groups count as unknown but sort after sorted ones of equal score (or by average fame, so popular groups come first).
- Measured with a simulated-user test: users with a random threshold per group and random known franchises; report average cards shown per group and accuracy (target: ≤ 6 cards per 40-person group, ≥ 90% correct).

## Fewer repeats
- Pick from every added group, rotate by "games since last seen" (the existing memory weight), and enlarge the pool by default (Tim saw the same Movie characters each game: the deck had 92 faces and one per franchise).

## Phones and free tier
- Load `decks/index.json` only at start; a group's deck.json loads when it's added, browsed or dealt. Never prefetch all images; the service worker caches what was shown.
- GitHub Pages: 2,500 × ~15 KB ≈ 40 MB in the repo, fine (limit 1 GB).

## Who builds what (wave 1, five builders)
| Builder | Owns |
|---|---|
| app | `js/*` (not the kit copies), `css/style.css`, `index.html`, `tests/*`, the group browser, the smart sorter, lazy loading |
| sports | `decks/<sports group ids>/`, `tools/groups/sports.*` |
| history | politics, science, books & art groups, `tools/groups/history.*` |
| stars | film, music, internet groups; fame for the 7 first decks; re-crop real-person pictures in the first decks; `tools/groups/stars.*` |
| characters | characters, animated, games groups; re-crop `decks/characters/img` + `decks/cartoons/img`; `tools/groups/characters.*` |
