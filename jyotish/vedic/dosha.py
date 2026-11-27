"""Manglik (Kuja) dosha with its classical cancellations.

Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house is counted from the ascendant, the Moon and Venus. A dosha
counted from the ascendant alone is mild; from two or three references it is stronger. Classical texts then list
conditions that cancel it, and many charts that "have" Mangal dosha on a simple count turn out to be cancelled.
"""
from __future__ import annotations

from .constants import SIGNS

DOSHA_HOUSES = (1, 2, 4, 7, 8, 12)
JUPITER_ASPECTS = (1, 5, 7, 9)   # houses counted from Jupiter


def _from(c, g: str, ref_sign: int) -> int:
    return (c.sign[g] - ref_sign) % 12 + 1


def manglik_status(c) -> dict:
    mars = c.sign["MARS"]
    refs = {"ascendant": c.house["MARS"], "Moon": _from(c, "MARS", c.sign["MOON"]),
            "Venus": _from(c, "MARS", c.sign["VENUS"])}
    hits = [k for k, h in refs.items() if h in DOSHA_HOUSES]
    h = refs["ascendant"]
    sign = SIGNS[mars]
    cancel = []
    if sign in ("Aries", "Scorpio"):
        cancel.append(f"Mars is in its own sign, {sign}, where it behaves constructively")
    if sign == "Capricorn":
        cancel.append("Mars is exalted in Capricorn, where its energy is disciplined rather than combative")
    if h == 2 and sign in ("Gemini", "Virgo"):
        cancel.append(f"Mars in the 2nd house in {sign} is a classical exception")
    if h == 7 and sign in ("Cancer", "Capricorn"):
        cancel.append(f"Mars in the 7th house in {sign} is a classical exception")
    if h == 8 and sign in ("Sagittarius", "Pisces"):
        cancel.append(f"Mars in the 8th house in {sign}, a sign of Jupiter, is a classical exception")
    if h == 12 and sign in ("Taurus", "Libra"):
        cancel.append(f"Mars in the 12th house in {sign}, a sign of Venus, is a classical exception")
    if (mars - c.sign["JUPITER"]) % 12 + 1 in JUPITER_ASPECTS:
        cancel.append("Jupiter conjoins or aspects Mars, which classically softens and protects")
    if c.sign["MARS"] == c.sign["MOON"]:
        cancel.append("Mars sits with the Moon (Chandra-Mangala yoga), a classical cancellation")
    if SIGNS[c.lagna_sign] in ("Cancer", "Leo"):
        cancel.append(f"for a {SIGNS[c.lagna_sign]} ascendant Mars is a yogakaraka, a benefic ruler, so it does not harm marriage")
    present = h in DOSHA_HOUSES
    if not hits:
        level = "none"
    elif cancel:
        level = "cancelled"
    elif not present:
        level = "mild"           # only from the Moon or Venus
    else:
        level = {1: "mild", 2: "moderate", 3: "strong"}[len(hits)]
    return {"present": present, "references": refs, "hits": hits, "cancellations": cancel, "level": level,
            "mars_sign": sign, "mars_house": h}
