"""Step 4 (after deck-build.py): add "gender" and "kind" to every card, write the
"Movie characters" deck (name + film; free-licence cosplay photos already in
decks/characters/ are kept, the rest stay name tiles),
and rebuild "Mixed stars" as a balanced mix (about half women, actors <= 25%,
politics <= 15%, about 20% characters). Then run deck-credits.py.

Usage: python -I tools/deck-meta.py      (idempotent; reads and rewrites decks/)
gender: f / m / x (x = no clear gender).  kind: actor, music, sports, politics,
history, internet, tv, character, art.
"""
import json, os, shutil, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKS = os.path.join(ROOT, "decks")

FEMALE = set("""
anne-hathaway awkwafina betty-white emma-chamberlain emma-stone emma-watson florence-pugh gal-gadot
jenna-ortega jennifer-aniston jennifer-lawrence julia-roberts kristen-stewart lilly-singh lucy-liu
lupita-nyong-o margot-robbie martha-stewart meryl-streep michelle-yeoh millie-bobby-brown natalie-portman
oprah-winfrey pokimane sandra-bullock scarlett-johansson sofia-vergara viola-davis zendaya
adele alicia-keys aretha-franklin ariana-grande beyonce billie-eilish cardi-b chappell-roan cher doja-cat
dolly-parton dua-lipa jennifer-lopez katy-perry kelly-clarkson lady-gaga lizzo lorde madonna miley-cyrus
nicki-minaj olivia-rodrigo rihanna sabrina-carpenter selena-gomez shakira shania-twain sza taylor-swift
tina-turner whitney-houston
alex-morgan billie-jean-king caitlin-clark coco-gauff katie-ledecky kristi-yamaguchi lindsey-vonn
megan-rapinoe mia-hamm naomi-osaka ronda-rousey serena-williams sha-carri-richardson simone-biles sue-bird
venus-williams
alexandria-ocasio-cortez amelia-earhart audrey-hepburn condoleezza-rice diana-princess-of-wales
eleanor-roosevelt elizabeth-ii frida-kahlo harriet-tubman helen-keller hillary-clinton jane-goodall
kamala-harris marie-curie marilyn-monroe michelle-obama mother-teresa nancy-pelosi rosa-parks
ruth-bader-ginsburg sally-ride susan-b-anthony
alice betty-boop dorothy girl-with-a-pearl-earring mona-lisa olive-oyl rosie-the-riveter
""".split())
NO_GENDER = {"krazy-kat", "cheshire-cat", "the-scream"}

# kind overrides (otherwise taken from the deck and tags)
KIND = {
    "john-cena": "actor", "ice-cube": "music", "selena-gomez": "music", "kelly-clarkson": "music",
    "audrey-hepburn": "actor", "marilyn-monroe": "actor", "charlie-chaplin": "actor",
    "bob-ross": "tv", "fred-rogers": "tv",
    "ludwig-van-beethoven": "music", "wolfgang-amadeus-mozart": "music",
    "leonardo-da-vinci": "art", "vincent-van-gogh": "art", "frida-kahlo": "art",
    # recent presidents count as politics, older ones as history
    "barack-obama": "politics", "bill-clinton": "politics", "george-h-w-bush": "politics",
    "george-w-bush": "politics", "jimmy-carter": "politics", "ronald-reagan": "politics",
    "american-gothic-farmer": "art", "girl-with-a-pearl-earring": "art", "mona-lisa": "art",
    "the-scream": "art",
}

