"""Fast prefix search over GeoNames cities1000 (CC BY 4.0)."""
from __future__ import annotations

import csv
import io
import unicodedata
import zipfile
from bisect import bisect_left
from functools import lru_cache
from heapq import nlargest
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ZIP, TSV = DATA / "cities1000.zip", DATA / "places.tsv"


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if ch.isalnum() or ch == " ").lower().strip()


def _build():
    countries = {}
    for line in (DATA / "countryInfo.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            f = line.split("\t")
            countries[f[0]] = f[4]
    admin1 = {}
    for line in (DATA / "admin1CodesASCII.txt").read_text(encoding="utf-8").splitlines():
        f = line.split("\t")
        if len(f) >= 2:
            admin1[f[0]] = f[1]
    rows = []
    with zipfile.ZipFile(ZIP) as z, z.open("cities1000.txt") as fh:
        for line in io.TextIOWrapper(fh, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            name, ascii_, lat, lon, cc, a1, pop, tz = f[1], f[2], f[4], f[5], f[8], f[10], f[14], f[17]
            if not tz:
                continue
            rows.append((name, ascii_, lat, lon, countries.get(cc, cc), admin1.get(f"{cc}.{a1}", ""),
                         pop or "0", tz))
    rows.sort(key=lambda r: -int(r[6]))
    with TSV.open("w", encoding="utf-8", newline="") as out:
        csv.writer(out, delimiter="\t").writerows(rows)


def _prefix_ids(entries, prefix):
    """Yield only row IDs whose normalized name starts with prefix."""
    pos = bisect_left(entries, (prefix, -1))
    while pos < len(entries):
        key, row_id = entries[pos]
        if not key.startswith(prefix):
            break
        yield row_id
        pos += 1


@lru_cache(maxsize=1)
def _index():
    """Load the city rows once and build sorted prefix indexes for both name forms."""
    if not TSV.exists():
        _build()
    rows = []
    ascii_names = []
    native_names = []
    with TSV.open(encoding="utf-8") as fh:
        for name, ascii_, lat, lon, country, region, pop, tz in csv.reader(fh, delimiter="\t"):
            row_id = len(rows)
            key, key2 = _fold(ascii_ or name), _fold(name)
            rows.append({"name": name, "key": key, "key2": key2, "lat": float(lat), "lon": float(lon),
                         "country": country, "region": region, "population": int(pop), "tz": tz})
            ascii_names.append((key, row_id))
            native_names.append((key2, row_id))
    ascii_names.sort()
    native_names.sort()
    return tuple(rows), tuple(ascii_names), tuple(native_names)


def warm_index():
    """Warm the index at server startup so the first visitor gets instant results."""
    _index()


def search(q: str, limit: int = 10):
    """Prefix match on city name (population-ranked); 'city, region/country' narrows results."""
    parts = [p.strip() for p in q.split(",") if p.strip()]
    if not parts:
        return []
    head, tail = _fold(parts[0]), [_fold(p) for p in parts[1:]]
    if len(head) < 2:
        return []

    rows, ascii_names, native_names = _index()
    candidates = set(_prefix_ids(ascii_names, head))
    candidates.update(_prefix_ids(native_names, head))

    def matches(row_id):
        row = rows[row_id]
        return not tail or all(part in _fold(row["region"]) or part in _fold(row["country"]) for part in tail)

    # TSV rows are population-ranked; stable row IDs preserve that order for ties.
    matched_rows = (rows[row_id] for row_id in sorted(candidates) if matches(row_id))
    best = nlargest(limit, matched_rows, key=lambda row: row["population"])
    return [{k: row[k] for k in ("name", "region", "country", "lat", "lon", "tz", "population")}
            for row in best]
