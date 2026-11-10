"""Mystery Face "stars" groups: film, music and internet decks, plus fame for the first decks.

Usage (run from anywhere, always with python -I):
  python -I tools/groups/stars.py fetch  <cache>            look up pages, Wikidata, licences, pageviews; download pictures
  python -I tools/groups/stars.py build  <cache> <yunet.onnx> <sheets> [group ids]   write decks/<id>/ + contact sheets
  python -I tools/groups/stars.py fame   <cache>            add pv + fame to the 7 first decks (keeps every other field)
  python -I tools/groups/stars.py recrop <cache> <yunet.onnx> <sheets> [ids]   re-crop real people in the first decks
List: tools/groups/stars.txt. Shared helpers come from tools/deck-fetch.py and tools/deck-build.py (not edited).
"""
import importlib.util, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
DECKS = os.path.join(ROOT, "decks")


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fetch = _load("deckfetch", "deck-fetch.py")
get, slug, text, FREE = fetch.get, fetch.slug, fetch.text, fetch.FREE

PV_FROM, PV_TO = "2025110100", "2026103100"  # last 12 full months (Nov 2025 - Oct 2026)
ADULT_BEFORE = date(2008, 11, 9)
GENDER = {"Q6581097": "m", "Q6581072": "f", "Q2449503": "m", "Q1052281": "f"}


# ---------- list ----------
def load_groups():
    groups, cur = [], None
    for raw in open(os.path.join(HERE, "stars.txt"), encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if line.startswith("@"):
            gid, title, cat, kind = [p.strip() for p in line[1:].split("|")]
            cur = {"id": gid, "title": title, "cat": cat, "kind": kind, "people": []}
            groups.append(cur)
            continue
        if "DROP" in parts[1:]:
            continue
        title = parts[0]
        p = {"title": title, "name": re.sub(r"\s*\(.*\)$", "", title), "from": parts[1] if len(parts) > 1 else ""}
        p["id"] = slug(p["name"])
        for extra in parts[2:]:
            if extra.startswith("g="):
                p["gender"] = extra[2:]
            elif extra.startswith("file=") and extra[5:]:
                p["file"] = extra[5:]
            elif extra.startswith("crop="):
                p["crop"] = [float(v) for v in extra[5:].split(",")]
            elif extra.startswith("fame="):
                p["fame"] = int(extra[5:])
            elif extra.startswith("name="):
                p["name"] = extra[5:]
                p["id"] = slug(p["name"])
        cur["people"].append(p)
    return groups


# ---------- network helpers ----------
def jload(path, default):
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else default


def jsave(path, obj):
    json.dump(obj, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def wiki_pages(titles, pages):
    """pages[title] = {canon, file, qid, disambig, missing}"""
    todo = [t for t in dict.fromkeys(titles) if t not in pages]
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "pageimages|pageprops",
                                    "piprop": "name", "pilicense": "free", "ppprop": "wikibase_item|disambiguation",
                                    "titles": "|".join(batch)})
        d = get("https://en.wikipedia.org/w/api.php?" + q)["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for n in d.get(k, []):
                alias[n["from"]] = n["to"]
        byt = {pg["title"]: pg for pg in d["pages"].values()}
        for t in batch:
            c = t
            for _ in range(5):
                if c in alias:
                    c = alias[c]
            pg = byt.get(c, {})
            pp = pg.get("pageprops", {})
            pages[t] = {"canon": c, "file": pg.get("pageimage"), "qid": pp.get("wikibase_item"),
                        "disambig": "disambiguation" in pp, "missing": "missing" in pg or not pg}
        time.sleep(0.4)


def wikidata(qids, wd):
    todo = [q for q in dict.fromkeys(qids) if q and q not in wd]
    for i in range(0, len(todo), 45):
        batch = todo[i:i + 45]
        q = urllib.parse.urlencode({"action": "wbgetentities", "format": "json", "props": "claims", "ids": "|".join(batch)})
        ents = get("https://www.wikidata.org/w/api.php?" + q).get("entities", {})
        for qid, e in ents.items():
            cl = e.get("claims", {})

            def ids(pid):
                return [c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get(pid, [])]

            born = None
            for c in cl.get("P569", []):
                v = c["mainsnak"].get("datavalue", {}).get("value", {}).get("time")
                if v:
                    born = v[1:11]
                    break
            g = next((GENDER[x] for x in ids("P21") if x in GENDER), "x" if cl.get("P21") else None)
            wd[qid] = {"human": "Q5" in ids("P31"), "gender": g, "born": born}
        time.sleep(0.4)


def commons(files, cm):
    todo = [f for f in dict.fromkeys(files) if f and f not in cm]
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|size|extmetadata",
                                    "iiurlwidth": 900, "titles": "|".join("File:" + f for f in batch)})
        d = get("https://commons.wikimedia.org/w/api.php?" + q)["query"]
        alias = {n["to"]: n["from"] for n in d.get("normalized", [])}
        for pg in d["pages"].values():
            t = alias.get(pg["title"], pg["title"])
            f = t[5:] if t.startswith("File:") else t
            if "imageinfo" not in pg:
                cm[f] = {"drop": "file not on Commons"}
                continue
            ii = pg["imageinfo"][0]
            em = ii.get("extmetadata", {})
            lic = text(em.get("LicenseShortName", {}).get("value"))
            nonfree = text(em.get("NonFree", {}).get("value"))
            m = {"license": lic, "licenseUrl": text(em.get("LicenseUrl", {}).get("value")),
                 "author": text(em.get("Artist", {}).get("value")) or text(em.get("Credit", {}).get("value")) or "Unknown",
                 "source": ii.get("descriptionurl"), "thumb": ii.get("thumburl"), "w": ii.get("width"), "h": ii.get("height")}
            if nonfree.lower() == "true" or not FREE.match(lic):
                m["drop"] = "licence not free: " + lic
            cm[f] = m
        time.sleep(0.4)


