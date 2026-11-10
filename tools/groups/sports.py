"""Build the specific sports groups (decks/<groupId>/) from tools/groups/sports.txt.

Usage:
  python -I tools/groups/sports.py fetch <cache_dir>          lead images, licences, downloads, pageviews
  python -I tools/groups/sports.py build <cache_dir> <yunet.onnx> <sheet_dir> [groupIds...]
Reuses tools/deck-fetch.py (get, slug, text, FREE) and tools/deck-build.py (crop, encode,
contact sheet) by import. Free-licence Wikimedia Commons pictures only; anyone without one is skipped.
pv = English Wikipedia user pageviews, 2025-11 .. 2026-10 (12 full months); fame from pv rank.
"""
import importlib.util, json, os, re, shutil, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fetch = _load("deckfetch", "deck-fetch.py")
PV_FROM, PV_TO = "2025110100", "2026103100"


def load_groups():
    groups, cur = [], None
    for line in open(os.path.join(HERE, "sports.txt"), encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if line.startswith("@"):
            gid, title, g, tag = parts[0][1:].strip(), parts[1], parts[2], parts[3]
            cur = {"id": gid, "title": title, "gender": g, "tag": tag, "people": []}
            groups.append(cur)
            continue
        title, frm = parts[0], parts[1]
        name = re.sub(r"\s*\(.*\)$", "", title)
        p = {"title": title, "name": name, "id": fetch.slug(name)[:40], "from": frm[:40], "gender": cur["gender"]}
        for extra in parts[2:]:
            if extra.startswith("g="):
                p["gender"] = extra[2:]
            elif extra.startswith("file="):
                p["file"] = extra[5:]
            elif extra.startswith("crop="):
                p["crop"] = [float(v) for v in extra[5:].split(",")]
        cur["people"].append(p)
    return groups


def all_people(groups):
    by = {}
    for g in groups:
        for p in g["people"]:
            q = by.setdefault(p["title"], dict(p))
            for k in ("file", "crop"):
                if k in p:
                    q[k] = p[k]
    return by


def do_fetch(cache):
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    meta_path = os.path.join(cache, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    people = all_people(load_groups())
    titles = list(people)

    # 1. canonical title + free lead image (40 titles a request)
    todo = [t for t in titles if t not in meta or meta[t].get("want") != people[t].get("file")]
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "pageimages",
                                    "piprop": "name", "pilicense": "free", "titles": "|".join(batch)})
        d = fetch.get("https://en.wikipedia.org/w/api.php?" + q)["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for n in d.get(k, []):
                alias[n["from"]] = n["to"]
        pages = {pg["title"]: pg for pg in d["pages"].values()}
        for t in batch:
            c = t
            while c in alias:
                c = alias[c]
            pg = pages.get(c, {})
            m = {"canon": c, "missing": "missing" in pg, "want": people[t].get("file")}
            m["file"] = people[t].get("file") or pg.get("pageimage")
            meta[t] = m
        time.sleep(0.5)

    # 2. Commons licence + thumb url (40 files a request)
    need = [t for t in titles if meta[t].get("file") and "license" not in meta[t]]
    for i in range(0, len(need), 40):
        batch = need[i:i + 40]
        files = {"File:" + meta[t]["file"].replace("_", " "): t for t in batch}
        q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "|".join(files), "prop": "imageinfo",
                                    "iiprop": "url|size|extmetadata", "iiurlwidth": 900})
        d = fetch.get("https://commons.wikimedia.org/w/api.php?" + q)["query"]
        norm = {n["to"]: n["from"] for n in d.get("normalized", [])}
        for pg in d["pages"].values():
            key = norm.get(pg["title"], pg["title"])
            ts = [t for f, t in files.items() if f == key or f == pg["title"]]
            for t in ts:
                m = meta[t]
                if "imageinfo" not in pg:
                    m["license"] = ""
                    m["drop"] = "file not on Commons"
                    continue
                ii = pg["imageinfo"][0]
                em = ii.get("extmetadata", {})
                lic = fetch.text(em.get("LicenseShortName", {}).get("value"))
                nonfree = fetch.text(em.get("NonFree", {}).get("value"))
                m.update({"license": lic, "licenseUrl": fetch.text(em.get("LicenseUrl", {}).get("value")),
                          "author": fetch.text(em.get("Artist", {}).get("value")) or fetch.text(em.get("Credit", {}).get("value")) or "Unknown",
                          "source": ii.get("descriptionurl"), "thumb": ii.get("thumburl") or ii.get("url")})
                m.pop("drop", None)
                if nonfree.lower() == "true" or not fetch.FREE.match(lic):
                    m["drop"] = "licence not free: " + lic
        time.sleep(0.5)
    for t in titles:
        m = meta[t]
        if m.get("missing"):
            m["drop"] = "no Wikipedia article"
        elif not m.get("file"):
            m["drop"] = "no free lead image on Wikipedia"

    # 3. downloads
    for t in titles:
        m = meta[t]
        if m.get("drop"):
            continue
        out = os.path.join(cache, "src", fetch.slug(t) + ".img")
        if os.path.exists(out) and m.get("got") == m["file"]:
            continue
        open(out, "wb").write(fetch.get(m["thumb"], binary=True))
        m["got"] = m["file"]
        print("got", t, m["license"], flush=True)
        time.sleep(0.3)
        json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    # 4. pageviews (12 full months)
    for t in titles:
        m = meta[t]
        if m.get("missing") or "pv" in m:
            continue
        art = urllib.parse.quote(m["canon"].replace(" ", "_"), safe="")
        url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/%s/monthly/%s/%s"
               % (art, PV_FROM, PV_TO))
        try:
            items = fetch.get(url, tries=3)["items"]
            m["pv"] = int(sum(it["views"] for it in items))
            m["months"] = len(items)
        except Exception as e:
            print("  pv failed", t, e)
        time.sleep(0.2)
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    drops = {t: m["drop"] for t, m in meta.items() if t in people and m.get("drop")}
    print("people", len(titles), "dropped", len(drops))
    for k, v in drops.items():
        print("  DROP", k, "-", v)