# Movie characters deck: (name, from, gender, tags). Pictures (cosplay photos) are kept from the existing deck.json.
CHARACTERS = [
    # women
    ("Elsa", "Frozen", "f", "disney"), ("Anna", "Frozen", "f", "disney"), ("Moana", "Moana", "f", "disney"),
    ("Rapunzel", "Tangled", "f", "disney"), ("Mulan", "Mulan", "f", "disney"),
    ("Ariel", "The Little Mermaid", "f", "disney"), ("Belle", "Beauty and the Beast", "f", "disney"),
    ("Cinderella", "Cinderella", "f", "disney"), ("Jasmine", "Aladdin", "f", "disney"),
    ("Tiana", "The Princess and the Frog", "f", "disney"), ("Merida", "Brave", "f", "pixar"),
    ("Mirabel", "Encanto", "f", "disney"), ("Judy Hopps", "Zootopia", "f", "disney"),
    ("Maleficent", "Sleeping Beauty", "f", "disney,villain"), ("Ursula", "The Little Mermaid", "f", "disney,villain"),
    ("Princess Fiona", "Shrek", "f", "dreamworks"), ("Jessie", "Toy Story", "f", "pixar"),
    ("Dory", "Finding Nemo", "f", "pixar"), ("Joy", "Inside Out", "f", "pixar"),
    ("Elastigirl", "The Incredibles", "f", "pixar"), ("Edna Mode", "The Incredibles", "f", "pixar"),
    ("Boo", "Monsters, Inc.", "f", "pixar"),
    ("Black Widow", "Marvel", "f", "superhero"), ("Wonder Woman", "DC", "f", "superhero"),
    ("Captain Marvel", "Marvel", "f", "superhero"), ("Harley Quinn", "DC", "f", "superhero,villain"),
    ("Hermione Granger", "Harry Potter", "f", "fantasy"), ("Princess Leia", "Star Wars", "f", "scifi"),
    ("Rey", "Star Wars", "f", "scifi"), ("Katniss Everdeen", "The Hunger Games", "f", "action"),
    ("Wednesday Addams", "Wednesday", "f", "tv"), ("Eleven", "Stranger Things", "f", "tv"),
    ("Barbie", "Barbie", "f", "toy"), ("Elle Woods", "Legally Blonde", "f", "comedy"),
    ("Princess Peach", "Super Mario", "f", "game"), ("Dora", "Dora the Explorer", "f", "tv,kids"),
    ("Marge Simpson", "The Simpsons", "f", "tv,cartoon"), ("Lisa Simpson", "The Simpsons", "f", "tv,cartoon"),
    ("Velma", "Scooby-Doo", "f", "tv,cartoon"), ("Minnie Mouse", "Disney", "f", "disney"),
    # men
    ("Flynn Rider", "Tangled", "m", "disney"), ("Shrek", "Shrek", "m", "dreamworks"),
    ("Donkey", "Shrek", "m", "dreamworks"), ("Olaf", "Frozen", "m", "disney"),
    ("Simba", "The Lion King", "m", "disney"), ("Stitch", "Lilo & Stitch", "m", "disney"),
    ("Aladdin", "Aladdin", "m", "disney"), ("Genie", "Aladdin", "m", "disney"),
    ("Woody", "Toy Story", "m", "pixar"), ("Buzz Lightyear", "Toy Story", "m", "pixar"),
    ("Mike Wazowski", "Monsters, Inc.", "m", "pixar"), ("Sulley", "Monsters, Inc.", "m", "pixar"),
    ("Lightning McQueen", "Cars", "m", "pixar"),
    ("Thanos", "Marvel", "m", "superhero,villain"), ("Iron Man", "Marvel", "m", "superhero"),
    ("Spider-Man", "Marvel", "m", "superhero"), ("Captain America", "Marvel", "m", "superhero"),
    ("Thor", "Marvel", "m", "superhero"), ("Hulk", "Marvel", "m", "superhero"),
    ("Batman", "DC", "m", "superhero"), ("Superman", "DC", "m", "superhero"),
    ("The Joker", "DC", "m", "superhero,villain"),
    ("Harry Potter", "Harry Potter", "m", "fantasy"), ("Dumbledore", "Harry Potter", "m", "fantasy"),
    ("Voldemort", "Harry Potter", "m", "fantasy,villain"), ("Gandalf", "The Lord of the Rings", "m", "fantasy"),
    ("Darth Vader", "Star Wars", "m", "scifi,villain"), ("Yoda", "Star Wars", "m", "scifi"),
    ("Luke Skywalker", "Star Wars", "m", "scifi"), ("Jack Sparrow", "Pirates of the Caribbean", "m", "action"),
    ("SpongeBob", "SpongeBob SquarePants", "m", "tv,cartoon"), ("Patrick Star", "SpongeBob SquarePants", "m", "tv,cartoon"),
    ("Homer Simpson", "The Simpsons", "m", "tv,cartoon"), ("Scooby-Doo", "Scooby-Doo", "m", "tv,cartoon"),
    ("Kermit the Frog", "The Muppets", "m", "tv"), ("Mario", "Super Mario", "m", "game"),
    ("Luigi", "Super Mario", "m", "game"), ("Sonic", "Sonic the Hedgehog", "m", "game"),
    ("Minions", "Despicable Me", "x", "cartoon"), ("Pikachu", "Pokémon", "x", "game"),
]

