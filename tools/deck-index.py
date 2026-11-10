"""Write decks/index.json from every decks/<id>/deck.json, and check each deck against the
group format in docs/library-plan.md.

Usage: python -I tools/deck-index.py           (writes decks/index.json, prints problems)
       python -I tools/deck-index.py --check   (only checks; exit 1 if any deck is broken)
       python -I tools/deck-index.py --check nba presidents   (check just these decks)
Builders: run --check on your own decks; never commit decks/index.json (the manager regenerates it).
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKS = os.path.join(ROOT, "decks")
# the first decks (2026-11-06); they stay as broad groups so saved face memory keeps working
LEGACY = {"mixed": "mix", "movies": "film", "characters": "characters", "music": "music",
          "sports": "sports", "history": "politics", "cartoons": "animated"}
CATS = ["mix", "sports", "politics", "science", "books", "film", "music", "internet",
        "characters", "animated", "games"]
CHARACTER_CATS = {"characters", "animated", "games"}
ID = re.compile(r"^[a-z0-9-]{1,40}$")


def check(did, d):
    bad = []
    if did not in LEGACY:
        if d.get("id") != did:
            bad.append("id field must be %r" % did)
        if d.get("cat") not in CATS:
            bad.append("cat must be one of %s" % CATS)
        if not d.get("title"):
            bad.append("missing title")
    people = d.get("people") or []
    if did not in LEGACY and len(people) < 12:
        bad.append("only %d people (a group needs at least 12)" % len(people))
    seen = set()
    for p in people:
        who = p.get("id", "?")
        if not ID.match(str(p.get("id", ""))):
            bad.append("%s: bad id" % who)
        if who in seen:
            bad.append("%s: duplicate id" % who)
        seen.add(who)
        if not p.get("name"):
            bad.append("%s: no name" % who)
        img = p.get("img")
        if not img or not os.path.exists(os.path.join(DECKS, did, img)):
            bad.append("%s: picture missing" % who)
        elif os.path.getsize(os.path.join(DECKS, did, img)) > 20000:
            bad.append("%s: picture over 20 KB" % who)
        if p.get("gender") not in ("f", "m", "x"):
            bad.append("%s: gender must be f/m/x" % who)
        if not p.get("kind"):
            bad.append("%s: no kind" % who)
        c = p.get("credit") or {}
        if not (c.get("author") and c.get("license") and c.get("source")):
            bad.append("%s: credit needs author, license, source" % who)
        fame = p.get("fame")
        if not isinstance(fame, int) or not 1 <= fame <= 100:
            bad.append("%s: fame must be an int 1-100" % who)
        if did not in LEGACY and not isinstance(p.get("pv"), int):
            bad.append("%s: pv (12-month pageviews) must be an int" % who)
        if (d.get("cat") or LEGACY.get(did)) in CHARACTER_CATS and not p.get("franchise"):
            bad.append("%s: characters need a franchise" % who)
    return bad


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only_check = "--check" in sys.argv
    rows, problems = [], 0
    for path in sorted(glob.glob(os.path.join(DECKS, "*", "deck.json"))):
        did = os.path.basename(os.path.dirname(path))
        if did == "sample" or (args and did not in args):
            continue
        d = json.load(open(path, encoding="utf-8"))
        bad = check(did, d)
        if bad:
            problems += len(bad)
            print("%s: %d problem(s)" % (did, len(bad)))
            for b in bad[:30]:
                print("   ", b)
        ppl = d.get("people") or []
        top = sorted(ppl, key=lambda p: -(p.get("fame") or 0))
        rows.append({"id": did, "title": d.get("title") or did, "cat": d.get("cat") or LEGACY.get(did, "mix"),
                     "count": len(ppl), "broad": did in LEGACY,
                     "preview": [p["img"] for p in top if p.get("img")][:4]})
    if only_check:
        print("checked %d deck(s), %d problem(s)" % (len(rows), problems))
        sys.exit(1 if problems else 0)
    # Mixed stars first (the default), then the old broad decks, then the groups by category and title
    rows.sort(key=lambda r: (r["id"] != "mixed", not r["broad"], CATS.index(r["cat"]) if r["cat"] in CATS else 99, r["title"].lower()))
    json.dump(rows, open(os.path.join(DECKS, "index.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
    print("wrote decks/index.json: %d decks, %d people, %d problem(s)" % (len(rows), sum(r["count"] for r in rows), problems))


if __name__ == "__main__":
    main()
