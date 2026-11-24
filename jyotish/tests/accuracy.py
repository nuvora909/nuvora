"""Accuracy of the engine against Swiss Ephemeris 2.10.03 (500 seeded random births, 1900-2099).

Run `python -m tests.accuracy` to regenerate reports/accuracy.json (the published error margins).
Swiss Ephemeris is used only to produce tests/data/swe_reference.json; it is never imported here.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from vedic.astro import _prep, default_ephemeris

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "tests" / "data" / "swe_reference.json"
REPORT = ROOT / "reports" / "accuracy.json"
PLANETS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]


def _wrap(d):
    return (np.asarray(d) + 180.0) % 360.0 - 180.0


def load_reference():
    return json.loads(REF.read_text(encoding="utf-8"))


def compute_errors():
    ref = load_reference()
    cases = ref["cases"]
    eph = default_ephemeris()
    jd = np.array([c["jd_ut"] for c in cases])
    t = _prep(eph.ts.ut1_jd(jd))
    h = 1.0 / 24.0
    tm, tp = _prep(eph.ts.ut1_jd(jd - h)), _prep(eph.ts.ut1_jd(jd + h))
    mean, true = eph.ayanamsa(t)
    _, true_m = eph.ayanamsa(tm)
    _, true_p = eph.ayanamsa(tp)
    errs = {"AYANAMSA": _wrap(mean - np.array([c["ayanamsa"] for c in cases])) * 3600}
    speed_errs = {}
    for p in PLANETS:
        lon, _ = eph._tropical_body(t, p)
        errs[p] = _wrap(lon - true - np.array([c["sidereal"][p] for c in cases])) * 3600
        lm, _ = eph._tropical_body(tm, p)
        lp, _ = eph._tropical_body(tp, p)
        spd = _wrap((lp - true_p) - (lm - true_m)) / (2 * h)
        speed_errs[p] = spd - np.array([c["speed"][p] for c in cases])
    errs["TRUE_NODE"] = _wrap(eph._tropical_true_node(t) - true - np.array([c["sidereal"]["TRUE_NODE"] for c in cases])) * 3600
    errs["MEAN_NODE"] = _wrap(eph._tropical_mean_node(t) - true - np.array([c["sidereal"]["MEAN_NODE"] for c in cases])) * 3600
    asc = np.array([float(eph.ascendant(t[i], c["lat"], c["lon"])) for i, c in enumerate(cases)])
    errs["ASCENDANT"] = _wrap(asc - np.array([c["asc_sidereal"] for c in cases])) * 3600
    return ref, errs, speed_errs


def summarise(ref, errs, speed_errs):
    rows = {}
    for k, a in errs.items():
        a = np.abs(a)
        rows[k] = {"max_arcsec": round(float(a.max()), 3), "p95_arcsec": round(float(np.percentile(a, 95)), 3),
                   "mean_abs_arcsec": round(float(a.mean()), 3)}
    rows["ASCENDANT"]["max_equivalent_birth_time_seconds"] = round(rows["ASCENDANT"]["max_arcsec"] / 15.0, 2)
    spd = {k: round(float(np.abs(v).max()), 6) for k, v in speed_errs.items()}
    years = np.array([c["year"] for c in ref["cases"]])
    moon_by_era = {}
    for lo, hi in ((1900, 1950), (1950, 2000), (2000, 2026), (2026, 2100)):
        sel = (years >= lo) & (years < hi)
        moon_by_era[f"{lo}-{hi - 1}"] = {"cases": int(sel.sum()),
                                         "max_arcsec": round(float(np.abs(errs["MOON"][sel]).max()), 3)}
    return {
        "reference": ref["generator"], "cases": ref["count"], "seed": ref["seed"],
        "date_range": "1900-2099 random UT, latitudes -55..62",
        "ayanamsa": "Lahiri (Chitrapaksha), true = mean + nutation",
        "longitude_errors": rows,
        "speed_max_abs_error_deg_per_day": spd,
        "moon_error_by_era": moon_by_era,
        "notes": [
            "Moon residual grows only after 2026, where Skyfield and Swiss Ephemeris extrapolate Delta-T "
            "(not yet observed Earth rotation) differently; see moon_error_by_era.",
            "1 arcsec of ascendant = 1/15 s of birth time; birth times are recorded to the minute (900\").",
        ],
    }


if __name__ == "__main__":
    report = summarise(*compute_errors())
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
