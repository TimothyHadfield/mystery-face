# Credits

Mystery Face is an original game. It is not affiliated with Hasbro or with any person or character shown on the cards.

## Card pictures

The pictures of real people and of the "Cartoons & Classics" cards come from **Wikimedia Commons** and use a free licence:

| Licence | Cards |
|---|---|
| Public domain | 121 |
| CC BY-SA (2.0 / 3.0 / 4.0) | 105 |
| CC BY (2.0 / 3.0 / 4.0) | 91 |
| CC0 | 9 |
| UK Open Government Licence 3.0 (CC BY compatible) | 2 |

That is 328 distinct Commons pictures. The 92 "Movie characters" pictures are not free: they are the studios' own character images (see below). Each picture was cropped to the face and resized to 256×256 WebP. Nothing else was changed.

**The full list of authors, licences and source pages, one line per picture, is in [decks/credits.txt](decks/credits.txt).** The same details are stored with every card in `decks/<deck>/deck.json` under `credit` (`author`, `license`, `licenseUrl`, `source`).

CC BY and CC BY-SA pictures are used under those licences. Our cropped versions of the CC BY-SA pictures are shared under the same licence as their originals.

Licence texts:
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- Open Government Licence 3.0: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

Cartoon and storybook characters ("Cartoons & Classics") use only artwork that is in the public domain in the US, such as the 1928 *Steamboat Willie* frame, the 1929 *Thimble Theatre* Popeye strip, E. H. Shepard's 1926 Winnie-the-Pooh drawings, Tenniel's *Alice* drawings and Denslow's *Oz* drawings. Some character names are still trademarks of their owners. They are used here only to name the picture.

The "Movie characters" deck shows **the studios' own character images**: official renders, film or show stills and poster crops, taken from each character's page on Wikipedia or its fan wiki (Fandom, MarioWiki). Live-action characters are shown as played in the film or show. These images are © their owners (Disney, Pixar, Marvel Studios, Lucasfilm, Warner Bros., DreamWorks, Nintendo, Netflix, HBO and the other studios named in [decks/credits.txt](decks/credits.txt)) and are used here for fan play only. This game is not affiliated with or endorsed by any of them. Each card's `credit` names the studio and the page the image came from. The Mixed stars deck uses some of these cards too, and shows actors as a role they play rather than as themselves.

## How the decks are built

`tools/deck-people.txt` lists who is in each deck. `tools/deck-fetch.py` looks up each picture on Commons and keeps only free licences. `tools/deck-build.py` finds the face with OpenCV's YuNet face detector and crops and compresses it. `tools/deck-meta.py` then adds each card's gender and kind (plus franchise, live/animated and actor for characters), writes the Movie characters deck (keeping its pictures, which were picked, cropped and checked by eye one by one; the script never replaces them) and picks the balanced Mixed stars deck. `tools/deck-credits.py` writes `decks/credits.txt`.