def pageviews(titles, pv):
    for t in dict.fromkeys(titles):
        if t in pv:
            continue
        u = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/%s/monthly/%s/%s"
             % (urllib.parse.quote(t.replace(" ", "_"), safe=""), PV_FROM, PV_TO))
        for i in range(8):
            try:
                req = urllib.request.Request(u, headers={"User-Agent": fetch.UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    pv[t] = sum(it["views"] for it in json.loads(r.read()).get("items", []))
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:  # no views recorded
                    pv[t] = 0
                    break
                time.sleep(4 * (i + 1))
            except Exception:
                time.sleep(4 * (i + 1))
        else:
            print("  pageviews failed (not stored):", t, flush=True)
        time.sleep(0.35)


def download(cache, key, thumb):
    out = os.path.join(cache, "src", key + ".img")
    if not os.path.exists(out):
        open(out, "wb").write(get(thumb, binary=True))
        time.sleep(0.5)
    return out


# ---------- fetch ----------
def cmd_fetch(cache):
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    groups = load_groups()
    pages = jload(os.path.join(cache, "pages.json"), {})
    wd = jload(os.path.join(cache, "wikidata.json"), {})
    cm = jload(os.path.join(cache, "commons.json"), {})
    pv = jload(os.path.join(cache, "pv.json"), {})
    people = [p for g in groups for p in g["people"]]
    wiki_pages([p["title"] for p in people], pages)
    jsave(os.path.join(cache, "pages.json"), pages)
    wikidata([pages[p["title"]]["qid"] for p in people], wd)
    jsave(os.path.join(cache, "wikidata.json"), wd)
    commons([p.get("file") or pages[p["title"]]["file"] for p in people], cm)
    jsave(os.path.join(cache, "commons.json"), cm)
    pageviews([pages[p["title"]]["canon"] for p in people], pv)
    jsave(os.path.join(cache, "pv.json"), pv)
    lost = [p["title"] for p in people if pages[p["title"]]["canon"] not in pv]
    if lost:
        sys.exit("pageviews missing for %s; run again" % lost)
    resolved, drops = {}, []
    for g in groups:
        for p in g["people"]:
            r = resolve(p, pages, wd, cm, pv)
            if r.get("drop"):
                drops.append((g["id"], p["title"], r["drop"]))
                continue
            key = slug(r["file"])[:80]
            r["src"] = download(cache, key, cm[r["file"]]["thumb"])
            resolved[g["id"] + "/" + p["id"]] = r
    jsave(os.path.join(cache, "resolved.json"), resolved)
    for d in drops:
        print("DROP", *d)
    print("people", len(people), "kept", len(resolved), "dropped", len(drops))


def resolve(p, pages, wd, cm, pv):
    pg = pages[p["title"]]
    if pg["missing"]:
        return {"drop": "no Wikipedia page"}
    if pg["disambig"]:
        return {"drop": "disambiguation page"}
    w = wd.get(pg["qid"] or "", {})
    if not w.get("human"):
        return {"drop": "Wikidata says not a single person"}
    if w.get("born"):
        try:
            b = date.fromisoformat(w["born"].replace("-00", "-01"))
            if b > ADULT_BEFORE:
                return {"drop": "under 18"}
        except ValueError:
            pass
    f = p.get("file") or pg["file"]
    if not f:
        return {"drop": "no free lead image"}
    c = cm.get(f, {})
    if c.get("drop") or not c:
        return {"drop": c.get("drop", "no Commons info")}
    return {"file": f, "gender": p.get("gender") or w.get("gender") or "x", "pv": pv.get(pg["canon"], 0),
            "canon": pg["canon"], "born": w.get("born")}


# ---------- picture ----------
def face_box(det, im, crop=None):
    """Square box with the eyes ~40% from the top and the whole head in. Returns (box, note)."""
    import numpy as np, cv2
    W, H = im.size
    if crop:
        cx, cy, head = crop
        side = head * W * 1.7
        return clamp(W, H, cx * W, cy * H, side, 0.5), "manual crop"
    arr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    det.setInputSize((W, H))
    _, faces = det.detect(arr)
    if faces is None or not len(faces):
        side = min(W, H)
        return (int((W - side) / 2), 0, int((W - side) / 2 + side), side), "NO FACE"
    faces = sorted(faces, key=lambda f: -(f[2] * f[3]))
    f = faces[0]
    fx, fy, fw, fh = map(float, f[:4])
    ex = (f[4] + f[6]) / 2
    ey = (f[5] + f[7]) / 2
    side = max(fw, fh) * 2.3
    note = ""
    if fw < 50:
        note += " small face %dpx" % fw
    if len(faces) > 1 and faces[1][2] * faces[1][3] > 0.35 * fw * fh:
        note += " multiple faces"
    if f[14] < 0.8:
        note += " low score %.2f" % f[14]
    cx = (ex + fx + fw / 2) / 2
    return clamp(W, H, cx, ey, side, 0.42, max(fw, fh) * 1.6), note.strip()


PAD = 0.18  # at most this share of the tile may be blurred edge padding on any side


def clamp(W, H, cx, ey, side, top_frac, min_side=0):
    """Square of size side with (cx, ey) at (50%, top_frac). Where the photo is too tight, the box may stick out
    of the photo by up to PAD of its side (filled by blurred edge padding in tile()); beyond that it shrinks
    (not below min_side) and finally slides back inside. Box may have negative / too-large coordinates."""
    def over(s):
        x0, y0 = cx - s / 2, ey - s * top_frac
        return max(-x0, -y0, x0 + s - W, y0 + s - H, 0) / s
    while over(side) > PAD and side * 0.96 >= min_side:
        side *= 0.96
    lim = PAD * side
    x0 = min(max(cx - side / 2, -lim), W - side + lim)
    y0 = min(max(ey - side * top_frac, -lim), H - side + lim)
    return (int(round(x0)), int(round(y0)), int(round(x0 + side)), int(round(y0 + side)))


def padded_crop(im, box):
    """Crop box from im; parts outside the photo are filled with its blurred edge colours."""
    from PIL import Image, ImageFilter
    W, H = im.size
    x0, y0, x1, y1 = box
    l, t, r, b = max(0, -x0), max(0, -y0), max(0, x1 - W), max(0, y1 - H)
    if not (l or t or r or b):
        return im.crop(box)
    import numpy as np, cv2
    arr = cv2.copyMakeBorder(np.array(im), t, b, l, r, cv2.BORDER_REPLICATE)
    big = Image.fromarray(arr)
    blur = big.filter(ImageFilter.GaussianBlur(max(8, (x1 - x0) // 25)))
    mask = Image.new("L", big.size, 255)
    mask.paste(0, (l, t, l + W, t + H))
    big.paste(blur, (0, 0), mask)
    return big.crop((x0 + l, y0 + t, x1 + l, y1 + t))


def tile(build, det, src, crop=None):
    from PIL import Image
    im = build.load_image(src)
    box, note = face_box(det, im, crop)
    t = padded_crop(im, box).resize((256, 256), Image.LANCZOS)
    data, q = build.encode(t)
    return data, note


def fame_of(people):
    """fame = round(1 + 99*(n-1-rank)/(n-1)), rank 0 = most viewed; hand-set fame wins."""
    order = sorted(range(len(people)), key=lambda i: -people[i]["pv"])
    n = len(people)
    for rank, i in enumerate(order):
        people[i]["fame"] = round(1 + 99 * (n - 1 - rank) / (n - 1)) if n > 1 else 100


# ---------- build ----------
def cmd_build(cache, model, sheets, only):
    import cv2
    build = _load("deckbuild", "deck-build.py")
    os.makedirs(sheets, exist_ok=True)
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    resolved = jload(os.path.join(cache, "resolved.json"), {})
    flags = []
    for g in load_groups():
        if only and g["id"] not in only:
            continue
        out = os.path.join(DECKS, g["id"])
        img_dir = os.path.join(out, "img")
        os.makedirs(img_dir, exist_ok=True)
        for f in os.listdir(img_dir):
            os.remove(os.path.join(img_dir, f))
        people, seen = [], set()
        for p in g["people"]:
            r = resolved.get(g["id"] + "/" + p["id"])
            if not r or p["id"] in seen:
                continue
            seen.add(p["id"])
            data, note = tile(build, det, r["src"], p.get("crop"))
            open(os.path.join(img_dir, p["id"] + ".webp"), "wb").write(data)
            if note:
                flags.append((g["id"], p["name"], note))
            c = cache_credit(cache, r["file"])
            e = {"id": p["id"], "name": p["name"]}
            if p["from"]:
                e["from"] = p["from"][:40]
            e.update({"gender": r["gender"], "kind": g["kind"], "tags": [g["kind"], g["id"]], "pv": int(r["pv"]),
                      "img": "img/%s.webp" % p["id"], "credit": c})
            if "fame" in p:
                e["_fame"] = p["fame"]
            people.append(e)
        fame_of(people)
        for e in people:
            if "_fame" in e:
                e["fame"] = e.pop("_fame")
        people.sort(key=lambda e: -e["fame"])
        # field order as in the plan
        people = [{k: e[k] for k in ("id", "name", "from", "gender", "kind", "tags", "fame", "pv", "img", "credit") if k in e}
                  for e in people]
        json.dump({"id": g["id"], "title": g["title"], "cat": g["cat"], "people": people},
                  open(os.path.join(out, "deck.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
        for k in range(0, len(people), 40):
            build.contact_sheet(DECKS, g["id"], "%s %d-" % (g["title"], k), people[k:k + 40],
                                os.path.join(sheets, "sheet-%s-%d.png" % (g["id"], k // 40 + 1)), k)
        print(g["id"], len(people))
    for f in flags:
        print("FLAG", *f)


def cache_credit(cache, f):
    c = jload(os.path.join(cache, "commons.json"), {})[f]
    return {"author": c["author"], "license": c["license"], "licenseUrl": c.get("licenseUrl", ""), "source": c["source"]}


# ---------- first decks: fame ----------
LEGACY = ["movies", "music", "sports", "history", "mixed", "characters", "cartoons"]


def legacy_titles():
    """name -> Wikipedia title, from tools/deck-people.txt and tools/groups/stars-legacy.json (characters)."""
    t = {}
    for p in fetch.load_people():
        t[p["id"]] = p["title"]
    extra = jload(os.path.join(HERE, "stars-legacy.json"), {})
    t.update(extra.get("titles", {}))
    return t, extra.get("fame", {})


def cmd_fame(cache):
    titles, hand = legacy_titles()
    est = jload(os.path.join(HERE, "stars-legacy.json"), {}).get("pv_estimate", {})
    pv = jload(os.path.join(cache, "pv-legacy.json"), {})
    decks = {d: json.load(open(os.path.join(DECKS, d, "deck.json"), encoding="utf-8")) for d in LEGACY}
    need, missing = [], []
    for d, deck in decks.items():
        for p in deck["people"]:
            t = titles.get(p["id"])
            if not t:
                missing.append((d, p["id"]))
            else:
                need.append(t)
    if missing:
        for m in missing:
            print("NO TITLE", *m)
        sys.exit(1)
    pages = jload(os.path.join(cache, "pages-legacy.json"), {})
    wiki_pages(need, pages)
    jsave(os.path.join(cache, "pages-legacy.json"), pages)
    for t in need:
        if pages[t]["missing"] or pages[t]["disambig"]:
            print("BAD TITLE", t, pages[t])
    pageviews([pages[t]["canon"] for t in need], pv)
    jsave(os.path.join(cache, "pv-legacy.json"), pv)
    lost = [t for t in need if pages[t]["canon"] not in pv]
    if lost:
        sys.exit("pageviews missing for %s; run again" % lost)
    for d, deck in decks.items():
        people = deck["people"]
        for p in people:
            p["pv"] = int(est.get(p["id"], pv.get(pages[titles[p["id"]]]["canon"], 0)))
        fame_of(people)
        for p in people:
            if p["id"] in hand:
                p["fame"] = hand[p["id"]]
        json.dump(deck, open(os.path.join(DECKS, d, "deck.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
        top = sorted(people, key=lambda p: -p["fame"])
        print(d, len(people), "top:", [p["name"] for p in top[:5]], "bottom:", [p["name"] for p in top[-3:]])


# ---------- first decks: re-crop ----------
REAL = ["movies", "music", "sports", "history"]


def cmd_recrop(cache, model, sheets, only):
    """Re-crop the listed people (or all, writing to <sheets>/recrop/ for comparison) from their credited Commons file."""
    import cv2
    build = _load("deckbuild", "deck-build.py")
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    crops = jload(os.path.join(HERE, "stars-legacy.json"), {}).get("crop", {})
    cm = jload(os.path.join(cache, "commons.json"), {})
    trial = os.path.join(sheets, "recrop")
    os.makedirs(trial, exist_ok=True)
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    for d in REAL:
        deck = json.load(open(os.path.join(DECKS, d, "deck.json"), encoding="utf-8"))
        files = {p["id"]: urllib.parse.unquote(p["credit"]["source"].split("File:", 1)[1]).replace("_", " ") for p in deck["people"]}
        commons(list(files.values()), cm)
        jsave(os.path.join(cache, "commons.json"), cm)
        for p in deck["people"]:
            if only and p["id"] not in only:
                continue
            f = files[p["id"]]
            if not cm.get(f, {}).get("thumb"):
                print("NO THUMB", p["id"], f)
                continue
            src = download(cache, "legacy-" + p["id"], cm[f]["thumb"])
            data, note = tile(build, det, src, crops.get(p["id"]))
            if only:  # write for real: the deck and the Mixed copy
                for dd in (d, "mixed"):
                    path = os.path.join(DECKS, dd, "img", p["id"] + ".webp")
                    if dd == d or os.path.exists(path):
                        open(path, "wb").write(data)
                print("recropped", d, p["id"], note)
            else:
                open(os.path.join(trial, p["id"] + ".webp"), "wb").write(data)
                if note:
                    print("FLAG", d, p["id"], note)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "fetch":
        cmd_fetch(a[1])
    elif a[0] == "build":
        cmd_build(a[1], a[2], a[3], set(a[4:]))
    elif a[0] == "fame":
        cmd_fame(a[1])
    elif a[0] == "recrop":
        cmd_recrop(a[1], a[2], a[3], set(a[4:]))
