"""History / science / books groups for Mystery Face (list: tools/groups/history.txt).

Usage:
  python -I tools/groups/history.py fetch <cache_dir>                 lead images, licences, pageviews, downloads
  python -I tools/groups/history.py build <cache_dir> <yunet.onnx> [group ids...]
                                                                      writes decks/<id>/deck.json + img/ and
                                                                      contact sheets in <cache_dir>/sheets
Reuses get/slug/text/FREE from tools/deck-fetch.py and load_image/square/encode from tools/deck-build.py.
fame = round(1 + 99 * (n-1-rank)/(n-1)) by 12-month English Wikipedia pageviews (rank 0 = most viewed).
pv = the 12 full months' user pageviews, with any month above 3x the person's median month capped at 3x
(bot spikes: Ansel Adams showed 14.7M raw views).
"""
import importlib.util, json, os, re, shutil, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
PV_FROM, PV_TO = "20251101", "20261031"  # last 12 full months at build time (2026-11-09)


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fetch = _load("deckfetch", "deck-fetch.py")


def load_groups():
    groups, g = [], None
    for n, line in enumerate(open(os.path.join(HERE, "history.txt"), encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if line.startswith("@"):
            gid, title, cat, kind = parts[0][1:].strip(), parts[1], parts[2], parts[3]
            g = {"id": gid, "title": title, "cat": cat, "kind": kind, "people": []}
            groups.append(g)
            continue
        title, frm, gender = parts[0], parts[1], parts[2]
        p = {"title": title, "from": frm, "gender": gender, "line": n}
        for extra in parts[3:]:
            k, _, v = extra.partition("=")
            if k == "crop":
                p["crop"] = [float(x) for x in v.split(",")]
            elif k == "fame":
                p["fame"] = int(v)
            elif k in ("file", "name"):
                p[k] = v
        p["name"] = p.get("name") or re.sub(r"\s*\(.*\)$", "", title)
        p["id"] = fetch.slug(p["name"])[:40].strip("-")
        if len(frm) > 40:
            raise SystemExit("line %d: from is over 40 chars" % n)
        g["people"].append(p)
    return groups


def do_fetch(cache):
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    meta_path = os.path.join(cache, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    people = {}
    for g in load_groups():
        for p in g["people"]:
            people.setdefault(p["title"], p)
    titles = list(people)

    def save():
        json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    # 1. canonical title + free lead image, 40 titles per request
    need = [t for t in titles if t not in meta or "canon" not in meta[t]]
    for i in range(0, len(need), 40):
        batch = need[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "pageimages",
                                    "piprop": "name", "pilicense": "free", "titles": "|".join(batch)})
        d = fetch.get("https://en.wikipedia.org/w/api.php?" + q)["query"]
        fwd = {}
        for k in ("normalized", "redirects"):
            for n in d.get(k, []):
                fwd[n["from"]] = n["to"]
        pages = {pg["title"]: pg for pg in d["pages"].values()}
        for t in batch:
            c = t
            while c in fwd:
                c = fwd[c]
            pg = pages.get(c, {})
            meta[t] = {"canon": c, "missing": "missing" in pg or not pg, "lead": pg.get("pageimage")}
        time.sleep(0.5)
    save()

    # 2. Commons licence + 900px thumb, 40 files per request
    for t in titles:
        m = meta[t]
        m["file"] = people[t].get("file") or m.get("lead")
    need = sorted({meta[t]["file"] for t in titles if meta[t]["file"] and meta[t].get("info_for") != meta[t]["file"]})
    info = {}
    for i in range(0, len(need), 40):
        batch = need[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "|".join("File:" + f for f in batch),
                                    "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 900})
        d = fetch.get("https://commons.wikimedia.org/w/api.php?" + q)["query"]
        norm = {n["to"]: n["from"] for n in d.get("normalized", [])}
        for pg in d["pages"].values():
            info[norm.get(pg["title"], pg["title"])[5:]] = pg
        time.sleep(0.5)
    for t in titles:
        m = meta[t]
        f = m["file"]
        if not f:
            m["drop"] = "no free lead image on Wikipedia"
            continue
        if m.get("info_for") == f:
            continue
        pg = info.get(f)
        if not pg or "imageinfo" not in pg:
            m["drop"] = "file not on Commons: " + f
            continue
        ii = pg["imageinfo"][0]
        em = ii.get("extmetadata", {})
        lic = fetch.text(em.get("LicenseShortName", {}).get("value"))
        nonfree = fetch.text(em.get("NonFree", {}).get("value"))
        author = fetch.text(em.get("Artist", {}).get("value")) or fetch.text(em.get("Credit", {}).get("value")) or "Unknown"
        m.update({"license": lic, "licenseUrl": fetch.text(em.get("LicenseUrl", {}).get("value")),
                  "author": author[:200], "source": ii.get("descriptionurl"), "thumb": ii.get("thumburl"),
                  "info_for": f})
        m.pop("drop", None)
        if nonfree.lower() == "true" or not fetch.FREE.match(lic):
            m["drop"] = "licence not free: " + lic
    save()

    # 3. pageviews (12 full months)
    for t in titles:
        m = meta[t]
        if m.get("pvm") and m.get("pv_for") == m["canon"]:
            continue
        art = urllib.parse.quote(m["canon"].replace(" ", "_"), safe="")
        url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/"
               "%s/monthly/%s/%s" % (art, PV_FROM, PV_TO))
        try:
            m["pvm"] = [int(x["views"]) for x in fetch.get(url, tries=5)["items"]]
            m["pv_for"] = m["canon"]
        except Exception as e:
            print("  pageviews failed", t, e)
            m["pvm"] = []
        # 12-month total with bot spikes damped: no month counts for more than 3x the median month
        mv = sorted(m["pvm"])
        med = mv[len(mv) // 2] if mv else 0
        m["pv"] = int(sum(min(v, 3 * med) for v in m["pvm"]))
        m["pv_raw"] = int(sum(m["pvm"]))
        if len(m["pvm"]) and titles.index(t) % 50 == 0:
            save()
        time.sleep(0.2)
    save()

    # 4. downloads (one file per Wikipedia title)
    for t in titles:
        m = meta[t]
        if m.get("drop"):
            continue
        out = os.path.join(cache, "src", fetch.slug(t) + ".img")
        if os.path.exists(out) and m.get("got") == m["file"]:
            continue
        open(out, "wb").write(fetch.get(m["thumb"], binary=True))
        m["got"] = m["file"]
        print("got", t, "|", m["license"], flush=True)
        save()
        time.sleep(0.4)
    save()
    drops = [(t, meta[t]["drop"]) for t in titles if meta[t].get("drop")]
    print("titles", len(titles), "dropped", len(drops))
    for t, why in drops:
        print("  DROP", t, "-", why)


def detect(det, im):
    import cv2, numpy as np
    arr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(arr)
    if faces is None:
        return []
    return sorted([[float(v) for v in f] for f in faces], key=lambda f: -(f[2] * f[3]))


def crop_box(build, im, p, det, det_low):
    """Square crop: eyes ~40% from the top, face about 45% of the tile wide."""
    W, H = im.size
    if "crop" in p:
        cx, cy, head = p["crop"]
        return build.square(im, cx * W, cy * H, head * W * 1.7), "manual crop"
    faces = detect(det, im)
    if not faces:  # paintings and engravings: retry smaller (YuNet likes faces ~60-200px), then a lower threshold
        for scale, d in ((0.5, det), (0.3, det), (1.0, det_low), (0.5, det_low)):
            small = im.resize((max(1, int(W * scale)), max(1, int(H * scale))))
            faces = [[v / scale for v in f[:14]] + [f[14]] for f in detect(d, small)]
            if faces:
                break
    if not faces:
        side = min(W, H)
        return build.square(im, W / 2, side / 2, side), "NO FACE FOUND"
    sure = [f for f in faces if f[14] >= 0.85]
    if sure:  # largest confident face beats a larger low-score blob (flowers, drapery, painted backgrounds)
        faces = sure + [f for f in faces if f[14] < 0.85]
    f = faces[0]
    x, y, fw, fh = f[0:4]
    ex, ey = (f[4] + f[6]) / 2, (f[5] + f[7]) / 2  # eye midpoint
    side = max(fw, fh) * 2.2
    note = ""
    if fw < 50:
        note += " small face %dpx" % fw
    if len(faces) > 1 and faces[1][2] * faces[1][3] > 0.35 * fw * fh:
        note += " multiple faces"
    if f[14] < 0.8:
        note += " low score %.2f" % f[14]
    # box centre so the eyes land 40% down and the face is centred left-right
    return build.square(im, ex, ey + 0.10 * side, side), note.strip()


def do_build(cache, model, only):
    import cv2
    from PIL import Image
    build = _load("deckbuild", "deck-build.py")
    meta = json.load(open(os.path.join(cache, "meta.json"), encoding="utf-8"))
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    det_low = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.35, 0.3, 5000)
    sheets = os.path.join(cache, "sheets")
    os.makedirs(sheets, exist_ok=True)
    report = {"dropped": [], "flags": [], "groups": []}
    for g in load_groups():
        if only and g["id"] not in only:
            continue
        out = os.path.join(ROOT, "decks", g["id"])
        shutil.rmtree(out, ignore_errors=True)
        os.makedirs(os.path.join(out, "img"))
        people, seen = [], set()
        for p in g["people"]:
            m = meta.get(p["title"], {})
            if p["id"] in seen:
                report["dropped"].append((g["id"], p["name"], "duplicate in group"))
                continue
            if m.get("drop") or "pv" not in m:
                report["dropped"].append((g["id"], p["name"], m.get("drop", "not fetched")))
                continue
            seen.add(p["id"])
            im = build.load_image(os.path.join(cache, "src", fetch.slug(p["title"]) + ".img"))
            box, note = crop_box(build, im, p, det, det_low)
            tile = im.crop(tuple(int(round(v)) for v in box)).resize((build.SIZE, build.SIZE), Image.LANCZOS)
            data, _ = build.encode(tile)
            open(os.path.join(out, "img", p["id"] + ".webp"), "wb").write(data)
            if note:
                report["flags"].append((g["id"], p["name"], note))
            people.append({"id": p["id"], "name": p["name"], "from": p["from"], "gender": p["gender"],
                           "kind": g["kind"], "tags": [g["cat"], g["id"]], "pv": m["pv"],
                           "img": "img/%s.webp" % p["id"], "_fame": p.get("fame"),
                           "credit": {"author": m["author"], "license": m["license"],
                                      "licenseUrl": m.get("licenseUrl", ""), "source": m["source"]}})
        # hand-set fame (pageviews mislead: bot traffic, a TV series) is kept; everyone else is ranked by pv
        ranked = sorted([e for e in people if not e["_fame"]], key=lambda e: -e["pv"])
        n = len(ranked)
        for rank, e in enumerate(ranked):
            e["fame"] = round(1 + 99 * (n - 1 - rank) / (n - 1)) if n > 1 else 100
        for e in people:
            hand = e.pop("_fame")
            if hand:
                e["fame"] = hand
        people.sort(key=lambda e: -e["fame"])
        keys = ["id", "name", "from", "gender", "kind", "tags", "fame", "pv", "img", "credit"]
        deck = {"id": g["id"], "title": g["title"], "cat": g["cat"], "people": [{k: e[k] for k in keys} for e in people]}
        json.dump(deck, open(os.path.join(out, "deck.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
        for k in range(0, n, 40):
            build.contact_sheet(os.path.join(ROOT, "decks"), g["id"], "%s %d-" % (g["title"], k), deck["people"][k:k + 40],
                                os.path.join(sheets, "%s-%d.png" % (g["id"], k // 40 + 1)), k)
        report["groups"].append((g["id"], g["title"], n))
        print(g["id"], n)
    json.dump(report, open(os.path.join(sheets, "report.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("DROPPED", len(report["dropped"]))
    for r in report["dropped"]:
        print("  ", r)
    print("FLAGS", len(report["flags"]))
    for r in report["flags"]:
        print("  ", r)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if sys.argv[1] == "fetch":
        do_fetch(sys.argv[2])
    else:
        do_build(sys.argv[2], sys.argv[3], set(sys.argv[4:]))
