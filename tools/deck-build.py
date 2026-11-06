"""Step 2: crop every cached portrait to a 256x256 face-centred WebP (<= 20 KB),
write decks/<deck>/deck.json + img/, decks/index.json, a credits list and
contact sheets for checking by eye.

Usage: python -I tools/deck-build.py <cache_dir> <yunet.onnx> <sheet_dir>
Face detection: OpenCV YuNet (free, offline model file from opencv_zoo).
"""
import importlib.util, io, json, os, shutil, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("deckfetch", os.path.join(HERE, "deck-fetch.py"))
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)

DECKS = [  # id, title (Mixed first = default)
    ("mixed", "Mixed stars"),
    ("movies", "Movies, TV & Internet"),
    ("music", "Music"),
    ("sports", "Sports"),
    ("history", "History & Politics"),
    ("cartoons", "Cartoons & Classics"),
]
SIZE, MAX_BYTES = 256, 20000


def load_image(path):
    im = Image.open(path)
    im.seek(0)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    return im.convert("RGB")


def detect(det, im):
    arr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(arr)
    if faces is None:
        return []
    return sorted([(float(f[14]), float(f[0]), float(f[1]), float(f[2]), float(f[3])) for f in faces],
                  key=lambda f: -(f[3] * f[4]))


def square(im, cx, cy, side):
    W, H = im.size
    side = min(side, W, H)
    x0 = min(max(cx - side / 2, 0), W - side)
    y0 = min(max(cy - side / 2, 0), H - side)
    return (x0, y0, x0 + side, y0 + side)


def encode(im):
    for q in list(range(84, 30, -6)) + [26, 20, 14]:
        b = io.BytesIO()
        im.save(b, "WEBP", quality=q, method=6)
        if b.tell() <= MAX_BYTES:
            return b.getvalue(), q
    return b.getvalue(), q


def main():
    cache, model, sheets = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(sheets, exist_ok=True)
    meta = json.load(open(os.path.join(cache, "meta.json"), encoding="utf-8"))
    people = fetch.load_people()
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    out_root = os.path.join(ROOT, "decks")
    for d, _ in DECKS:
        shutil.rmtree(os.path.join(out_root, d), ignore_errors=True)
        os.makedirs(os.path.join(out_root, d, "img"))
    decks = {d: [] for d, _ in DECKS}
    flags, dropped, seen = [], [], set()
    for p in people:
        m = meta.get(p["id"])
        if p["id"] in seen:
            dropped.append((p["name"], "duplicate entry"))
            continue
        seen.add(p["id"])
        if not m or m.get("drop"):
            dropped.append((p["name"], (m or {}).get("drop", "not fetched")))
            continue
        src = os.path.join(cache, "src", p["id"] + ".img")
        im = load_image(src)
        W, H = im.size
        note = ""
        if "crop" in p:
            cx, cy, head = p["crop"]  # head centre (fractions of W, H) and head width (fraction of W)
            box = square(im, cx * W, cy * H, head * W * 1.7)
            note = "manual crop"
        else:
            faces = detect(det, im)
            if faces:
                sc, fx, fy, fw, fh = faces[0]
                side = max(fw, fh) * 2.1
                box = square(im, fx + fw / 2, fy + fh * 0.42, side)
                if fw < 60:
                    note = "small face %dpx" % fw
                if len(faces) > 1 and faces[1][3] * faces[1][4] > 0.35 * fw * fh:
                    note += " multiple faces"
                if sc < 0.8:
                    note += " low score %.2f" % sc
            else:
                side = min(W, H)
                box = square(im, W / 2, side / 2, side)
                note = "NO FACE FOUND - upper crop"
        tile = im.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
        data, q = encode(tile)
        if note:
            flags.append((p["deck"], p["name"], note.strip()))
        lic = m["license"]
        entry = {"id": p["id"], "name": p["name"], "img": "img/%s.webp" % p["id"], "tags": p["tags"],
                 "credit": {"author": m["author"], "license": lic, "licenseUrl": m.get("licenseUrl", ""),
                            "source": m["source"]}}
        targets = [p["deck"]] + (["mixed"] if p["mixed"] else [])
        for d in targets:
            open(os.path.join(out_root, d, "img", p["id"] + ".webp"), "wb").write(data)
            decks[d].append(entry)
    index = []
    for d, title in DECKS:
        people_d = sorted(decks[d], key=lambda e: e["name"].lower())
        json.dump({"id": d, "title": title, "people": people_d},
                  open(os.path.join(out_root, d, "deck.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        index.append({"id": d, "title": title, "count": len(people_d)})
        for k in range(0, len(people_d), 40):
            contact_sheet(out_root, d, "%s %d-" % (title, k), people_d[k:k + 40],
                          os.path.join(sheets, "sheet-%s-%d.png" % (d, k // 40 + 1)), k)
    json.dump(index, open(os.path.join(out_root, "index.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    report = {"index": index, "dropped": dropped, "flags": flags}
    json.dump(report, open(os.path.join(sheets, "report.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for row in index:
        print(row)
    print("DROPPED", len(dropped))
    for r in dropped:
        print("  ", r)
    print("FLAGS", len(flags))
    for r in flags:
        print("  ", r)


def contact_sheet(out_root, d, title, people, path, base=0):
    T, cols = 160, 8
    rows = (len(people) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * T, rows * (T + 18) + 24), "white")
    dr = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 12)
    except Exception:
        font = None
    dr.text((4, 4), "%s (%d)" % (title, len(people)), fill="black", font=font)
    for i, e in enumerate(people):
        im = Image.open(os.path.join(out_root, d, e["img"])).convert("RGB").resize((T - 4, T - 4))
        x, y = (i % cols) * T, 24 + (i // cols) * (T + 18)
        sheet.paste(im, (x + 2, y))
        dr.text((x + 2, y + T - 2), "%d %s" % (base + i, e["name"][:24]), fill="black", font=font)
    sheet.save(path)


if __name__ == "__main__":
    main()