# Mixed stars: (source deck, id). Name tiles come from "characters".
MIXED = [
    # women (real)
    ("music", "taylor-swift"), ("music", "beyonce"), ("music", "rihanna"), ("music", "ariana-grande"),
    ("music", "billie-eilish"), ("music", "lady-gaga"), ("music", "dolly-parton"), ("music", "adele"),
    ("music", "sabrina-carpenter"), ("music", "olivia-rodrigo"),
    ("movies", "zendaya"), ("movies", "margot-robbie"), ("movies", "meryl-streep"), ("movies", "emma-watson"),
    ("movies", "jenna-ortega"), ("movies", "jennifer-lawrence"),
    ("sports", "serena-williams"), ("sports", "simone-biles"), ("sports", "caitlin-clark"), ("sports", "coco-gauff"),
    ("movies", "oprah-winfrey"), ("movies", "betty-white"), ("movies", "pokimane"),
    ("history", "elizabeth-ii"), ("history", "marie-curie"), ("history", "amelia-earhart"),
    ("history", "rosa-parks"), ("history", "frida-kahlo"), ("history", "marilyn-monroe"),
    ("history", "michelle-obama"), ("history", "kamala-harris"),
    # men (real)
    ("music", "ed-sheeran"), ("music", "bruno-mars"), ("music", "harry-styles"), ("music", "snoop-dogg"),
    ("music", "elton-john"), ("music", "bad-bunny"),
    ("movies", "dwayne-johnson"), ("movies", "tom-hanks"), ("movies", "keanu-reeves"), ("movies", "pedro-pascal"),
    ("movies", "ryan-reynolds"), ("movies", "jack-black"), ("movies", "morgan-freeman"),
    ("movies", "leonardo-dicaprio"), ("movies", "tom-holland"), ("movies", "jackie-chan"),
    ("sports", "lebron-james"), ("sports", "lionel-messi"), ("sports", "cristiano-ronaldo"),
    ("sports", "michael-jordan"), ("sports", "shohei-ohtani"), ("sports", "stephen-curry"),
    ("sports", "tom-brady"), ("sports", "usain-bolt"),
    ("movies", "mrbeast"), ("movies", "gordon-ramsay"), ("history", "bob-ross"), ("history", "fred-rogers"),
    ("history", "abraham-lincoln"), ("history", "albert-einstein"), ("history", "martin-luther-king-jr"),
    ("history", "george-washington"),
    ("history", "barack-obama"), ("history", "donald-trump"), ("history", "joe-biden"),
    # characters and art with public-domain pictures
    ("cartoons", "mickey-mouse"), ("cartoons", "popeye"), ("cartoons", "betty-boop"), ("cartoons", "alice"),
    ("cartoons", "dorothy"), ("cartoons", "olive-oyl"), ("cartoons", "mona-lisa"),
    # name tiles
    ("characters", "elsa"), ("characters", "moana"), ("characters", "rapunzel"),
    ("characters", "hermione-granger"), ("characters", "wonder-woman"), ("characters", "barbie"),
    ("characters", "shrek"), ("characters", "thanos"), ("characters", "flynn-rider"), ("characters", "spongebob"),
]

INDEX = [
    ("mixed", "Mixed stars"), ("movies", "Movies, TV & Internet"), ("characters", "Movie characters"),
    ("music", "Music"), ("sports", "Sports"), ("history", "History & Politics"), ("cartoons", "Cartoons & Classics"),
]


