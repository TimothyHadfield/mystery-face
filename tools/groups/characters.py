"""Character groups (cat characters / animated / games) for the Mystery Face library.

Reads tools/groups/characters.txt and builds decks/<group>/deck.json + img/.
Pictures: the studio's official character image from the franchise's fandom wiki
(MediaWiki API pageimages = the infobox image), credited {author: studio,
license: "(c) owner, fan use", source: wiki page}.  pv: English Wikipedia pageviews
(user agent) over the last 12 full months of the character's own article; when the
character has no article of its own (a redirect into a list or the show's article),
the views of that redirect title; when there is none at all, an estimate (half the
group's lowest), listed by the build.

Usage (cache = a folder outside the repo, e.g. %TEMP%/claude/mf-cache/characters):
  python -I tools/groups/characters.py fetch <cache> [group ...]   find + download pictures
  python -I tools/groups/characters.py pv    <cache> [group ...]   Wikipedia page views
  python -I tools/groups/characters.py build <cache> <yunet.onnx> <animeface.xml> <sheets> [group ...]
  python -I tools/groups/characters.py src   <cache> <sheets> <group> [id ...]   source pictures with a 10% grid
Run fetch, pv, build; look at the contact sheets; fix bad crops with crop=/img= in characters.txt; build again.
"""
import io, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DECKS = os.path.join(ROOT, "decks")
UA = "MysteryFaceDeckBuilder/1.0 (https://github.com/TimothyHadfield/mystery-face; one-off build of a free-licence portrait deck)"
LICENSE = "© owner, fan use"
MONTHS = ("20251101", "20261031")  # the last 12 full months
SIZE, MAX_BYTES = 256, 20000


# ---------- list ----------
def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40].strip("-")


def opts(fields):
    o, pos = {}, []
    for f in fields:
        m = re.match(r"^(page|wp|img|crop|from|pick|wpx|pvlike|q|wiki)=(.*)$", f)
        if m:
            o[m.group(1)] = m.group(2).strip()
        elif f in ("live", "animated"):
            o["sub"] = f
        else:
            pos.append(f)
    return o, pos


def load_groups():
    groups, g, fr = [], None, None
    for raw in open(os.path.join(HERE, "characters.txt"), encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line[1:].split("|")] if line[0] in "@>" else [p.strip() for p in line.split("|")]
        if line.startswith("@"):
            g = {"id": parts[0], "title": parts[1], "cat": parts[2], "people": []}
            groups.append(g)
        elif line.startswith(">"):
            o, _ = opts(parts[3:])
            fr = {"franchise": parts[0], "wiki": parts[1], "studio": parts[2],
                  "sub": o.get("sub", "live" if g["cat"] == "characters" else "animated"),
                  "pick": o.get("pick"), "wpx": o.get("wpx")}
        else:
            o, pos = opts(parts[2:])
            p = dict(fr)
            p.update({"name": parts[0], "gender": parts[1], "actor": pos[0] if pos else "", "opt": o,
                      "id": slug(parts[0]), "group": g["id"], "pick": o.get("pick") or fr["pick"],
                      "wiki": o.get("wiki") or fr["wiki"]})  # wiki= takes one person from another wiki
            g["people"].append(p)
    for g in groups:
        ids = [p["id"] for p in g["people"]]
        dup = {i for i in ids if ids.count(i) > 1}
        assert not dup, (g["id"], dup)
    return groups


def pick_groups(groups, names):
    return [g for g in groups if not names or g["id"] in names]


