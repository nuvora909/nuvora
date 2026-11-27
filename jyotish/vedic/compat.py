"""Complete boy-and-girl compatibility: what a careful astrologer checks beyond the 36-point score.

1. Ashtakoota (Guna Milan) with the classical exceptions that cancel Nadi and Bhakoot dosha. Many sites show
   only the base score, so a couple with a cancelled Nadi dosha sees 20/36 and a frightening warning when the
   tradition itself says the dosha does not apply.
2. Manglik for both, with cancellations, and whether the two balance each other.
3. Each person's own marriage promise (7th house, its lord, Venus/Jupiter, navamsha), from the same judgment
   engine used for readings, because a good score cannot fix a weak promise on one side.
4. Navamsha (D9) rapport: the friendship of the two D9 ascendant lords and the D9 Moon signs.
5. Timing: whether both charts have marriage windows that overlap in the coming years.
6. South Indian Porutham as an independent second system.

The output is a plain verdict, the reasons for it, what to watch, and simple remedies.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .chart import natural_relation
from .constants import NAKSHATRAS, SIGN_LORD, SIGNS
from .dosha import manglik_status
from .matching import NADI_PATTERN, _moon, match_charts
from .panchang import nakshatra_info
from .porutham import porutham


def _friends(a: str, b: str) -> bool:
    return a == b or (natural_relation(a, b) == "Friend" and natural_relation(b, a) == "Friend")


def _exceptions(bride, groom, kootas: dict) -> dict:
    """Classical exceptions for Nadi and Bhakoot dosha, from the Moon signs, nakshatras and padas."""
    bs, _, bn = _moon(bride)
    gs, _, gn = _moon(groom)
    bl, gl = SIGN_LORD[bs], SIGN_LORD[gs]
    out = {}
    if kootas["nadi"]["score"] == 0:
        bp = nakshatra_info(bride.lon["MOON"])["pada"]
        gp = nakshatra_info(groom.lon["MOON"])["pada"]
        why = None
        if bs == gs and bn != gn:
            why = "both Moons are in the same sign but in different nakshatras"
        elif bn == gn and bs != gs:
            why = "both Moons are in the same nakshatra but in different signs"
        elif bn == gn and bp != gp:
            why = f"both Moons share {NAKSHATRAS[bn]} but in different padas ({bp} and {gp})"
        elif _friends(bl, gl):
            why = f"the Moon-sign lords, {bl.title()} and {gl.title()}, are {'the same planet' if bl == gl else 'mutual friends'}"
        out["nadi"] = why
    if kootas["bhakoot"]["score"] == 0:
        out["bhakoot"] = (f"the Moon-sign lords, {bl.title()} and {gl.title()}, are "
                          f"{'the same planet' if bl == gl else 'mutual friends'}") if _friends(bl, gl) else None
    return out


def _marriage_promise(chart, report, now):
    from chat.judgment import Judge
    from chat.topics import TOPICS
    j = Judge(chart, report, now).judge(TOPICS["marriage"])
    return j


def _d9_rapport(c1, c2) -> dict:
    l1 = SIGN_LORD[c1.varga[9]["lagna"]["sign"]]
    l2 = SIGN_LORD[c2.varga[9]["lagna"]["sign"]]
    m1, m2 = c1.varga[9]["planets"]["MOON"]["sign"], c2.varga[9]["planets"]["MOON"]["sign"]
    gap = (m2 - m1) % 12 + 1
    lords = "the same planet" if l1 == l2 else ("friends" if _friends(l1, l2) else
                                                "mixed" if "Enemy" not in (natural_relation(l1, l2), natural_relation(l2, l1))
                                                else "at odds")
    moons_ok = gap not in (6, 8)
    good = lords in ("the same planet", "friends") and moons_ok
    return {"d9_lagna_lords": [l1.title(), l2.title()], "lords": lords, "moons_6_8": not moons_ok, "good": good}


def _shared_windows(j1, j2) -> list[dict]:
    out = []
    for a in j1.windows:
        for b in j2.windows:
            lo, hi = max(a.start, b.start), min(a.end, b.end)
            if (hi - lo).days >= 30:
                out.append({"from": lo.date().isoformat(), "to": hi.date().isoformat(),
                            "label": f"{lo:%B %Y} – {hi:%B %Y}"})
    out.sort(key=lambda w: w["from"])
    return out[:3]


def full_match(girl, boy, girl_report, boy_report, now: datetime | None = None) -> dict:
    """`girl` and `boy` are Charts; reports are their full reports (for the judgment engine)."""
    now = now or datetime.now(timezone.utc)
    base = match_charts(girl, boy, girl_report, boy_report)
    kootas = {k["key"]: k for k in base["kootas"]}
    exc = _exceptions(girl, boy, kootas)
    adjusted = base["total"] + (8 if exc.get("nadi") else 0) + (7 if exc.get("bhakoot") else 0)

    mg, mb = manglik_status(girl), manglik_status(boy)
    active = lambda m: m["level"] in ("mild", "moderate", "strong")   # noqa: E731
    if active(mg) and active(mb):
        manglik = ("balanced", "Both have Mangal Dosha, which classically balances out — this is the traditional remedy.")
    elif not active(mg) and not active(mb):
        manglik = ("clear", "Neither has an active Mangal Dosha" + (" (one is present but cancelled)." if
                                                                    "cancelled" in (mg["level"], mb["level"]) else "."))
    else:
        who = "the girl" if active(mg) else "the boy"
        lvl = (mg if active(mg) else mb)["level"]
        manglik = ("imbalanced", f"Only {who} has an active Mangal Dosha ({lvl}). "
                   + ("A mild dosha on one side is commonly accepted, especially after 28." if lvl == "mild" else
                      "Tradition asks for care here: it does not forbid the match, but it calls for maturity and patience."))

    jg, jb = _marriage_promise(girl, girl_report, now), _marriage_promise(boy, boy_report, now)
    d9 = _d9_rapport(girl, boy)
    shared = _shared_windows(jg, jb)
    poru = porutham(girl, boy, now)

    # Verdict: the adjusted score sets the base; an uncancelled Nadi or Bhakoot dosha, an imbalanced strong
    # Manglik, or a demanding marriage promise on either side lowers it.
    points = 0
    points += 2 if adjusted >= 28 else 1 if adjusted >= 18 else -2
    if kootas["nadi"]["score"] == 0 and not exc.get("nadi"):
        points -= 2
    if kootas["bhakoot"]["score"] == 0 and not exc.get("bhakoot"):
        points -= 1
    if manglik[0] == "imbalanced" and "strong" in (mg["level"], mb["level"]):
        points -= 1
    for j in (jg, jb):
        points += {"strong": 1, "supportive": 0.5, "mixed": 0, "demanding": -1}[j.lean]
    points += 0.5 if d9["good"] else 0
    points += 0.5 if poru["agree"] >= poru["count"] * 0.6 else 0
    if points >= 3.5:
        verdict, tone = "Excellent match", "good"
    elif points >= 2:
        verdict, tone = "Good match", "good"
    elif points >= 0.5:
        verdict, tone = "Workable match, with care", "gold"
    else:
        verdict, tone = "Challenging match by tradition", "warn"

    reasons, watch, remedies = [], [], []
    reasons.append(f"Guna Milan: {base['total']:g}/36 on the base count"
                   + (f", {adjusted:g}/36 after the classical exceptions" if adjusted != base["total"] else "") + ".")
    if exc.get("nadi"):
        reasons.append(f"Nadi dosha is present on the simple count but cancelled because {exc['nadi']}.")
    elif kootas["nadi"]["score"] == 0:
        watch.append("Nadi dosha (same Nadi) is not cancelled. Tradition treats it seriously; it says nothing medical, "
                     "so treat it as a review point, not a verdict.")
        remedies.append("Nadi dosha: the traditional remedy is Mahamrityunjaya mantra japa and charity before the wedding.")
    if exc.get("bhakoot"):
        reasons.append(f"Bhakoot dosha is present on the simple count but cancelled because {exc['bhakoot']}.")
    elif kootas["bhakoot"]["score"] == 0:
        watch.append("Bhakoot dosha (Moon signs 2/12, 5/9 or 6/8 apart) is not cancelled: expect different emotional "
                     "rhythms, and agree early on how you handle stress and family expectations.")
    reasons.append(manglik[1])
    if manglik[0] == "imbalanced":
        remedies.append("Mangal Dosha: Hanuman Chalisa on Tuesdays and simple charity are enough; avoid expensive pujas.")
    for who, j in (("Girl", jg), ("Boy", jb)):
        reasons.append(f"{who}'s own marriage promise is {j.lean_text}.")
        if j.lean == "demanding":
            watch.append(f"The {who.lower()}'s chart asks for patience in marriage itself — this is about maturity and "
                         "timing, whoever the partner is.")
    reasons.append("The navamsha (D9, the marriage chart) " + ("shows good rapport between you." if d9["good"] else
                   "shows " + ("Moons 6/8 apart in D9, so emotional needs differ." if d9["moons_6_8"] else
                               f"the D9 ascendant lords {d9['lords']}, so you'll need to work at understanding each other.")))
    if shared:
        reasons.append(f"Both charts have an active marriage window together in {shared[0]['label']} — a natural "
                       "time for the wedding.")
    else:
        watch.append("Your marriage windows don't overlap closely in the next few years, so choose the wedding date with "
                     "a muhurta rather than waiting for a perfect period.")
    weak = [k for k in base["kootas"] if k["score"] == 0 and k["key"] not in ("nadi", "bhakoot")]
    for k in weak[:2]:
        watch.append(f"{k['name'].split(' · ')[0]} scores 0 ({k['name'].split(' · ')[1]}): talk about this area openly.")
    if not remedies:
        remedies.append("No dosha needs a ritual remedy. Choose an auspicious wedding date (muhurta) and keep talking "
                        "honestly about money, family and children.")

    return {
        "verdict": verdict, "tone": tone,
        "score": base["total"], "adjusted_score": adjusted, "maximum": 36, "band": base["band"],
        "kootas": base["kootas"], "exceptions": exc,
        "manglik": {"girl": mg, "boy": mb, "balance": manglik[0], "note": manglik[1]},
        "marriage_promise": {"girl": jg.lean_text, "boy": jb.lean_text},
        "navamsha": d9, "shared_windows": shared,
        "porutham": {"agree": poru["agree"], "count": poru["count"], "verdict": poru["verdict"],
                     "rows": [{"name": r["name"], "status": r["status"], "meaning": r["meaning"]} for r in poru["rows"]]},
        "girl": base["person1"], "boy": base["person2"],
        "reasons": reasons, "watch": watch, "remedies": remedies,
        "caution": base["caution"],
    }
