"""Gochara (transits) relative to a natal chart: houses from lagna and Moon, Sade Sati, ingresses."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

import numpy as np

from .constants import GRAHAS, SIGNS
from .panchang import nakshatra_info
from .ashtakavarga import ashtakavarga as get_ashtakavarga

SLOW = ("JUPITER", "SATURN", "RAHU", "KETU")

# Slow-planet sign changes depend only on the sky (Lahiri, true node), never on the person, so they are
# computed once per 10-year block and shared by every chart. A block costs ~30-60 ms the first time.
_BLOCK_DAYS = 3653
_BLOCK_EPOCH = datetime(1900, 1, 1, tzinfo=timezone.utc)
_SLOW_STEP_DAYS = 2.0
_cache_lock = threading.Lock()


def _sign_series(eph, key, start, end, step_days):
    n = int((end - start).total_seconds() / 86400 / step_days) + 1
    times = [start + timedelta(days=step_days * i) for i in range(n)]
    lon = eph.sidereal_longitude_series(times, key)
    return times, (lon // 30).astype(int)


def _refine_many(eph, key, brackets):
    """First instant after each sign change, to one minute, for many (t0, t1, sign_at_t0) brackets at once.

    Two vectorised passes (coarse grid, then a one-minute grid inside the coarse cell) replace a
    point-by-point bisection; the result is never later than the true change by more than a minute."""
    if not brackets:
        return []
    found = []
    for grid_s, stage in ((1800, "coarse"), (60, "fine")):
        times, owners = [], []
        for idx, (t0, t1, _s0) in enumerate(brackets):
            n = max(1, int(np.ceil((t1 - t0).total_seconds() / grid_s)))
            for k in range(1, n + 1):
                times.append(min(t0 + timedelta(seconds=grid_s * k), t1))
                owners.append(idx)
        signs = (eph.sidereal_longitude_series(times, key) // 30).astype(int)
        firsts = {}
        for t, idx, s in zip(times, owners, signs):
            if idx not in firsts and s != brackets[idx][2]:
                firsts[idx] = t
        new = []
        for idx, (t0, t1, s0) in enumerate(brackets):
            hit = firsts.get(idx, t1)
            new.append((max(t0, hit - timedelta(seconds=grid_s)), hit, s0))
        brackets = new
        found = [b[1] for b in brackets]
    return found


def _scan(eph, key, start, end, step_days):
    """Sign changes of `key` between start and end (uncached)."""
    times, signs = _sign_series(eph, key, start, end, step_days)
    idx = np.nonzero(np.diff(signs))[0]
    when = _refine_many(eph, key, [(times[i], times[i + 1], int(signs[i])) for i in idx])
    return [{"planet": key, "time": t, "from": SIGNS[signs[i]], "to": SIGNS[signs[i + 1]],
             "to_sign": int(signs[i + 1])} for t, i in zip(when, idx)]


def _block(eph, key, index):
    cache = eph.__dict__.setdefault("_ingress_blocks", {})
    hit = cache.get((key, index))
    if hit is not None:
        return hit
    with _cache_lock:
        hit = cache.get((key, index))
        if hit is not None:
            return hit
        b0 = _BLOCK_EPOCH + timedelta(days=_BLOCK_DAYS * index)
        b1 = b0 + timedelta(days=_BLOCK_DAYS)
        lo = max(b0, eph.valid_from + timedelta(days=3))
        hi = min(b1 + timedelta(days=_SLOW_STEP_DAYS), eph.valid_to - timedelta(days=3))
        rows = [r for r in _scan(eph, key, lo, hi, _SLOW_STEP_DAYS) if b0 <= r["time"] < b1] if lo < hi else []
        cache[(key, index)] = rows
        return rows


def _cached_ingresses(eph, key, start, end):
    first = int((start - _BLOCK_EPOCH).days // _BLOCK_DAYS)
    last = int((end - _BLOCK_EPOCH).days // _BLOCK_DAYS)
    return [dict(r) for i in range(first, last + 1) for r in _block(eph, key, i) if start <= r["time"] <= end]


def ingresses(eph, key, start, end, step_days=2.0):
    """Sign changes of `key` in [start, end], including retrograde re-entries.

    Slow planets come from the shared block cache; faster planets are scanned directly."""
    if key in SLOW and step_days >= _SLOW_STEP_DAYS:
        return _cached_ingresses(eph, key, start, end)
    return _scan(eph, key, start, end, step_days)


def warm_ingress_cache(eph, start_year: int = 1935, end_year: int | None = None) -> None:
    """Fill the slow-planet cache ahead of the first visitor (called from a background thread)."""
    end_year = end_year or datetime.now(timezone.utc).year + 105
    start = max(datetime(start_year, 1, 1, tzinfo=timezone.utc), eph.valid_from + timedelta(days=3))
    end = min(datetime(end_year, 1, 1, tzinfo=timezone.utc), eph.valid_to - timedelta(days=3))
    for key in ("SATURN", "JUPITER", "RAHU", "KETU"):
        _cached_ingresses(eph, key, start, end)


def sade_sati_periods(eph, moon_sign, start, end):
    """Saturn in the 12th, 1st or 2nd sign from natal Moon. Retrograde dips out and back in are merged
    into one period (the conventional 7.5-year span); boundaries are the cached Saturn ingresses."""
    window = lambda sign: (sign - moon_sign) % 12 + 1 in (12, 1, 2)
    sign_at_start = int(eph.sidereal_longitude_series([start], "SATURN")[0] // 30)
    periods, cur = [], None
    if window(sign_at_start):
        cur = {"start": start, "started_before_birth": True}
    for ing in _cached_ingresses(eph, "SATURN", start, end):
        inside = window(ing["to_sign"])
        if inside and cur is None:
            cur = {"start": ing["time"], "started_before_birth": False}
        elif not inside and cur is not None:
            cur["end"] = ing["time"]
            periods.append(cur)
            cur = None
    if cur is not None:
        cur["end"] = None
        periods.append(cur)
    merged = []
    for p in periods:
        if merged and merged[-1]["end"] and (p["start"] - merged[-1]["end"]).days < 400:
            merged[-1]["end"] = p["end"]
        else:
            merged.append(p)
    return merged


def transits(chart, when: datetime | None = None, horizon_years: float = 3.0):
    eph = chart.eph
    when = when or datetime.now(timezone.utc)
    pos, _ = eph.sidereal_positions(when, node=chart.options.node)
    tz = chart.time.local.tzinfo
    moon_sign = chart.sign["MOON"]
    rows = {}
    for g in GRAHAS:
        lon = pos[g]["lon"]
        s = int(lon // 30)
        rows[g] = {"sign": s, "sign_name": SIGNS[s], "degree": round(lon % 30, 4),
                   "nakshatra": nakshatra_info(lon)["name"],
                   "retrograde": True if g in ("RAHU", "KETU") else pos[g]["speed"] < 0,
                   "house_from_lagna": chart.house_of_sign(s), "house_from_moon": (s - moon_sign) % 12 + 1,
                   "over_natal": [h for h in GRAHAS if chart.sign[h] == s]}

    # Get SAV by sign for adding to positions
    sav = get_ashtakavarga(chart)["sav_by_sign"]

    for g in GRAHAS:
        lon = pos[g]["lon"]
        s = int(lon // 30)
        rows[g]["sav_in_sign"] = sav[s]
    sat_from_moon = rows["SATURN"]["house_from_moon"]
    phase = {12: "rising (1st phase)", 1: "peak (2nd phase)", 2: "setting (3rd phase)"}.get(sat_from_moon)
    end = when + timedelta(days=365.25 * horizon_years)
    upcoming = []
    for g in SLOW:
        for ing in ingresses(eph, g, when, end, step_days=2.0):
            ing["time"] = ing["time"].astimezone(tz).isoformat(timespec="minutes")
            ing["house_from_lagna"] = chart.house_of_sign(ing["to_sign"])
            ing["house_from_moon"] = (ing["to_sign"] - moon_sign) % 12 + 1
            upcoming.append(ing)
    upcoming.sort(key=lambda x: x["time"])
    life_start = chart.time.utc
    life_end = min(life_start + timedelta(days=365.25 * 100), eph.valid_to - timedelta(days=5))
    ss = [{"start": p["start"].astimezone(tz).date().isoformat(),
           "end": p["end"].astimezone(tz).date().isoformat() if p["end"] else None,
           "started_before_birth": p["started_before_birth"]}
          for p in sade_sati_periods(eph, moon_sign, life_start, life_end)]
    return {
        "at": when.astimezone(tz).isoformat(timespec="minutes"),
        "positions": rows,
        "sade_sati": {"active": phase is not None, "phase": phase,
                      "saturn_house_from_moon": sat_from_moon,
                      "ashtama_shani": sat_from_moon == 8, "kantaka_shani": sat_from_moon == 4,
                      "lifetime_periods": ss,
                      "rule": "Saturn transiting the 12th, 1st or 2nd sign from natal Moon; retrograde re-entries merged"},
        "upcoming_ingresses": upcoming,
    }