def slug(s):
    out = "".join(c.lower() if c.isalnum() else "-" for c in s.replace("é", "e").replace("'", "-"))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def kind_of(deck, p):
    if p["id"] in KIND:
        return KIND[p["id"]]
    t = p.get("tags", [])
    if deck == "movies":
        return "tv" if "tv" in t else "internet" if "internet" in t else "actor"
    if deck in ("music", "sports"):
        return deck
    if deck == "history":
        return "politics" if "politics" in t else "history"
    if deck in ("cartoons", "sample", "characters"):
        return "character"
    raise ValueError(p["id"])


def gender_of(deck, p):
    if deck == "sample":
        return "x"
    if p["id"] in NO_GENDER:
        return "x"
    return "f" if p["id"] in FEMALE else "m"


def load(d):
    return json.load(open(os.path.join(DECKS, d, "deck.json"), encoding="utf-8"))


def save(d, deck):
    json.dump(deck, open(os.path.join(DECKS, d, "deck.json"), "w", encoding="utf-8", newline="\n"),
              indent=1, ensure_ascii=False)


def main():
    by = {}
    for d in ("movies", "music", "sports", "history", "cartoons", "sample"):
        deck = load(d)
        for p in deck["people"]:
            p["gender"] = gender_of(d, p)
            p["kind"] = kind_of(d, p)
            by[(d, p["id"])] = p
        save(d, deck)
    unknown = [i for i in FEMALE | NO_GENDER | set(KIND) if not any(k[1] == i for k in by)]
    assert not unknown, unknown

    # keep pictures already added to character cards (cosplay photos, see CREDITS.md)
    cpath = os.path.join(DECKS, "characters", "deck.json")
    old = {p["id"]: p for p in json.load(open(cpath, encoding="utf-8"))["people"]} if os.path.exists(cpath) else {}
    chars = []
    for name, src, g, tags in CHARACTERS:
        p = {"id": slug(name), "name": name, "from": src, "gender": g, "kind": "character",
             "tags": ["character"] + tags.split(",")}
        o = old.get(p["id"], {})
        if o.get("img") and os.path.exists(os.path.join(DECKS, "characters", o["img"])):
            p["img"], p["credit"] = o["img"], o["credit"]
        chars.append(p)
        by[("characters", p["id"])] = p
    ids = [p["id"] for p in chars]
    assert len(ids) == len(set(ids))
    chars.sort(key=lambda p: p["name"].lower())
    os.makedirs(os.path.join(DECKS, "characters"), exist_ok=True)
    save("characters", {"id": "characters", "title": "Movie characters", "people": chars})

    mixdir = os.path.join(DECKS, "mixed", "img")
    shutil.rmtree(mixdir, ignore_errors=True)
    os.makedirs(mixdir)
    mixed = []
    for d, i in MIXED:
        p = dict(by[(d, i)])
        if p.get("img"):
            shutil.copyfile(os.path.join(DECKS, d, p["img"]), os.path.join(DECKS, "mixed", p["img"]))
        mixed.append(p)
    assert len({p["id"] for p in mixed}) == len(mixed)
    mixed.sort(key=lambda p: p["name"].lower())
    save("mixed", {"id": "mixed", "title": "Mixed stars", "people": mixed})

    index = [{"id": d, "title": t, "count": len(load(d)["people"])} for d, t in INDEX]
    json.dump(index, open(os.path.join(DECKS, "index.json"), "w", encoding="utf-8", newline="\n"),
              indent=1, ensure_ascii=False)

    for d, _ in INDEX + [("sample", "")]:
        ppl = load(d)["people"]
        g = collections.Counter(p["gender"] for p in ppl)
        k = collections.Counter(p["kind"] for p in ppl)
        n = len(ppl)
        print("%-10s %3d  f %d%% m %d%% x %d  | %s | no-img %d" % (
            d, n, 100 * g["f"] // n, 100 * g["m"] // n, g["x"],
            ", ".join("%s %d" % kv for kv in k.most_common()), sum(1 for p in ppl if not p.get("img"))))


if __name__ == "__main__":
    main()
