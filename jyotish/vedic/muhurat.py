"""Daily muhurat: the good and bad times of a day at a place, from its real sunrise and sunset.

Everything here is computed, not looked up: the Vedic day runs from sunrise to the next sunrise, the daytime and
night are each divided into 15 muhurtas, 8 choghadiyas and 12 horas, and the 8 day parts give Rahu Kaal, Yamaganda
and Gulika Kaal by weekday. Varjyam and Amrit Kaal come from the running nakshatra's own start and end times.
"""
from __future__ import annotations

from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from .astro import default_ephemeris
from .constants import NAK_SPAN, NAKSHATRAS, TITHIS, YOGAS_27
from .panchang import karana_info

WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
# 1-based eighth of the daytime, by weekday (Sunday first)
RAHU = [8, 2, 7, 5, 6, 4, 3]
YAMAGANDA = [5, 4, 3, 2, 1, 7, 6]
GULIKA = [7, 6, 5, 4, 3, 2, 1]
# Dur Muhurat: 1-based day muhurtas (of 15), and night muhurtas for Tuesday
DUR_DAY = {0: [14], 1: [9, 12], 2: [4], 3: [8], 4: [6, 12], 5: [4, 9], 6: [1, 2]}
DUR_NIGHT = {2: [7]}
CHOG = ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"]
CHOG_KIND = {"Amrit": "good", "Shubh": "good", "Labh": "good", "Char": "neutral",
             "Udveg": "bad", "Kaal": "bad", "Rog": "bad"}
CHOG_MEANING = {"Amrit": "best for everything", "Shubh": "auspicious: ceremonies, marriage, learning",
                "Labh": "gain: business, trade, study", "Char": "movement: travel, vehicles",
                "Udveg": "anxiety: avoid new work (fine for government matters)",
                "Kaal": "loss: avoid new work (fine for routine tasks)", "Rog": "illness: avoid new work and travel"}
DAY_CHOG_START = [0, 3, 6, 2, 5, 1, 4]          # index into CHOG for the first day choghadiya, by weekday
HORA_ORDER = ["SUN", "VENUS", "MERCURY", "MOON", "SATURN", "JUPITER", "MARS"]
WEEKDAY_LORD = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]
HORA_USE = {"SUN": "government work, authority, health", "MOON": "travel, public dealings, family",
            "MARS": "property, courage, sports, surgery", "MERCURY": "trade, writing, study, contracts",
            "JUPITER": "learning, ceremonies, finance, advice", "VENUS": "romance, arts, buying luxuries, vehicles",
            "SATURN": "routine work, labour, repairs, land"}
# Ghatis (of 60) from the start of each nakshatra at which Varjyam (inauspicious) and Amrit Kaal begin.
VARJYAM = [50, 24, 30, 40, 14, 11, 30, 20, 32, 30, 20, 18, 21, 20, 14, 14, 10, 14, 56, 24, 20, 10, 10, 18, 16, 24, 30]
AMRIT = [42, 48, 54, 52, 38, 35, 54, 44, 56, 54, 44, 42, 45, 44, 38, 38, 34, 38, 44, 48, 44, 34, 34, 42, 40, 48, 54]
RIKTA = {4, 9, 14}
PURPOSES = {
    "work": ("Starting new work or a business", {"Amrit", "Shubh", "Labh"}),
    "travel": ("Travel", {"Char", "Amrit", "Shubh", "Labh"}),
    "property": ("Buying property or a vehicle", {"Amrit", "Shubh", "Labh"}),
    "documents": ("Signing documents or agreements", {"Shubh", "Labh", "Amrit"}),
    "puja": ("Puja, prayer and spiritual practice", {"Amrit", "Shubh"}),
}


def _lons(eph, t: datetime):
    s = float(eph.sidereal_longitude_series([t], "SUN")[0])
    m = float(eph.sidereal_longitude_series([t], "MOON")[0])
    return s, m