def do_build(cache, model, sheets, only):
    import cv2
    from PIL import Image
    build = _load("deckbuild", "deck-build.py")
    os.makedirs(sheets, exist_ok=True)
    meta = json.load(open(os.path.join(cache, "meta.json"), encoding="utf-8"))
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    flags, dropped, summary = [], [], []
    for g in load_groups():
        if only and g["id"] not in only:
            continue
        gdir = os.path.join(ROOT, "decks", g["id"])
        shutil.rmtree(gdir, ignore_errors=True)
        os.makedirs(os.path.join(gdir, "img"))
        people, seen = [], set()
        for p in g["people"]:
            m = meta.get(p["title"], {})
            if p["id"] in seen:
                dropped.append((g["id"], p["name"], "duplicate in group"))
                continue
            seen.add(p["id"])
            if m.get("drop") or "pv" not in m:
                dropped.append((g["id"], p["name"], m.get("drop", "no pageviews")))
                continue
            im = build.load_image(os.path.join(cache, "src", fetch.slug(p["title"]) + ".img"))
            W, H = im.size
            note = ""
            if "crop" in p:
                cx, cy, head = p["crop"]
                box = build.square(im, cx * W, cy * H, head * W * 1.7)
                note = "manual crop"
            else:
                faces = build.detect(det, im)
                if faces:
                    sc, fx, fy, fw, fh = faces[0]
                    box = build.square(im, fx + fw / 2, fy + fh * 0.42, max(fw, fh) * 2.1)
                    if fw < 60:
                        note = "small face %dpx" % fw
                    if len(faces) > 1 and faces[1][3] * faces[1][4] > 0.35 * fw * fh:
                        note += " multiple faces"
                    if sc < 0.8:
                        note += " low score %.2f" % sc
                else:
                    side = min(W, H)
                    box = build.square(im, W / 2, side / 2, side)
                    note = "NO FACE FOUND"
            tile = im.crop(tuple(int(round(v)) for v in box)).resize((build.SIZE, build.SIZE), Image.LANCZOS)
            data, _ = build.encode(tile)
            open(os.path.join(gdir, "img", p["id"] + ".webp"), "wb").write(data)
            if note.strip():
                flags.append((g["id"], p["name"], note.strip()))
            people.append({"id": p["id"], "name": p["name"], "from": p["from"], "gender": p["gender"], "kind": "sports",
                           "tags": ["sports", g["tag"]], "pv": m["pv"], "img": "img/%s.webp" % p["id"],
                           "credit": {"author": m["author"], "license": m["license"], "licenseUrl": m.get("licenseUrl", ""),
                                      "source": m["source"]}})
        n = len(people)
        for rank, e in enumerate(sorted(people, key=lambda e: -e["pv"])):
            e["fame"] = round(1 + 99 * (n - 1 - rank) / (n - 1)) if n > 1 else 100
        people.sort(key=lambda e: -e["fame"])
        deck = {"id": g["id"], "title": g["title"], "cat": "sports", "people": people}
        json.dump(deck, open(os.path.join(gdir, "deck.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
        summary.append((g["id"], g["title"], n))
        for k in range(0, n, 40):
            build.contact_sheet(os.path.join(ROOT, "decks"), g["id"], "%s %d-" % (g["title"], k), people[k:k + 40],
                                os.path.join(sheets, "sheet-%s-%d.png" % (g["id"], k // 40 + 1)), k)
    for s in summary:
        print("GROUP", *s)
    print("TOTAL", sum(s[2] for s in summary))
    print("DROPPED", len(dropped))
    for r in dropped:
        print("  ", r)
    print("FLAGS", len(flags))
    for r in flags:
        print("  ", r)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    if sys.argv[1] == "fetch":
        do_fetch(sys.argv[2])
    else:
        do_build(sys.argv[2], sys.argv[3], sys.argv[4], set(sys.argv[5:]))
