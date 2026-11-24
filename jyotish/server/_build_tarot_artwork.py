"""Download the public-domain RWS scans used by the Tarot UI and optimize them."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image


OUT = Path(__file__).parent / "static" / "tarot-deck"
MAJORS = [
    "Fool", "Magician", "High Priestess", "Empress", "Emperor", "Hierophant", "Lovers",
    "Chariot", "Strength", "Hermit", "Wheel of Fortune", "Justice", "Hanged Man", "Death",
    "Temperance", "Devil", "Tower", "Star", "Moon", "Sun", "Judgement", "World",
]
RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Page", "Knight", "Queen", "King"]
SUITS = ["Cups", "Pents", "Swords", "Wands"]


def image_files():
    for number, name in enumerate(MAJORS):
        slug = name.lower().replace(" ", "-")
        yield f"RWS Tarot {number:02d} {name}.jpg", f"major-{number:02d}-{slug}.webp"
    for suit in SUITS:
        slug = suit.lower()
        for number, _rank in enumerate(RANKS, 1):
            yield f"{suit}{number:02d}.jpg", f"{slug}-{number:02d}.webp"


def resolve_thumbnails(items):
    result = {}
    for start in range(0, len(items), 50):
        titles = "|".join("File:" + source for source, _ in items[start:start + 50])
        query = urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url",
                           "iiurlwidth": 400, "titles": titles})
        request = Request("https://commons.wikimedia.org/w/api.php?" + query,
                          headers={"User-Agent": "NuvoraJyotish/1.0 (tarot card artwork integration)"})
        with urlopen(request, timeout=45) as response:
            pages = json.loads(response.read().decode("utf-8"))["query"]["pages"].values()
        for page in pages:
            if page.get("imageinfo"):
                result[page["title"][5:].replace("_", " ").casefold()] = page["imageinfo"][0]["thumburl"]
    return [(source, destination, result[source.casefold()]) for source, destination in items]


def download(item):
    source, destination, url = item
    request = Request(url, headers={"User-Agent": "NuvoraJyotish/1.0 (tarot card artwork integration)"})
    with urlopen(request, timeout=45) as response:
        content = response.read()
    image = Image.open(BytesIO(content)).convert("RGB")
    image.save(OUT / destination, "WEBP", quality=80, method=5)
    return destination, (OUT / destination).stat().st_size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    all_files = list(image_files())
    files = [(source, destination) for source, destination in all_files if not (OUT / destination).exists()]
    files = resolve_thumbnails(files)
    completed = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(download, item) for item in files]
        for future in as_completed(futures):
            completed.append(future.result())
            print(f"Downloaded {len(completed)}/{len(files)}: {completed[-1][0]}")
    total = len(list(OUT.glob("*.webp")))
    if total != 78:
        raise RuntimeError(f"Expected 78 card images, received {total}")
    (OUT / "README.txt").write_text(
        "Tarot artwork\n\n"
        "The 78 Rider-Waite-Smith card scans here are public-domain images by Pamela Colman Smith, "
        "first published in 1909. Source scans: Wikimedia Commons category “Rider-Waite-Smith tarot "
        "deck (TaionWC)”; the files here are 400px-wide Wikimedia thumbnails converted to WebP.\n\n"
        "Attribution: Pamela Colman Smith, Rider-Waite-Smith Tarot (1909), public-domain scans via "
        "Wikimedia Commons.\n",
        encoding="utf-8",
    )
    print(f"Finished 78 images; {sum(size for _, size in completed):,} optimized bytes")


if __name__ == "__main__":
    main()
