"""Download the public data files the engine needs, then build the place index.

Run at build time on the host (they are too large for git):
    python scripts/fetch_data.py            # into jyotish/data
    python scripts/fetch_data.py --dest DIR

Files already present are kept. The JPL ephemeris is checked against a pinned SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    # NASA JPL DE440s planetary ephemeris (1849–2150).
    "de440s.bsp": ("https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
                   "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2"),
    # GeoNames (CC BY 4.0): places with population over 1000, countries and regions.
    "cities1000.zip": ("https://download.geonames.org/export/dump/cities1000.zip", None),
    "countryInfo.txt": ("https://download.geonames.org/export/dump/countryInfo.txt", None),
    "admin1CodesASCII.txt": ("https://download.geonames.org/export/dump/admin1CodesASCII.txt", None),
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for name, (url, digest) in FILES.items():
        target = dest / name
        if target.exists() and target.stat().st_size > 0:
            print(f"have  {name}")
            continue
        part = target.with_suffix(target.suffix + ".part")
        print(f"fetch {name} <- {url}", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "nuvora-build/1.0"})
        with urllib.request.urlopen(req, timeout=300) as resp, part.open("wb") as out:
            shutil.copyfileobj(resp, out, 1 << 20)
        if digest and _sha256(part) != digest:
            part.unlink()
            sys.exit(f"{name}: checksum mismatch, refusing to use it")
        part.replace(target)


def build_places(dest: Path) -> None:
    sys.path.insert(0, str(ROOT))
    from vedic import places
    places.DATA, places.ZIP, places.TSV = dest, dest / "cities1000.zip", dest / "places.tsv"
    if places.TSV.exists() and places.TSV.stat().st_size > 0:
        print("have  places.tsv")
        return
    print("build places.tsv", flush=True)
    places._build()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", type=Path, default=ROOT / "data")
    args = ap.parse_args()
    fetch(args.dest)
    build_places(args.dest)
    print("data ready in", args.dest)
