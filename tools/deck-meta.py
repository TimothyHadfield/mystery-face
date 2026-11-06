"""Step 4 (after deck-build.py): add "gender" and "kind" to every card, write the
"Movie characters" deck (name + film + franchise + sub live/animated (+ actor);
its pictures are the studios' character images, picked and cropped by hand and
already in decks/characters/img/: this script NEVER fetches or overwrites them,
it only keeps the img + credit already in deck.json),
and rebuild "Mixed stars" as a balanced mix (~45% characters, actors shown as a
role they play, ~18% athletes, ~12% politicians, about half women, <= 3 per
franchise). Then run deck-credits.py.

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

# Movie characters deck: (name, from, gender, tags). Pictures are kept from the existing deck.json.
CHARACTERS = [
    # actors shown as a role they play (Mixed uses these instead of the actor's own photo)
    ("Miranda Priestly", "The Devil Wears Prada", "f", "comedy"), ("Rue Bennett", "Euphoria", "f", "tv"),
    ("Rachel Green", "Friends", "f", "tv,comedy"), ("Mia Thermopolis", "The Princess Diaries", "f", "disney,comedy"),
    ("John Wick", "John Wick", "m", "action"), ("Forrest Gump", "Forrest Gump", "m", "drama"),
    ("Jack Dawson", "Titanic", "m", "drama"), ("Joel Miller", "The Last of Us", "m", "tv"),
    ("Deadpool", "Marvel", "m", "superhero"), ("Red Redding", "The Shawshank Redemption", "m", "drama"),
    ("Maui", "Moana", "m", "disney"), ("Po", "Kung Fu Panda", "m", "dreamworks"),
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

# Live-action (or puppet) characters: id -> actor ("" = no single actor to name). The rest are animated/drawn.
LIVE = {
    "black-widow": "Scarlett Johansson", "wonder-woman": "Gal Gadot", "captain-marvel": "Brie Larson",
    "harley-quinn": "Margot Robbie", "hermione-granger": "Emma Watson", "princess-leia": "Carrie Fisher",
    "rey": "Daisy Ridley", "katniss-everdeen": "Jennifer Lawrence", "wednesday-addams": "Jenna Ortega",
    "eleven": "Millie Bobby Brown", "barbie": "Margot Robbie", "elle-woods": "Reese Witherspoon",
    "thanos": "Josh Brolin", "iron-man": "Robert Downey Jr.", "spider-man": "Tom Holland",
    "captain-america": "Chris Evans", "thor": "Chris Hemsworth", "hulk": "Mark Ruffalo", "batman": "Ben Affleck",
    "the-joker": "Heath Ledger", "harry-potter": "Daniel Radcliffe", "dumbledore": "Michael Gambon",
    "voldemort": "Ralph Fiennes", "gandalf": "Ian McKellen", "darth-vader": "", "yoda": "Frank Oz",
    "luke-skywalker": "Mark Hamill", "jack-sparrow": "Johnny Depp", "kermit-the-frog": "",
    "miranda-priestly": "Meryl Streep", "rue-bennett": "Zendaya", "rachel-green": "Jennifer Aniston",
    "mia-thermopolis": "Anne Hathaway", "john-wick": "Keanu Reeves", "forrest-gump": "Tom Hanks",
    "jack-dawson": "Leonardo DiCaprio", "joel-miller": "Pedro Pascal", "deadpool": "Ryan Reynolds",
    "red-redding": "Morgan Freeman",
}
VOICE = {"maui": "Dwayne Johnson", "po": "Jack Black"}  # animated roles of actors from the actors deck

# franchise (so a board can avoid two from the same world); default = "from"
FRANCHISE = {
    "minnie-mouse": "Mickey Mouse", "mickey-mouse": "Mickey Mouse", "popeye": "Popeye", "olive-oyl": "Popeye",
    "alice": "Alice in Wonderland", "cheshire-cat": "Alice in Wonderland", "mad-hatter": "Alice in Wonderland",
    "humpty-dumpty": "Alice in Wonderland",
    "dorothy": "The Wizard of Oz", "the-cowardly-lion": "The Wizard of Oz", "the-scarecrow": "The Wizard of Oz",
    "winnie-the-pooh": "Winnie-the-Pooh", "piglet": "Winnie-the-Pooh", "koko-the-clown": "Out of the Inkwell",
}

# studio credited for each franchise's character pictures (default Disney)
STUDIO = {
    "Toy Story": "Disney / Pixar", "Brave": "Disney / Pixar", "Finding Nemo": "Disney / Pixar",
    "Inside Out": "Disney / Pixar", "The Incredibles": "Disney / Pixar", "Monsters, Inc.": "Disney / Pixar",
    "Cars": "Disney / Pixar", "Marvel": "Marvel Studios", "Star Wars": "Lucasfilm",
    "Harry Potter": "Warner Bros.", "DC": "Warner Bros. / DC", "The Lord of the Rings": "New Line Cinema",
    "Barbie": "Warner Bros. / Mattel", "Scooby-Doo": "Warner Bros. / Hanna-Barbera", "Friends": "Warner Bros. Television",
    "Shrek": "DreamWorks Animation", "Kung Fu Panda": "DreamWorks Animation", "The Hunger Games": "Lionsgate",
    "John Wick": "Lionsgate", "Wednesday": "Netflix", "Stranger Things": "Netflix", "Legally Blonde": "MGM",
    "Super Mario": "Nintendo", "Pokémon": "The Pokémon Company / Nintendo", "Dora the Explorer": "Nickelodeon",
    "SpongeBob SquarePants": "Nickelodeon", "The Simpsons": "20th Television / Gracie Films",
    "Sonic the Hedgehog": "Sega", "Despicable Me": "Illumination", "The Devil Wears Prada": "20th Century Studios",
    "Euphoria": "HBO", "The Last of Us": "HBO", "Forrest Gump": "Paramount Pictures",
    "Titanic": "Paramount / 20th Century", "The Shawshank Redemption": "Columbia Pictures",
    "The Muppets": "Disney / The Muppets Studio",
}

# Mixed stars: (source deck, id). Actors appear only as a role they play (from the characters deck).
MIXED = [
    # characters, women: animated
    ("characters", "elsa"), ("characters", "moana"), ("characters", "rapunzel"), ("characters", "ariel"),
    ("characters", "mulan"), ("characters", "tiana"), ("characters", "judy-hopps"),
    ("characters", "princess-fiona"), ("characters", "dory"), ("characters", "marge-simpson"),
    ("characters", "velma"), ("characters", "princess-peach"), ("cartoons", "betty-boop"),
    # characters, women: live action
    ("characters", "hermione-granger"), ("characters", "wonder-woman"), ("characters", "barbie"),
    ("characters", "katniss-everdeen"), ("characters", "wednesday-addams"), ("characters", "princess-leia"),
    ("characters", "eleven"), ("characters", "elle-woods"), ("characters", "miranda-priestly"),
    ("characters", "rue-bennett"), ("characters", "rachel-green"), ("characters", "mia-thermopolis"),
    ("characters", "harley-quinn"),
    # characters, men: animated
    ("characters", "shrek"), ("characters", "stitch"), ("characters", "woody"), ("characters", "spongebob"),
    ("characters", "homer-simpson"), ("characters", "mario"), ("characters", "pikachu"), ("characters", "simba"),
    ("characters", "mike-wazowski"), ("characters", "maui"), ("characters", "po"), ("characters", "scooby-doo"),
    ("cartoons", "mickey-mouse"), ("cartoons", "popeye"),
    # characters, men: live action
    ("characters", "thanos"), ("characters", "harry-potter"), ("characters", "darth-vader"),
    ("characters", "jack-sparrow"), ("characters", "gandalf"), ("characters", "iron-man"),
    ("characters", "john-wick"), ("characters", "forrest-gump"), ("characters", "jack-dawson"),
    ("characters", "joel-miller"), ("characters", "deadpool"), ("characters", "red-redding"),
    # athletes
    ("sports", "serena-williams"), ("sports", "simone-biles"), ("sports", "caitlin-clark"), ("sports", "coco-gauff"),
    ("sports", "naomi-osaka"), ("sports", "alex-morgan"), ("sports", "katie-ledecky"), ("sports", "lindsey-vonn"),
    ("sports", "sha-carri-richardson"), ("sports", "ronda-rousey"),
    ("sports", "lebron-james"), ("sports", "lionel-messi"), ("sports", "cristiano-ronaldo"),
    ("sports", "michael-jordan"), ("sports", "shohei-ohtani"), ("sports", "stephen-curry"),
    ("sports", "tom-brady"), ("sports", "usain-bolt"), ("sports", "tiger-woods"), ("sports", "patrick-mahomes"),
    # politicians (both parties)
    ("history", "kamala-harris"), ("history", "michelle-obama"), ("history", "alexandria-ocasio-cortez"),
    ("history", "hillary-clinton"), ("history", "nancy-pelosi"), ("history", "condoleezza-rice"),
    ("history", "barack-obama"), ("history", "donald-trump"), ("history", "joe-biden"),
    ("history", "bernie-sanders"), ("history", "george-w-bush"), ("history", "mitt-romney"), ("history", "jd-vance"),
    # music
    ("music", "taylor-swift"), ("music", "beyonce"), ("music", "rihanna"), ("music", "ariana-grande"),
    ("music", "billie-eilish"), ("music", "lady-gaga"), ("music", "dolly-parton"), ("music", "adele"),
    ("music", "ed-sheeran"), ("music", "bruno-mars"), ("music", "snoop-dogg"), ("music", "elton-john"),
    ("music", "bad-bunny"),
    # history, art, TV and internet
    ("history", "marie-curie"), ("history", "amelia-earhart"), ("history", "rosa-parks"), ("history", "elizabeth-ii"),
    ("history", "frida-kahlo"), ("cartoons", "mona-lisa"), ("movies", "oprah-winfrey"),
    ("history", "abraham-lincoln"), ("history", "albert-einstein"), ("history", "martin-luther-king-jr"),
    ("history", "george-washington"), ("history", "bob-ross"), ("movies", "mrbeast"), ("movies", "gordon-ramsay"),
]
MAX_PER_FRANCHISE = 3

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
            if p["kind"] == "character":
                p["sub"] = "animated"
                p["franchise"] = FRANCHISE.get(p["id"], p["name"])
            by[(d, p["id"])] = p
        save(d, deck)
    unknown = [i for i in FEMALE | NO_GENDER | set(KIND) if not any(k[1] == i for k in by)]
    assert not unknown, unknown

    # keep the pictures already on character cards (studio images, see CREDITS.md); never touch the files
    cpath = os.path.join(DECKS, "characters", "deck.json")
    old = {p["id"]: p for p in json.load(open(cpath, encoding="utf-8"))["people"]} if os.path.exists(cpath) else {}
    chars = []
    for name, src, g, tags in CHARACTERS:
        i = slug(name)
        p = {"id": i, "name": name, "from": src, "gender": g, "kind": "character",
             "sub": "live" if i in LIVE else "animated", "franchise": FRANCHISE.get(i, src),
             "tags": ["character"] + tags.split(",")}
        if LIVE.get(i) or VOICE.get(i):
            p["actor"] = LIVE.get(i) or VOICE[i]
        o = old.get(i, {})
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
    assert not [p["id"] for p in mixed if p["kind"] == "actor"], "Mixed shows actors as their roles"
    fr = collections.Counter(p["franchise"] for p in mixed if p.get("franchise"))
    assert max(fr.values()) <= MAX_PER_FRANCHISE, fr.most_common(3)
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
