"""Birth-time rectification from life events.

Most people know their birth time only to the nearest 15-30 minutes, and in this engine every 10 minutes moves
the dasha dates by two to three weeks. Astrologers correct the time by hand: they try nearby times and keep the one
whose dashas, transits and KP cusps best explain events that have already happened. This module does the same,
minute by minute, with three independent tests per event:

1. Vimshottari: at the event date, do the running maha, antar and pratyantar lords connect to the houses that
   produce that event (by ownership, occupation, aspect, or through their nakshatra lord)? The pratyantar changes
   every few weeks, so it is the level that discriminates between nearby minutes; it carries the most weight.
2. KP: does the sub lord of the event's deciding cusp signify the houses KP requires? Cusp sub lords change every
   few minutes, so this is the finest test.
3. Transit: do Jupiter and Saturn both reach the event house or its lord on the event date (double transit)?
   This depends on the ascendant sign, so it separates candidates across an ascendant change.

The result is a ranked set of time ranges with a plain verdict. It never overrides the user's time on thin
evidence: with fewer than three events, or a margin too small to matter, it says so.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, datetime, time as dtime, timedelta, timezone

from .chart import BirthInput, Chart, Options
from .constants import NAK_LORD, NAK_SPAN, SIGN_LORD, SIGNS

# Event -> (houses that produce it, natural significators, KP event key or None, label)
EVENTS = {
    "marriage":      ({2, 7, 11}, ("VENUS", "JUPITER"), "marriage", "Marriage"),
    "job":           ({2, 6, 10, 11}, ("SATURN", "SUN", "MERCURY"), "career", "First job or a new job"),
    "promotion":     ({10, 11, 2}, ("SUN", "JUPITER"), "career", "Promotion or big career rise"),
    "business":      ({7, 10, 11}, ("MERCURY", "SATURN"), "career", "Started a business"),
    "child":         ({2, 5, 11}, ("JUPITER",), "children", "Birth of a child"),
    "education":     ({4, 9, 11}, ("MERCURY", "JUPITER"), "education", "Graduation or major exam success"),
    "abroad":        ({3, 9, 12}, ("RAHU", "MOON"), "foreign", "Moved or travelled abroad for long"),
    "property":      ({4, 11, 2}, ("MARS", "VENUS"), "property", "Bought a home or property"),
    "father_loss":   ({3, 10}, ("SUN", "SATURN"), None, "Loss of father"),     # 2nd and 7th from the 9th
    "mother_loss":   ({5, 10}, ("MOON", "SATURN"), None, "Loss of mother"),    # 2nd and 7th from the 4th
    "separation":    ({6, 8, 12}, ("VENUS", "SATURN"), None, "Divorce or separation"),
    "illness":       ({6, 8, 12}, ("SATURN", "MARS"), None, "Serious illness, surgery or accident"),
}
LEVEL_WEIGHT = (1.0, 2.0, 3.0)      # maha, antar, pratyantar
MAX_LORD = 1.5
KP_WEIGHT = 0.15
TRANSIT_WEIGHT = 0.10
MIN_EVENTS = 3
CLEAR_MARGIN = 0.04
MIN_SHIFT = 3            # minutes: a smaller correction is false precision, never recommended


@dataclass
class Event:
    kind: str
    when: datetime          # UTC noon of the event date

    @classmethod
    def parse(cls, kind: str, day: str) -> "Event":
        if kind not in EVENTS:
            raise ValueError(f"Unknown event type: {kind}")
        d = date.fromisoformat(day)
        return cls(kind, datetime.combine(d, dtime(12), tzinfo=timezone.utc))


def _connection(c: Chart, g: str, houses: set[int], karakas: tuple[str, ...]) -> float:
    """How strongly a dasha lord is tied to the event houses in this candidate chart."""
    score = 0.0
    if set(c.lord_of[g]) & houses or c.house[g] in houses:
        score += 1.0
    elif any(h in houses for h in c.aspect_houses[g]):
        score += 0.5
    star = NAK_LORD[int(c.lon[g] // NAK_SPAN)]     # a planet gives the results of its nakshatra lord
    if star != g and (set(c.lord_of[star]) & houses or c.house[star] in houses):
        score += 0.75
    if g in ("RAHU", "KETU"):                       # nodes act for their sign lord
        agent = SIGN_LORD[c.sign[g]]
        if set(c.lord_of[agent]) & houses:
            score += 0.5
    if g in karakas:
        score += 0.5
    return min(score, MAX_LORD)


def _reaches(sign_from: int, target: int, offsets) -> bool:
    return (target - sign_from) % 12 in offsets


JUPITER_REACH = {0, 4, 6, 8}     # occupies, or aspects 5th, 7th, 9th
SATURN_REACH = {0, 2, 6, 9}      # occupies, or aspects 3rd, 7th, 10th


def _transit_fit(c: Chart, houses: set[int], jup: int, sat: int) -> bool:
    targets = {c.house_sign[h] for h in houses} | {c.sign[c.house_lord[h]] for h in houses}
    return any(_reaches(jup, t, JUPITER_REACH) and _reaches(sat, t, SATURN_REACH) for t in targets)


def _kp_fit(c: Chart, key: str | None) -> bool | None:
    if not key:
        return None
    from .kp import kp_chart
    try:
        return bool(kp_chart(c)["events"][key]["promised"])
    except Exception:            # Placidus is undefined at extreme latitudes
        return None


def score_chart(c: Chart, events: list[Event], slow: dict) -> tuple[float, list[dict]]:
    """Mean fit across events (0-1.25) and the per-event detail for the explanation."""
    detail, total = [], 0.0
    for ev in events:
        houses, karakas, kp_key, label = EVENTS[ev.kind]
        running = c.dasha.running(ev.when, depth=3)
        lords = [p.lord for p in running]
        dasha = sum(LEVEL_WEIGHT[i] * _connection(c, g, houses, karakas) for i, g in enumerate(lords))
        fit = dasha / (sum(LEVEL_WEIGHT[:len(lords)]) * MAX_LORD or 1)
        kp = _kp_fit(c, kp_key)
        tr = _transit_fit(c, houses, *slow[ev.when])
        fit += (KP_WEIGHT if kp else 0.0) + (TRANSIT_WEIGHT if tr else 0.0)
        total += fit
        detail.append({"kind": ev.kind, "label": label, "date": ev.when.date().isoformat(),
                       "dasha": "-".join(g.title() for g in lords), "fit": round(fit, 3), "kp": kp, "transit": tr})
    return total / max(1, len(events)), detail


def rectify(birth: BirthInput, events: list[Event], window_minutes: int = 60, step_minutes: int = 1,
            options: Options | None = None) -> dict:
    if not events:
        raise ValueError("Add at least one life event with its date")
    window_minutes = max(5, min(int(window_minutes), 120))
    step_minutes = max(1, int(step_minutes))
    opts = replace(options or Options(), vargas=())
    base = Chart(birth, opts)
    eph = base.eph
    slow = {}
    for ev in events:
        if ev.when < base.time.utc:
            raise ValueError(f"The {EVENTS[ev.kind][3].lower()} date is before the birth date")
        jup = int(eph.sidereal_longitude_series([ev.when], "JUPITER")[0] // 30)
        sat = int(eph.sidereal_longitude_series([ev.when], "SATURN")[0] // 30)
        slow[ev.when] = (jup, sat)

    given_local = base.time.local.replace(tzinfo=None)
    rows = []
    for offset in range(-window_minutes, window_minutes + 1, step_minutes):
        t = given_local + timedelta(minutes=offset)
        cand = replace(birth, year=t.year, month=t.month, day=t.day, hour=t.hour, minute=t.minute, second=t.second)
        try:
            c = Chart(cand, opts, eph)
        except ValueError:          # a clock-change gap: this local time never existed
            continue
        score, detail = score_chart(c, events, slow)
        rows.append({"offset": offset, "time": t.strftime("%H:%M"), "date": t.date().isoformat(), "score": score,
                     "lagna": SIGNS[c.lagna_sign], "moon_nakshatra_lord": NAK_LORD[int(c.lon["MOON"] // NAK_SPAN)].title(),
                     "detail": detail})
    given = next(r for r in rows if r["offset"] == 0)
    best_score = max(r["score"] for r in rows)
    # Neighbouring minutes that tie for the best score form a range: report it rather than one false-precise minute.
    near = [r for r in rows if r["score"] >= best_score - 0.005]
    ranges, cur = [], []
    for r in near:
        if cur and r["offset"] - cur[-1]["offset"] > step_minutes:
            ranges.append(cur)
            cur = []
        cur.append(r)
    if cur:
        ranges.append(cur)
    ranges.sort(key=lambda g: (-max(x["score"] for x in g), abs(g[len(g) // 2]["offset"])))
    best_range = ranges[0]
    best = best_range[len(best_range) // 2]
    margin = best["score"] - given["score"]

    if len(events) < MIN_EVENTS:
        verdict, confidence = "need_more_events", "low"
        message = (f"Add at least {MIN_EVENTS} events with dates for a reliable correction; with "
                   f"{len(events)} the result is only indicative.")
    elif given["score"] >= best_score - 0.005:
        verdict, confidence = "keep", "high" if len(events) >= 5 else "moderate"
        message = f"Your recorded time {given['time']} fits your life events as well as any nearby time, so keep it."
    elif abs(best["offset"]) <= MIN_SHIFT:
        verdict, confidence = "keep", "high" if len(events) >= 5 else "moderate"
        message = (f"The best fit, {best['time']}, is within {MIN_SHIFT} minutes of your recorded {given['time']} — "
                   "inside the normal margin of a recorded birth time, so keep your time.")
    elif margin < CLEAR_MARGIN:
        verdict, confidence = "keep", "moderate"
        message = (f"{best['time']} fits a little better than {given['time']}, but the difference is too small to "
                   "justify changing your birth time.")
    else:
        verdict = "change"
        confidence = "high" if len(events) >= 5 and len(best_range) <= 10 and len(ranges) == 1 else "moderate"
        span = (best_range[0]["time"] if len(best_range) == 1
                else f"{best_range[0]['time']}–{best_range[-1]['time']}")
        message = (f"Your life events fit a birth time of {span} better than {given['time']}. "
                   f"The middle of that range, {best['time']}, is the suggested corrected time.")
    lagna_note = None
    if best["lagna"] != given["lagna"] and verdict == "change":
        lagna_note = (f"This changes your ascendant from {given['lagna']} to {best['lagna']}, which changes the whole "
                      "chart. Only accept it if the events you entered are accurate.")
    others = [{"from": g[0]["time"], "to": g[-1]["time"], "score": round(max(x["score"] for x in g), 3)}
              for g in ranges[1:4]]
    return {
        "verdict": verdict, "confidence": confidence, "message": message, "lagna_note": lagna_note,
        "given": {k: given[k] for k in ("time", "date", "score", "lagna", "detail")},
        "best": {k: best[k] for k in ("time", "date", "score", "lagna", "detail")},
        "best_range": {"from": best_range[0]["time"], "to": best_range[-1]["time"]},
        "other_ranges": others, "margin": round(margin, 3), "window_minutes": window_minutes,
        "curve": [{"time": r["time"], "score": round(r["score"], 3)} for r in rows],
        "events_used": len(events),
    }
