"""Step 1: look up each person's Wikipedia lead image on Wikimedia Commons,
keep only free licences, record credit, and download an 800px copy to a cache.

Usage: python -I tools/deck-fetch.py <cache_dir>
Writes <cache_dir>/meta.json and <cache_dir>/src/<id>.jpg
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, html

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "MysteryFaceDeckBuilder/1.0 (https://github.com/TimothyHadfield/mystery-face; one-off build of a free-licence portrait deck)"
# Free licences only: PD, CC0, CC BY, CC BY-SA, and the UK Open Government Licence
# (OGL 3 is designed to be compatible with CC BY 4.0). GFDL-only files are skipped.
FREE = re.compile(r"^(cc0|cc[- ]by(-sa)?([- ]\d(\.\d)?)?.*|public domain|pd.*|attribution.*|ogl.*|no restrictions)$", re.I)


def get(url, binary=False, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # rate limit / transient
            wait = 5 * (i + 1)
            print("  retry", i + 1, e, "wait", wait, flush=True)
            time.sleep(wait)
    raise RuntimeError("failed " + url)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load_people():
    people = []
    for line in open(os.path.join(HERE, "deck-people.txt"), encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        deck, title, tags = parts[0], parts[1], parts[2]
        mixed = len(parts) > 3 and parts[3] == "*"
        name = re.sub(r"\s*\(.*\)$", "", title)
        p = {"deck": deck, "title": title, "name": name, "id": slug(name),
             "tags": [t.strip() for t in tags.split(",") if t.strip()], "mixed": mixed}
        for extra in parts[4:]:  # file=<Commons file>  crop=x,y,side (fractions of width/height/width)
            if extra.startswith("file="):
                p["file"] = extra[5:]
            elif extra.startswith("crop="):
                p["crop"] = [float(v) for v in extra[5:].split(",")]
        people.append(p)
    return people


def load_overrides():
    p = os.path.join(HERE, "deck-overrides.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def text(v):
    v = html.unescape(re.sub(r"<[^>]+>", "", v or "")).strip()
    return re.sub(r"\s+", " ", v)


def main():
    cache = sys.argv[1]
    os.makedirs(os.path.join(cache, "src"), exist_ok=True)
    people = load_people()
    over = load_overrides()
    for p in people:
        if "file" in p:
            over[p["title"]] = p["file"]
    meta_path = os.path.join(cache, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}

    # 1. lead image file names, 40 titles per request
    todo = [p for p in people if p["id"] not in meta or meta[p["id"]].get("file") != over.get(p["title"], meta[p["id"]].get("file"))]
    need_lookup = [p for p in todo if p["title"] not in over]
    for i in range(0, len(need_lookup), 40):
        batch = need_lookup[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "pageimages",
                                    "piprop": "name", "pilicense": "free", "titles": "|".join(p["title"] for p in batch)})
        d = get("https://en.wikipedia.org/w/api.php?" + q)["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for n in d.get(k, []):
                alias[n["to"]] = alias.get(n["from"], n["from"])
        byt = {}
        for pg in d["pages"].values():
            t = pg["title"]
            src = t
            while src in alias:
                src = alias[src]
            byt[src] = pg.get("pageimage")
            byt[t] = pg.get("pageimage")
        for p in batch:
            f = byt.get(p["title"]) or byt.get(p["title"].replace("_", " "))
            meta[p["id"]] = {"file": f, "title": p["title"]}
        time.sleep(1)
    for p in todo:
        if p["title"] in over:
            meta[p["id"]] = {"file": over[p["title"]], "title": p["title"]}

    # 2. Commons licence + thumb url
    for p in todo:
        m = meta[p["id"]]
        f = m.get("file")
        if not f or f.startswith("DROP"):
            m["drop"] = f or "no free lead image on Wikipedia"
            continue
        q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "File:" + f, "prop": "imageinfo",
                                    "iiprop": "url|size|extmetadata", "iiurlwidth": 900})
        d = get("https://commons.wikimedia.org/w/api.php?" + q)["query"]["pages"]
        pg = list(d.values())[0]
        if "imageinfo" not in pg:
            m["drop"] = "file not on Commons"
            continue
        ii = pg["imageinfo"][0]
        em = ii.get("extmetadata", {})
        lic = text(em.get("LicenseShortName", {}).get("value"))
        nonfree = text(em.get("NonFree", {}).get("value"))
        m.update({
            "license": lic, "licenseUrl": text(em.get("LicenseUrl", {}).get("value")),
            "author": text(em.get("Artist", {}).get("value")) or text(em.get("Credit", {}).get("value")) or "Unknown",
            "source": ii.get("descriptionurl"), "w": ii.get("width"), "h": ii.get("height"), "thumb": ii.get("thumburl"),
        })
        m.pop("drop", None)
        if nonfree.lower() == "true" or not FREE.match(lic):
            m["drop"] = "licence not free: " + lic
            continue
        time.sleep(0.5)

    # 3. download thumbs
    for p in people:
        m = meta.get(p["id"], {})
        if m.get("drop"):
            continue
        out = os.path.join(cache, "src", p["id"] + ".img")
        if os.path.exists(out) and m.get("got") == m.get("file"):
            continue
        open(out, "wb").write(get(m["thumb"], binary=True))
        m["got"] = m["file"]
        print("got", p["id"], m["license"], flush=True)
        time.sleep(1)

    json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    drops = {k: v["drop"] for k, v in meta.items() if v.get("drop")}
    print("people", len(people), "dropped", len(drops))
    for k, v in drops.items():
        print("  DROP", k, "-", v)


if __name__ == "__main__":
    main()