ELEMENTS = {
    "tithi": lambda s, m: int(((m - s) % 360) // 12),
    "nakshatra": lambda s, m: int((m % 360) // NAK_SPAN),
    "yoga": lambda s, m: int(((s + m) % 360) // NAK_SPAN),
    "karana": lambda s, m: int(((m - s) % 360) // 6),
}


def _change(eph, key: str, start: datetime, end: datetime, step_h: float = 1.0) -> datetime | None:
    """The first moment after `start` (before `end`) where an element changes, to about a second."""
    f = ELEMENTS[key]
    v0 = f(*_lons(eph, start))
    lo, t = start, start
    while t < end:
        t = min(t + timedelta(hours=step_h), end)
        if f(*_lons(eph, t)) != v0:
            hi = t
            for _ in range(22):
                mid = lo + (hi - lo) / 2
                if f(*_lons(eph, mid)) == v0:
                    lo = mid
                else:
                    hi = mid
            return hi
        lo = t
    return None


def _change_back(eph, key: str, at: datetime) -> datetime:
    f = ELEMENTS[key]
    v0 = f(*_lons(eph, at))
    hi, t = at, at
    while True:
        t = t - timedelta(hours=1)
        if f(*_lons(eph, t)) != v0:
            lo = t
            for _ in range(22):
                mid = lo + (hi - lo) / 2
                if f(*_lons(eph, mid)) == v0:
                    hi = mid
                else:
                    lo = mid
            return hi
        hi = t


def _name(key: str, idx: int) -> str:
    if key == "tithi":
        paksha = "Shukla" if idx < 15 else "Krishna"
        i = idx % 15
        return f"{paksha} {'Purnima' if i == 14 and paksha == 'Shukla' else 'Amavasya' if i == 14 else TITHIS[i]}"
    if key == "nakshatra":
        return NAKSHATRAS[idx]
    if key == "yoga":
        return YOGAS_27[idx]
    s = idx * 6.0 + 1e-6
    return karana_info(0.0, s)["name"]


def _spans(lo: datetime, hi: datetime, n: int) -> list[tuple[datetime, datetime]]:
    step = (hi - lo) / n
    return [(lo + step * i, lo + step * (i + 1)) for i in range(n)]


def _minus(windows, bad):
    """Remove the bad intervals from a list of good ones."""
    out = []
    for a, b in windows:
        pieces = [(a, b)]
        for x, y in bad:
            nxt = []
            for p, q in pieces:
                if y <= p or x >= q:
                    nxt.append((p, q))
                else:
                    if x > p:
                        nxt.append((p, x))
                    if y < q:
                        nxt.append((y, q))
            pieces = nxt
        out += [(p, q) for p, q in pieces if (q - p) >= timedelta(minutes=20)]
    return out


def day_muhurat(day: date, lat: float, lon: float, tz_name: str, eph=None) -> dict:
    eph = eph or default_ephemeris()
    tz = ZoneInfo(tz_name)
    noon = datetime.combine(day, dtime(12), tzinfo=tz).astimezone(timezone.utc)
    ev = eph.sun_events(noon, lat, lon)
    prev = eph.sun_events(noon - timedelta(days=1), lat, lon)
    if not ev or not ev["sunset"] or not prev or not prev["sunset"]:
        raise ValueError("The Sun does not rise and set normally at this latitude on this date, so muhurtas cannot be computed.")
    sr, ss, nsr = ev["sunrise"], ev["sunset"], ev["next_sunrise"]
    wd = (sr.astimezone(tz).weekday() + 1) % 7          # Sunday = 0
    day_len, night_len = ss - sr, nsr - ss
    prev_night = sr - prev["sunset"]
    L = lambda t: (t + timedelta(seconds=30)).astimezone(tz).isoformat(timespec="minutes")   # nearest minute  # noqa: E731

    eighths = _spans(sr, ss, 8)
    day_m, night_m = _spans(sr, ss, 15), _spans(ss, nsr, 15)
    periods = []

    def add(name, kind, a, b, note):
        periods.append({"name": name, "kind": kind, "start": L(a), "end": L(b), "note": note, "_a": a, "_b": b})

    pm = prev_night / 15
    add("Brahma Muhurat", "good", sr - 2 * pm, sr - pm, "the most sacred time for prayer, meditation and study")
    abhijit = day_m[7]
    add("Abhijit Muhurat", "good" if wd != 3 else "neutral", *abhijit,
        "midday victory muhurta: good for starting almost anything" if wd != 3 else
        "traditionally not used on Wednesdays")
    add("Rahu Kaal", "bad", *eighths[RAHU[wd] - 1], "avoid starting anything new")
    add("Yamaganda", "bad", *eighths[YAMAGANDA[wd] - 1], "avoid new work and travel")
    add("Gulika Kaal", "bad", *eighths[GULIKA[wd] - 1], "avoid new beginnings; what starts now tends to repeat")
    for i in DUR_DAY.get(wd, []):
        add("Dur Muhurat", "bad", *day_m[i - 1], "an inauspicious muhurta: avoid important beginnings")
    for i in DUR_NIGHT.get(wd, []):
        add("Dur Muhurat", "bad", *night_m[i - 1], "an inauspicious muhurta: avoid important beginnings")

    # Nakshatra-based: the nakshatras that run during this Vedic day, with their own start and end
    naks, t = [], sr
    while t < nsr:
        start = _change_back(eph, "nakshatra", t) if t == sr else t
        end = _change(eph, "nakshatra", t, t + timedelta(hours=30)) or (t + timedelta(hours=30))
        naks.append((ELEMENTS["nakshatra"](*_lons(eph, t + timedelta(minutes=1))), start, end))
        t = end
    for n, a, b in naks:
        dur = b - a
        for table, label, kind, note in ((VARJYAM, "Varjyam", "bad", "avoid important work"),
                                         (AMRIT, "Amrit Kaal", "good", "nectar time: excellent for auspicious work")):
            x = a + dur * (table[n] / 60)
            y = x + dur * (4 / 60)
            if sr <= x < nsr:      # a window that began before sunrise belongs to the previous day
                add(label, kind, x, y, note)

    chog = []
    for part, (lo, hi), start_idx in (("day", (sr, ss), DAY_CHOG_START[wd]), ("night", (ss, nsr), (DAY_CHOG_START[wd] + 5) % 7)):
        step = 1 if part == "day" else 5
        for i, (a, b) in enumerate(_spans(lo, hi, 8)):
            name = CHOG[(start_idx + step * i) % 7]
            chog.append({"part": part, "name": name, "kind": CHOG_KIND[name], "meaning": CHOG_MEANING[name],
                         "start": L(a), "end": L(b), "_a": a, "_b": b})
    horas = []
    first = HORA_ORDER.index(WEEKDAY_LORD[wd])
    for i, (a, b) in enumerate(_spans(sr, ss, 12) + _spans(ss, nsr, 12)):
        g = HORA_ORDER[(first + i) % 7]
        horas.append({"planet": g.title(), "use": HORA_USE[g], "start": L(a), "end": L(b), "part": "day" if i < 12 else "night"})

    pan = {}
    for key in ("tithi", "nakshatra", "yoga", "karana"):
        items, t = [], sr
        while t < nsr:
            idx = ELEMENTS[key](*_lons(eph, t + timedelta(seconds=30)))
            end = _change(eph, key, t, nsr)
            items.append({"name": _name(key, idx), "until": L(end) if end else None, "index": idx})
            if not end:
                break
            t = end
        pan[key] = items
    tithi0 = pan["tithi"][0]["index"] % 15 + 1
    notes = []
    if tithi0 in RIKTA:
        notes.append(f"{pan['tithi'][0]['name']} is a Rikta (empty) tithi: avoid starting new ventures or big purchases today.")
    if pan["tithi"][0]["index"] == 29:
        notes.append("Amavasya (new moon): a day for prayer and ancestors, not for new beginnings.")

    bad = [(p["_a"], p["_b"]) for p in periods if p["kind"] == "bad"]
    best = {}
    for key, (label, wanted) in PURPOSES.items():
        good = [(c["_a"], c["_b"]) for c in chog if c["name"] in wanted and c["part"] == "day"]
        if key == "puja":
            good = [(p["_a"], p["_b"]) for p in periods if p["name"] in ("Brahma Muhurat", "Amrit Kaal")] + good
        if key in ("work", "documents", "property") and wd != 3:
            good.append(abhijit)
        free = sorted(_minus(good, bad), key=lambda w: -(w[1] - w[0]).total_seconds())[:2]
        best[key] = {"label": label, "windows": [{"start": L(a), "end": L(b)} for a, b in sorted(free)]}

    timeline = sorted([{k: v for k, v in p.items() if not k.startswith("_")} for p in periods], key=lambda p: p["start"])
    for c in chog:
        c.pop("_a"), c.pop("_b")
    return {"date": day.isoformat(), "weekday": WEEKDAYS[wd], "timezone": tz_name,
            "sunrise": L(sr), "sunset": L(ss), "next_sunrise": L(nsr),
            "day_length_min": round(day_len.total_seconds() / 60), "night_length_min": round(night_len.total_seconds() / 60),
            "panchang": pan, "notes": notes, "periods": timeline, "choghadiya": chog, "hora": horas, "best": best}
