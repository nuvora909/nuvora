"""Birth-time sensitivity: how far the birth time can move before key chart factors change.

A reading that depends on the D9/D10 lagna is only as good as the birth time; this tells the user
(and the chat model) which conclusions are robust and which hinge on a few minutes.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np

from .constants import DASHA_YEARS, NAK_LORD, NAK_SPAN, PADA_SPAN, SIGNS
from .vargas import varga_sign


def _first_change(times, cats):
    """Index of first element whose category differs from cats[0], or None."""
    diff = np.nonzero(cats != cats[0])[0]
    return int(diff[0]) if diff.size else None


def _bisect(fn, t_same: datetime, t_diff: datetime, ref, tol_s=1.0):
    while abs((t_diff - t_same).total_seconds()) > tol_s:
        mid = t_same + (t_diff - t_same) / 2
        if fn(mid) == ref:
            t_same = mid
        else:
            t_diff = mid
    return t_diff


def _crossing(t_a: datetime, t_b: datetime, l_a: float, l_b: float, span: float):
    """Instant a longitude moving from l_a (at t_a) to l_b (at t_b) crosses a multiple of `span`.

    Inside one scan step the Moon and the ascendant move almost uniformly, so linear interpolation
    lands well within a second of the true crossing (quadratic error < 0.1 s for these step sizes)."""
    d = (l_b - l_a + 540.0) % 360.0 - 180.0
    if d == 0:
        return None
    lo, hi = (l_a, l_a + d) if d > 0 else (l_a + d, l_a)
    boundary = math.floor(hi / span) * span
    if not lo < boundary <= hi:
        return None
    return t_a + (t_b - t_a) * ((boundary - l_a) / d)


def _search(series, cat, span: float, birth: datetime, step: timedelta, steps: int):
    """Minutes to the nearest change before and after birth (None if not found in window).

    `series(direction, step, steps)` returns (times, longitudes) and is shared between factors."""
    ref = cat(float(series(1, step, 0)[1][0]))
    res = {}
    for direction, key in ((1, "after_min"), (-1, "before_min")):
        times, lons = series(direction, step, steps)
        cats = np.array([cat(x) for x in lons])
        i = _first_change(times, cats)
        if i is None:
            res[key] = None
            continue
        edge = _crossing(times[i - 1], times[i], float(lons[i - 1]), float(lons[i]), span)
        if edge is None:   # should not happen for equal-division vargas; keep the exact fallback
            edge = _bisect(lambda t: cat(float(series.one(t))), times[i - 1], times[i], ref)
        res[key] = round(abs((edge - birth).total_seconds()) / 60.0, 1)
    return res


class _Series:
    """Memoised longitude series around birth, so every factor reuses the same ephemeris samples."""

    def __init__(self, fn, birth: datetime):
        self.fn, self.birth, self.memo = fn, birth, {}

    def __call__(self, direction: int, step: timedelta, steps: int):
        key = (direction, step, steps)
        if key not in self.memo:
            times = [self.birth + direction * step * i for i in range(steps + 1)]
            self.memo[key] = (times, np.asarray(self.fn(times), dtype=float))
        return self.memo[key]

    def one(self, t: datetime) -> float:
        return float(self.fn([t])[0])


def sensitivity(chart, asc_window_h: float = 6.0, moon_window_d: float = 4.0):
    eph, b = chart.eph, chart.birth
    utc = chart.time.utc

    asc = _Series(lambda times: eph.ascendant(eph.ts.from_datetimes(times), b.lat, b.lon), utc)
    moon = _Series(lambda times: eph.sidereal_longitude_series(times, "MOON"), utc)

    out = {}
    asc_targets = {"lagna_sign": 1, "navamsha_lagna": 9, "dashamsha_lagna": 10, "saptamsha_lagna": 7,
                   "shashtiamsha_lagna": 60}
    steps = int(asc_window_h * 60)
    for key, n in asc_targets.items():
        cat = lambda x, n=n: varga_sign(x, n)
        step = timedelta(minutes=1) if n < 60 else timedelta(seconds=15)
        r = _search(asc, cat, 30.0 / n, utc, step, steps if n < 60 else 240)
        r["current"] = SIGNS[cat(asc.one(utc))]
        out[key] = r

    moon_targets = {"moon_sign": (lambda x: int(x // 30), 30.0),
                    "moon_nakshatra": (lambda x: int(x // NAK_SPAN), NAK_SPAN),
                    "moon_pada": (lambda x: int(x // PADA_SPAN), PADA_SPAN),
                    "moon_navamsha": (lambda x: varga_sign(x, 9), PADA_SPAN)}
    msteps = int(moon_window_d * 24 * 4)
    for key, (cat, span) in moon_targets.items():
        out[key] = _search(moon, cat, span, utc, timedelta(minutes=15), msteps)

    moon_speed = chart.speed["MOON"]
    lord = NAK_LORD[int(chart.lon["MOON"] // NAK_SPAN)]
    days_per_10min = moon_speed * (10 / 1440.0) / NAK_SPAN * DASHA_YEARS[lord] * chart.dasha.year_days
    out["dasha_shift_per_10_min_days"] = round(days_per_10min, 2)

    def rating(m):
        if m is None:
            return "robust"
        return "fragile" if m < 10 else ("sensitive" if m < 30 else "robust")

    flags = {}
    for k, v in out.items():
        if isinstance(v, dict):
            nearest = min([x for x in (v.get("before_min"), v.get("after_min")) if x is not None], default=None)
            v["nearest_change_min"] = nearest
            v["rating"] = rating(nearest)
            flags[k] = v["rating"]
    out["summary"] = flags
    out["thresholds_min"] = {"fragile": "<10", "sensitive": "10-30", "robust": ">=30 or none in window"}
    return out