# ---------- network ----------
def get(url, binary=False, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            time.sleep(0.35)
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            wait = 4 * (i + 1)
            print("  retry", i + 1, e, "wait", wait, flush=True)
            time.sleep(wait)
        except Exception as e:
            wait = 4 * (i + 1)
            print("  retry", i + 1, e, "wait", wait, flush=True)
            time.sleep(wait)
    raise RuntimeError("failed " + url)


def api(wiki, **q):
    q.update({"action": "query", "format": "json"})
    return get("https://%s.fandom.com/api.php?%s" % (wiki, urllib.parse.urlencode(q))) or {}


def wiki_query(wiki, titles):
    """title -> (final title, thumb url, file) for up to 40 titles (redirects followed)."""
    d = api(wiki, prop="pageimages", piprop="thumbnail|name", pithumbsize=800, titles="|".join(titles), redirects=1)
    q = d.get("query", {})
    alias = {}
    for k in ("normalized", "redirects"):
        for n in q.get(k, []):
            alias[n["from"]] = n["to"]
    pages = {p["title"]: p for p in q.get("pages", {}).values()}
    out = {}
    for t in titles:
        f = t
        for _ in range(4):
            if f in alias:
                f = alias[f]
        p = pages.get(f)
        if not p or "missing" in p or "invalid" in p:
            out[t] = None
        else:
            out[t] = (p["title"], (p.get("thumbnail") or {}).get("source"), p.get("pageimage"))
    return out


def file_url(wiki, fname):
    d = api(wiki, prop="imageinfo", iiprop="url", iiurlwidth=800, titles="File:" + fname)
    for p in d.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        return ii.get("thumburl") or ii.get("url")
    return None


def page_files(wiki, title):
    d = api(wiki, prop="images", imlimit="max", titles=title)
    for p in d.get("query", {}).get("pages", {}).values():
        return [i["title"].split(":", 1)[1] for i in p.get("images", [])]
    return []


def cmd_fetch(cache, names):
    groups = pick_groups(load_groups(), names)
    mpath = os.path.join(cache, "meta.json")
    meta = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {}
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    people = [p for g in groups for p in g["people"]]
    key = lambda p: "%s/%s" % (p["group"], p["id"])
    want = lambda p: {"wiki": p["wiki"], "page": p["opt"].get("page", p["name"]), "img": p["opt"].get("img"),
                      "pick": p["pick"], "q": p["opt"].get("q")}
    todo = [p for p in people if meta.get(key(p), {}).get("want") != want(p) or not meta[key(p)].get("url")]
    by_wiki = {}
    for p in todo:
        by_wiki.setdefault(p["wiki"], []).append(p)
    for wiki, ps in by_wiki.items():
        for i in range(0, len(ps), 40):
            batch = ps[i:i + 40]
            res = wiki_query(wiki, list({want(p)["page"] for p in batch}))
            for p in batch:
                r = None if p["opt"].get("q") else res.get(want(p)["page"])
                note = ""
                if not r:  # search the wiki (q= gives the search words)
                    s = api(wiki, list="search", srsearch=p["opt"].get("q") or p["name"], srnamespace=0, srlimit=3)
                    hits = [h["title"] for h in s.get("query", {}).get("search", [])]
                    if hits:
                        r = wiki_query(wiki, hits[:1]).get(hits[0])
                        note = "searched"
                m = {"want": want(p), "note": note}
                if r:
                    m.update({"title": r[0], "url": r[1], "file": r[2]})
                if p["opt"].get("img"):
                    m["file"] = p["opt"]["img"]
                    m["url"] = file_url(wiki, p["opt"]["img"])
                elif p["pick"] and r:
                    files = [f for f in page_files(wiki, r[0]) if re.search(p["pick"], f, re.I)]
                    if files:
                        m["file"], m["url"] = files[0], file_url(wiki, files[0])
                meta[key(p)] = m
                print("%-40s %-12s %s -> %s %s %s" % (key(p), wiki, want(p)["page"], m.get("title"), m.get("file"), note), flush=True)
            json.dump(meta, open(mpath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    # download
    for p in people:
        m = meta.get(key(p), {})
        if not m.get("url"):
            print("NO PICTURE", key(p), flush=True)
            continue
        out = os.path.join(cache, "src", key(p).replace("/", "__") + ".img")
        if os.path.exists(out) and m.get("got") == m["url"]:
            continue
        u = m["url"]
        if re.search(r"\.svg/revision/latest(?!/scale)", u, re.I):  # ask Fandom for a PNG rendering
            u = re.sub(r"(/revision/latest)", r"\1/scale-to-width-down/800", u, count=1)
        data = get(u, binary=True)
        if not data:
            print("DOWNLOAD FAILED", key(p), m["url"])
            continue
        open(out, "wb").write(data)
        m["got"] = m["url"]
    json.dump(meta, open(mpath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("fetched", len(people), "missing", sum(1 for p in people if not meta.get(key(p), {}).get("url")))


# ---------- page views ----------
STOP = {"the", "and", "of", "a", "an", "in", "on", "s", "inc", "studio", "studios", "pictures", "television",
        "animation", "entertainment", "games", "disney"}


def keywords(p):
    words = {"fictional"}  # "X is a fictional character in ..." proves it is the character, not a namesake
    for s in (p["franchise"], p["studio"], p["wiki"], p.get("wpx") or ""):
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        for w in re.findall(r"[a-z0-9]+", s.lower()):
            if len(w) >= 4 and w not in STOP:
                words.add(w)
    if "disney" in p["studio"].lower():
        words.add("disney")
    if "pixar" in p["studio"].lower():
        words.add("pixar")
    # a word of the character's own name proves nothing (Pocahontas the person vs the Disney film)
    own = set(re.findall(r"[a-z0-9]+", (p["name"] + " " + p["opt"].get("page", "")).lower()))
    return words - own


def candidates(p):
    o = p["opt"]
    if o.get("wp"):
        return [o["wp"]]
    n = p["name"]
    out = []
    for x in (p.get("wpx") or "").split(";"):
        if x:
            out.append("%s (%s)" % (n, x))
    out += ["%s (%s)" % (n, p["franchise"]), "%s (%s character)" % (n, p["franchise"])]
    if "Disney" in p["studio"]:
        out += ["%s (Disney)" % n, "%s (Disney character)" % n]
    out += ["%s (character)" % n, n]
    pg = o.get("page")
    if pg and pg != n:
        out += ["%s (%s)" % (pg, p["franchise"]), "%s (character)" % pg, pg]
    return out


def is_franchise_page(target, p):
    t, f = target.lower(), p["franchise"].lower()
    return t == f or t.startswith(f + " (") or t.startswith("list of")


def wp_info(titles, cache_info):
    need = [t for t in titles if t not in cache_info]
    for i in range(0, len(need), 20):
        batch = need[i:i + 20]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "extracts|pageprops",
                                    "exintro": 1, "explaintext": 1, "exsentences": 3, "exlimit": 20,
                                    "titles": "|".join(batch)})
        d = (get("https://en.wikipedia.org/w/api.php?" + q) or {}).get("query", {})
        norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
        red = {n["from"]: (n["to"], n.get("tofragment")) for n in d.get("redirects", [])}
        pages = {pg["title"]: pg for pg in d.get("pages", {}).values()}
        for t in batch:
            t1 = norm.get(t, t)
            target, frag = red.get(t1, (t1, None))
            pg = pages.get(target)
            if not pg or "missing" in pg or "invalid" in pg:
                cache_info[t] = {"missing": True}
                continue
            cache_info[t] = {"title": t1, "target": target, "frag": frag, "redirect": t1 in red,
                             "disambig": "disambiguation" in (pg.get("pageprops") or {}),
                             "extract": (pg.get("extract") or "")[:600]}


def title_character(p):
    """SpongeBob in SpongeBob SquarePants, Shrek in Shrek: the show's article is about them."""
    f = slug(p["franchise"])
    return any(n and (f.startswith(n) or n.startswith(f)) for n in (slug(p["name"]), slug(p["opt"].get("page", ""))))


def redirects(target, info):
    """[(redirect title, fragment)] for an article (cached in info)."""
    key = "_rd:" + target
    if key not in info:
        out, cont = [], {}
        while True:
            q = {"action": "query", "format": "json", "prop": "redirects", "titles": target, "rdprop": "title|fragment",
                 "rdlimit": "max", "rdnamespace": 0}
            q.update(cont)
            d = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q)) or {}
            for pg in d.get("query", {}).get("pages", {}).values():
                out += [(r["title"], r.get("fragment")) for r in pg.get("redirects", [])]
            if "continue" not in d or len(out) > 3000:
                break
            cont = d["continue"]
        info[key] = out
    return [tuple(r) for r in info[key]]


def views(title):
    t = urllib.parse.quote(title.replace(" ", "_"), safe="")
    d = get("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/%s/monthly/%s/%s"
            % (t, MONTHS[0], MONTHS[1]))
    return sum(i["views"] for i in (d or {}).get("items", []))


def cmd_pv(cache, names):
    groups = pick_groups(load_groups(), names)
    ipath, ppath = os.path.join(cache, "wpinfo.json"), os.path.join(cache, "pv.json")
    info = json.load(open(ipath, encoding="utf-8")) if os.path.exists(ipath) else {}
    pv = json.load(open(ppath, encoding="utf-8")) if os.path.exists(ppath) else {}
    vcache = pv.setdefault("_views", {})
    for g in groups:
        wp_info(sorted({c for p in g["people"] for c in candidates(p)}), info)
        json.dump(info, open(ipath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        found = {}
        for p in g["people"]:
            kw = keywords(p)
            own = section = frpage = None
            for c in candidates(p):
                i = info.get(c, {})
                if i.get("missing") or i.get("disambig"):
                    continue
                ex = unicodedata.normalize("NFKD", i.get("extract", "") + " " + i.get("target", "")).encode(
                    "ascii", "ignore").decode().lower()
                if p["opt"].get("wp") and not i.get("frag"):  # wp= names the article to count, film or not
                    own = (c, i)
                    break
                if not p["opt"].get("wp") and not any(k in ex for k in kw):
                    continue
                if is_franchise_page(i["target"], p):  # the film/show's article or a character list
                    if not i["target"].lower().startswith("list of"):
                        frpage = frpage or i["target"]
                    if i.get("redirect"):
                        section = section or (c, i)
                    continue
                if i.get("frag"):
                    section = section or (c, i)
                    continue
                own = (c, i)
                break
            found[p["id"]] = [own, section, frpage]
        count = {}
        for own, _, _ in found.values():
            if own:
                count[own[1]["target"]] = count.get(own[1]["target"], 0) + 1
        for p in g["people"]:
            k = "%s/%s" % (g["id"], p["id"])
            own, section, frpage = found[p["id"]]
            if own and count[own[1]["target"]] > 1 and not p["opt"].get("wp"):  # two share one article (Itchy & Scratchy); wp= claims it
                own, section = None, section or own
            if own:
                t = own[1]["target"]
                if t not in vcache:
                    vcache[t] = views(t)
                pv[k] = {"pv": vcache[t], "how": "article " + t}
            elif frpage and title_character(p):
                if frpage not in vcache:
                    vcache[frpage] = views(frpage)
                pv[k] = {"pv": vcache[frpage], "how": "title character: " + frpage}
            elif section:
                c, i = section
                rds = redirects(i["target"], info)
                word = max(re.findall(r"[a-z0-9]+", p["name"].lower()), key=len)
                pick = [r for r, f in rds if (f == i.get("frag") if i.get("frag") else word in r.lower())]
                if c not in pick and i.get("redirect"):
                    pick.append(i["title"])
                total = 0
                for r in pick[:25]:
                    if r not in vcache:
                        vcache[r] = views(r)
                    total += vcache[r]
                pv[k] = {"pv": total, "how": "%d redirects to %s#%s" % (len(pick[:25]), i["target"], i.get("frag") or "")}
            else:
                pv[k] = {"pv": None, "how": "no Wikipedia page"}
            json.dump(info, open(ipath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        json.dump(pv, open(ppath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        rows = sorted(g["people"], key=lambda p: -(pv["%s/%s" % (g["id"], p["id"])]["pv"] or -1))
        print("==", g["id"], len(rows))
        for p in rows:
            r = pv["%s/%s" % (g["id"], p["id"])]
            print("   %9s  %-28s %s" % (r["pv"], p["name"], r["how"]), flush=True)


# ---------- pictures ----------
def load_image(path):
    from PIL import Image
    im = Image.open(path)
    im.seek(0)
    alpha = None
    if im.mode in ("RGBA", "LA", "P", "PA"):
        im = im.convert("RGBA")
        alpha = im.getchannel("A")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
        lo = sum(alpha.histogram()[:32]) / float(im.size[0] * im.size[1])
        if lo < 0.04:
            alpha = None
    return im.convert("RGB"), alpha


def square(W, H, cx, cy, side):
    side = min(side, W, H)
    x0 = min(max(cx - side / 2, 0), W - side)
    y0 = min(max(cy - side / 2, 0), H - side)
    return (x0, y0, x0 + side, y0 + side)


def find_box(im, alpha, det, anime, crop, live):
    import cv2
    import numpy as np
    W, H = im.size
    if crop:
        cx, cy, s = crop
        side = s * W
        return square(W, H, cx * W, cy * H + 0.05 * side, side), "hand"
    arr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    det.setInputSize((W, H))
    _, faces = det.detect(arr)
    if faces is not None and len(faces):
        f = max(faces, key=lambda f: f[2] * f[3])
        fx, fy, fw, fh, sc = [float(v) for v in (f[0], f[1], f[2], f[3], f[14])]
        if sc >= 0.7 and fw >= 0.07 * min(W, H):
            side = max(fw, fh) * 2.2
            return square(W, H, fx + fw / 2, fy + fh * 0.45, side), "face"
    if not live and anime is not None:
        gray = cv2.equalizeHist(cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY))
        m = int(0.1 * min(W, H))
        hits = anime.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(m, m))
        if len(hits):
            x, y, w, h = [float(v) for v in max(hits, key=lambda r: r[2] * r[3])]
            side = w * 2.0
            return square(W, H, x + w / 2, y + h * 0.55, side), "anime"
    if alpha is not None:
        a = np.array(alpha) > 40
        ys, xs = np.where(a)
        if len(xs):
            bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
            bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
            if bh <= 1.3 * bw:
                side = max(bw, bh) * 1.04
                return square(W, H, (bx0 + bx1) / 2, (by0 + by1) / 2, side), "subject"
            side = min(bw * 1.05, 0.55 * bh)
            band = a[by0:int(by0 + side * 0.6)]
            cols = np.where(band.any(axis=0))[0]
            cx = (cols.min() + cols.max()) / 2 if len(cols) else (bx0 + bx1) / 2
            return square(W, H, cx, by0 - 0.03 * side + side / 2, side), "top of figure"
    side = min(W, H)
    return square(W, H, W / 2, side / 2, side), "top centre"


def encode(tile):
    for q in list(range(84, 30, -6)) + [26, 20, 14]:
        b = io.BytesIO()
        tile.save(b, "WEBP", quality=q, method=6)
        if b.tell() <= MAX_BYTES:
            return b.getvalue()
    return b.getvalue()


def fame_of(pvs):
    n = len(pvs)
    order = sorted(range(n), key=lambda i: -pvs[i])
    fame = [0] * n
    for rank, i in enumerate(order):
        fame[i] = round(1 + 99 * (n - 1 - rank) / (n - 1)) if n > 1 else 100
    return fame


def cmd_build(cache, model, animexml, sheets, names):
    import cv2
    from PIL import Image
    groups = pick_groups(load_groups(), names)
    meta = json.load(open(os.path.join(cache, "meta.json"), encoding="utf-8"))
    pvd = json.load(open(os.path.join(cache, "pv.json"), encoding="utf-8"))
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    anime = cv2.CascadeClassifier(animexml) if hasattr(cv2, "CascadeClassifier") else None  # gone in OpenCV 5
    os.makedirs(sheets, exist_ok=True)
    total, est_all, dropped = 0, [], []
    for g in groups:
        out = os.path.join(DECKS, g["id"])
        os.makedirs(os.path.join(out, "img"), exist_ok=True)
        keep = set()
        cards, methods = [], {}
        for p in g["people"]:
            k = "%s/%s" % (g["id"], p["id"])
            m = meta.get(k, {})
            src = os.path.join(cache, "src", k.replace("/", "__") + ".img")
            if not m.get("url") or not os.path.exists(src):
                dropped.append((k, "no picture"))
                continue
            try:
                im, alpha = load_image(src)
            except Exception as e:
                dropped.append((k, "unreadable picture %s" % e))
                continue
            crop = [float(v) for v in p["opt"]["crop"].split(",")] if p["opt"].get("crop") else None
            box, how = find_box(im, alpha, det, anime, crop, p["sub"] == "live")
            tile = im.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
            fn = "img/%s.webp" % p["id"]
            open(os.path.join(out, fn), "wb").write(encode(tile))
            keep.add(p["id"] + ".webp")
            methods[p["id"]] = how
            card = {"id": p["id"], "name": p["name"], "from": (p["opt"].get("from") or p["franchise"])[:40],
                    "gender": p["gender"], "kind": "character", "sub": p["sub"], "franchise": p["franchise"]}
            if p["sub"] == "live" and p["actor"]:
                card["actor"] = p["actor"]
            card["tags"] = ["character", g["id"]]
            card["pv"] = (pvd.get(k) or {}).get("pv")
            card["img"] = fn
            card["credit"] = {"author": p["studio"], "license": LICENSE,
                              "source": "https://%s.fandom.com/wiki/%s" % (p["wiki"], urllib.parse.quote(m["title"].replace(" ", "_"), safe="/:()'!,"))}
            cards.append(card)
        for f in os.listdir(os.path.join(out, "img")):
            if f not in keep:
                os.remove(os.path.join(out, "img", f))
        like = {p["id"]: p["opt"]["pvlike"] for p in g["people"] if p["opt"].get("pvlike")}
        pvs = {c["id"]: c["pv"] for c in cards}
        for c in cards:  # hand placement: page views misleading or missing -> just below a named character
            if c["id"] in like:
                c["pv"] = int((pvs.get(like[c["id"]]) or 0) * 0.95)
                est_all.append("%s/%s~%s" % (g["id"], c["id"], like[c["id"]]))
        known = [c["pv"] for c in cards if isinstance(c["pv"], int) and c["pv"] > 0]
        low = max(1, min(known) // 2) if known else 1
        for c in cards:
            if not isinstance(c["pv"], int) or c["pv"] <= 0:
                c["pv"] = low
                est_all.append("%s/%s" % (g["id"], c["id"]))
        for c, f in zip(cards, fame_of([c["pv"] for c in cards])):
            c["fame"] = f
        order = ["id", "name", "from", "gender", "kind", "sub", "franchise", "actor", "tags", "fame", "pv", "img", "credit"]
        cards = [{k: c[k] for k in order if k in c} for c in sorted(cards, key=lambda c: c["name"].lower())]
        json.dump({"id": g["id"], "title": g["title"], "cat": g["cat"], "people": cards},
                  open(os.path.join(out, "deck.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
        total += len(cards)
        by_fame = sorted(cards, key=lambda c: -c["fame"])
        for k in range(0, len(by_fame), 40):
            sheet(out, by_fame[k:k + 40], methods, os.path.join(sheets, "%s-%d.png" % (g["id"], k // 40 + 1)), k)
        print("%-24s %3d cards  %s" % (g["id"], len(cards), {h: list(methods.values()).count(h) for h in set(methods.values())}), flush=True)
    print("TOTAL", total)
    print("ESTIMATED pv", len(est_all), " ".join(est_all))
    print("DROPPED", dropped)


def sheet(out, cards, methods, path, base):
    from PIL import Image, ImageDraw, ImageFont
    T, cols = 150, 8
    rows = (len(cards) + cols - 1) // cols
    sh = Image.new("RGB", (cols * T, rows * (T + 26)), "white")
    dr = ImageDraw.Draw(sh)
    font = ImageFont.truetype("arial.ttf", 11)
    for i, c in enumerate(cards):
        im = Image.open(os.path.join(out, c["img"])).convert("RGB").resize((T - 4, T - 4))
        x, y = (i % cols) * T, (i // cols) * (T + 26)
        sh.paste(im, (x + 2, y))
        dr.line((x + 2, y + int(0.4 * (T - 4)), x + 9, y + int(0.4 * (T - 4))), fill="red", width=2)
        dr.text((x + 2, y + T - 3), "%s" % c["id"][:24], fill="black", font=font)
        dr.text((x + 2, y + T + 9), "f%d %s" % (c["fame"], methods.get(c["id"], "")), fill="gray", font=font)
    sh.save(path)


def cmd_src(cache, sheets, gid, ids):
    """Source pictures with a 10% grid, to read crop=cx,cy,side by eye."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("arial.ttf", 12)
    T = 400
    files = [i for i in ids] or [f.split("__", 1)[1][:-4] for f in os.listdir(os.path.join(cache, "src")) if f.startswith(gid + "__")]
    cols, per = 3, 9
    for page in range(0, len(files), per):
        chunk = files[page:page + per]
        rows = (len(chunk) + cols - 1) // cols
        sh = Image.new("RGB", (cols * (T + 20), rows * (T + 36)), "white")
        dr = ImageDraw.Draw(sh)
        for n, i in enumerate(chunk):
            im, _ = load_image(os.path.join(cache, "src", "%s__%s.img" % (gid, i)))
            W, H = im.size
            s = T / max(W, H)
            im = im.resize((max(1, int(W * s)), max(1, int(H * s))))
            x, y = (n % cols) * (T + 20) + 16, (n // cols) * (T + 36) + 14
            sh.paste(im, (x, y))
            for k in range(1, 10):
                c = (255, 0, 0) if k == 5 else (0, 160, 255)
                gx, gy = x + k * im.size[0] / 10, y + k * im.size[1] / 10
                dr.line((gx, y, gx, y + im.size[1]), fill=c)
                dr.line((x, gy, x + im.size[0], gy), fill=c)
                dr.text((gx - 3, y - 13), str(k), fill="black", font=font)
                dr.text((x - 12, gy - 6), str(k), fill="black", font=font)
            dr.text((x, y + im.size[1] + 2), "%s %dx%d" % (i, W, H), fill="black", font=font)
        path = os.path.join(sheets, "src-%s-%d.png" % (gid, page // per + 1))
        sh.save(path)
        print(path)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cmd, a = sys.argv[1], sys.argv[2:]
    if cmd == "fetch":
        cmd_fetch(a[0], a[1:])
    elif cmd == "pv":
        cmd_pv(a[0], a[1:])
    elif cmd == "build":
        cmd_build(a[0], a[1], a[2], a[3], a[4:])
    elif cmd == "src":
        cmd_src(a[0], a[1], a[2], a[3:])
    else:
        print(__doc__)
