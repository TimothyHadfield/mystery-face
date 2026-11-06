# Credits

Mystery Face is an original game. It is not affiliated with Hasbro or with any person or character shown on the cards.

## Card pictures

Every card picture in `decks/` comes from **Wikimedia Commons** and uses a free licence:

| Licence | Cards |
|---|---|
| Public domain | 121 |
| CC BY-SA (2.0 / 3.0 / 4.0) | 105 |
| CC BY (2.0 / 3.0 / 4.0) | 91 |
| CC0 | 9 |
| UK Open Government Licence 3.0 (CC BY compatible) | 2 |

That is 328 distinct pictures. No non-free or fair-use files are used. Each picture was cropped to the face and resized to 256×256 WebP. Nothing else was changed.

**The full list of authors, licences and source pages, one line per picture, is in [decks/credits.txt](decks/credits.txt).** The same details are stored with every card in `decks/<deck>/deck.json` under `credit` (`author`, `license`, `licenseUrl`, `source`).

CC BY and CC BY-SA pictures are used under those licences. Our cropped versions of the CC BY-SA pictures are shared under the same licence as their originals.

Licence texts:
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- Open Government Licence 3.0: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

Cartoon and storybook characters ("Cartoons & Classics") use only artwork that is in the public domain in the US, such as the 1928 *Steamboat Willie* frame, the 1929 *Thimble Theatre* Popeye strip, E. H. Shepard's 1926 Winnie-the-Pooh drawings, Tenniel's *Alice* drawings and Denslow's *Oz* drawings. Some character names are still trademarks of their owners. They are used here only to name the picture.

## How the decks are built

`tools/deck-people.txt` lists who is in each deck. `tools/deck-fetch.py` looks up each picture on Commons and keeps only free licences. `tools/deck-build.py` finds the face with OpenCV's YuNet face detector and crops and compresses it. `tools/deck-credits.py` writes `decks/credits.txt`.
