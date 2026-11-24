"""Deterministic fact checking of a reading against the computed chart.

Two layers:
  1. Tagged facts. The model is instructed to wrap every checkable statement as
     <fact kind="placement" planet="Saturn" house="10">Saturn in your 10th house</fact>
  2. A free-text scanner for common untagged D1 statements ("Mars is in the 7th house",
     "Jupiter is exalted", "your 10th lord is Venus"), skipped in sentences about vargas/transits.

Verdicts: verified | contradicted (with the engine's value) | unverifiable (outside engine scope).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from vedic.constants import CHARA_KARAKAS, DEBILITATION, EXALTATION, GRAHAS, NAKSHATRAS, OWN_SIGNS, SIGNS, SIGNS_SA

# ------------------------------------------------------------------ normalisation
PLANET_ALIASES = {
    "SUN": ["sun", "surya", "ravi", "soorya"], "MOON": ["moon", "chandra", "soma", "chandrama"],
    "MARS": ["mars", "mangal", "mangala", "kuja", "angaraka"], "MERCURY": ["mercury", "budha", "budh"],
    "JUPITER": ["jupiter", "guru", "brihaspati", "brihaspathi"], "VENUS": ["venus", "shukra", "sukra"],
    "SATURN": ["saturn", "shani", "sani", "shanaishchara"], "RAHU": ["rahu", "north node"],
    "KETU": ["ketu", "south node"],
}
_PLANET = {a: p for p, al in PLANET_ALIASES.items() for a in al}


def _norm(s: str) -> str:
    s = re.sub(r"[^a-z]", "", s.lower())
    for a, b in (("sh", "s"), ("th", "t"), ("dh", "d"), ("bh", "b"), ("aa", "a"), ("oo", "u"), ("ee", "i"),
                 ("w", "v"), ("ph", "p"), ("kh", "k"), ("gh", "g"), ("ch", "c")):
        s = s.replace(a, b)
    return s


SIGN_INDEX = {}
for i, (en, sa) in enumerate(zip(SIGNS, SIGNS_SA)):
    for n in (en, sa):
        SIGN_INDEX[_norm(n)] = i
for alias, i in (("Mesh", 0), ("Vrishabh", 1), ("Vrisabha", 1), ("Mithun", 2), ("Kark", 3), ("Karkata", 3),
                 ("Simh", 4), ("Kanya", 5), ("Tula", 6), ("Vrischik", 7), ("Vrishchik", 7), ("Dhanus", 8),
                 ("Dhanu", 8), ("Makar", 9), ("Kumbh", 10), ("Meen", 11), ("Mina", 11)):
    SIGN_INDEX[_norm(alias)] = i

NAK_INDEX = {_norm(n): i for i, n in enumerate(NAKSHATRAS)}
for alias, i in (("Aswini", 0), ("Krittika", 2), ("Kritika", 2), ("Mrigasira", 4), ("Mrigshira", 4),
                 ("Aridra", 5), ("Pushyami", 7), ("Aslesha", 8), ("Ashlesha", 8), ("Purvaphalguni", 10),
                 ("Pubba", 10), ("Uttaraphalguni", 11), ("Uttara", 11), ("Chitta", 13), ("Svati", 14),
                 ("Visakha", 15), ("Anuradha", 16), ("Jyeshta", 17), ("Jyestha", 17), ("Moola", 18),
                 ("Purvashadha", 19), ("Purvashada", 19), ("Uttarashadha", 20), ("Uttarashada", 20),
                 ("Sravana", 21), ("Shravan", 21), ("Dhanishtha", 22), ("Shatabhishak", 23),
                 ("Satabhisha", 23), ("Purvabhadra", 24), ("Uttarabhadra", 25), ("Uttarabhadrapada", 25)):
    NAK_INDEX[_norm(alias)] = i


def planet_of(s: str | None):
    if not s:
        return None
    return _PLANET.get(s.strip().lower()) or (s.strip().upper() if s.strip().upper() in GRAHAS else None)


def sign_of(s: str | None):
    if s is None:
        return None
    s = str(s).strip()
    if s.isdigit():
        return int(s) - 1 if 1 <= int(s) <= 12 else None
    return SIGN_INDEX.get(_norm(s))


def nak_of(s: str | None):
    return NAK_INDEX.get(_norm(s)) if s else None


def chart_of(s: str | None) -> int:
    if not s:
        return 1
    m = re.search(r"(\d+)", s)
    if m:
        return int(m.group(1))
    n = _norm(s)
    for key, v in (("rasi", 1), ("rashi", 1), ("navam", 9), ("dasam", 10), ("dasham", 10), ("saptam", 7),
                   ("hora", 2), ("drekk", 3), ("trims", 30), ("sasti", 60), ("shashti", 60)):
        if _norm(key) in n:
            return v
    return 1


def _ord(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _bool(v):
    return str(v).strip().lower() in ("true", "yes", "1", "y")


def _parse_date(s: str):
    s = s.strip()
    for fmt, kind in (("%Y-%m-%d", "day"), ("%Y-%m", "month"), ("%Y", "year")):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc), kind
        except ValueError:
            pass
    return None, None


TOL = {"day": timedelta(days=3), "month": timedelta(days=45), "year": timedelta(days=370)}


# ------------------------------------------------------------------ results
@dataclass
class Check:
    id: int
    kind: str
    text: str
    attrs: dict
    verdict: str = "unverifiable"          # verified | contradicted | unverifiable
    engine: str = ""                       # what the engine says (always filled when known)
    source: str = "tag"                    # tag | scan
    span: tuple[int, int] | None = None

    def as_dict(self):
        return {"id": self.id, "kind": self.kind, "text": self.text, "attrs": self.attrs, "verdict": self.verdict,
                "engine": self.engine, "source": self.source}


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    @property
    def contradicted(self):
        return [c for c in self.checks if c.verdict == "contradicted"]

    def summary(self):
        n = lambda v: sum(1 for c in self.checks if c.verdict == v)
        return {"total": len(self.checks), "verified": n("verified"), "contradicted": n("contradicted"),
                "unverifiable": n("unverifiable")}


# ------------------------------------------------------------------ verifier
class Verifier:
    def __init__(self, chart, report: dict):
        self.c = chart
        self.r = report
        self._tcache = {}

    # each returns (verdict, engine_statement)
    def placement(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        n = chart_of(a.get("chart"))
        if n == 1:
            sign, house = self.c.sign[p], self.c.house[p]
        elif n in self.c.varga:
            v = self.c.varga[n]["planets"][p]
            sign, house = v["sign"], v["house"]
        else:
            return "unverifiable", f"D{n} not computed"
        truth = f"{p.title()} is in {SIGNS[sign]}, {_ord(house)} house (D{n})"
        ok = True
        if a.get("sign") is not None:
            s = sign_of(a["sign"])
            if s is None:
                return "unverifiable", truth
            ok &= s == sign
        if a.get("house") is not None:
            ok &= int(re.sub(r"\D", "", str(a["house"])) or 0) == house
        if a.get("sign") is None and a.get("house") is None:
            return "unverifiable", truth
        return ("verified" if ok else "contradicted"), truth

    def lagna(self, a):
        n = chart_of(a.get("chart"))
        sign = self.c.lagna_sign if n == 1 else self.c.varga[n]["lagna"]["sign"] if n in self.c.varga else None
        if sign is None:
            return "unverifiable", f"D{n} not computed"
        s = sign_of(a.get("sign"))
        truth = f"Lagna is {SIGNS[sign]} (D{n})"
        if s is None:
            return "unverifiable", truth
        return ("verified" if s == sign else "contradicted"), truth

    def house_lord(self, a):
        h = int(re.sub(r"\D", "", str(a.get("house", ""))) or 0)
        if not 1 <= h <= 12:
            return "unverifiable", "house missing"
        lord = self.c.house_lord[h]
        truth = f"{_ord(h)} lord is {lord.title()}, placed in the {_ord(self.c.house[lord])} house"
        ok, any_ = True, False
        if a.get("lord"):
            any_ = True
            ok &= planet_of(a["lord"]) == lord
        if a.get("in_house"):
            any_ = True
            ok &= int(re.sub(r"\D", "", str(a["in_house"]))) == self.c.house[lord]
        if not any_:
            return "unverifiable", truth
        return ("verified" if ok else "contradicted"), truth

    def aspect(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        truth = f"{p.title()} aspects houses {', '.join(map(str, self.c.aspect_houses[p]))}"
        if a.get("target"):
            t = planet_of(a["target"])
            if not t:
                return "unverifiable", truth
            ok = self.c.house[t] in self.c.aspect_houses[p]
            return ("verified" if ok else "contradicted"), truth + f"; {t.title()} is in the {_ord(self.c.house[t])}"
        if a.get("house"):
            h = int(re.sub(r"\D", "", str(a["house"])))
            return ("verified" if h in self.c.aspect_houses[p] else "contradicted"), truth
        return "unverifiable", truth

    def conjunction(self, a):
        ps = [planet_of(x) for x in re.split(r"[,&+/]| and ", a.get("planets", ""))]
        ps = [p for p in ps if p]
        if len(ps) < 2:
            return "unverifiable", "need two planets"
        n = chart_of(a.get("chart"))
        sign = (lambda p: self.c.sign[p]) if n == 1 else (lambda p: self.c.varga[n]["planets"][p]["sign"])
        truth = "; ".join(f"{p.title()} in {SIGNS[sign(p)]}" for p in ps) + f" (D{n})"
        return ("verified" if len({sign(p) for p in ps}) == 1 else "contradicted"), truth

    def dignity(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        n = chart_of(a.get("chart"))
        if n != 1 and n not in self.c.varga:
            return "unverifiable", f"D{n} not computed"
        sign = self.c.sign[p] if n == 1 else self.c.varga[n]["planets"][p]["sign"]
        d = self.c.dignity[p]
        st = (a.get("status") or "").lower().strip()
        truth = f"{p.title()}: {d['status']} (in {SIGNS[sign]}, D{n})"
        if "exalt" in st or "uchch" in st:
            ok = EXALTATION[p][0] == sign
        elif "debil" in st or "neech" in st or "fallen" in st:
            ok = DEBILITATION[p][0] == sign
        elif "moola" in st or "mula" in st:
            if n != 1:
                return "unverifiable", "moolatrikona degree is only checked in D1"
            ok = d["status"] == "Moolatrikona"
        elif "own" in st or "swa" in st:
            ok = sign in OWN_SIGNS.get(p, set())
        elif n == 1 and st in ("great friend", "friend", "neutral", "enemy", "great enemy"):
            ok = st in (d["compound_relation_to_dispositor"].lower(), d["natural_relation_to_dispositor"].lower())
        else:
            return "unverifiable", truth
        return ("verified" if ok else "contradicted"), truth

    def vargottama(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        actual = self.r["planets"][p]["vargottama"]
        value = _bool(a.get("value", "true"))
        truth = f"{p.title()} is {'vargottama' if actual else 'not vargottama'}"
        return ("verified" if value == actual else "contradicted"), truth

    def avastha(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        actual = self.r["planets"][p]["avastha_baladi"]
        claimed = (a.get("status") or a.get("value") or "").strip()
        if not claimed:
            return "unverifiable", f"{p.title()}: {actual}"
        return ("verified" if _norm(claimed) == _norm(actual) else "contradicted"), f"{p.title()}: {actual}"

    def retrograde(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        val = _bool(a.get("value", "true"))
        truth = f"{p.title()} is {'retrograde' if self.c.retro[p] else 'direct'}"
        return ("verified" if val == self.c.retro[p] else "contradicted"), truth

    def combust(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        cb = self.c.combust[p]
        val = _bool(a.get("value", "true"))
        truth = (f"{p.title()} is {'combust' if cb['combust'] else 'not combust'}"
                 + (f" ({cb['distance_from_sun']}° from Sun, orb {cb['orb']}°)" if cb["orb"] else ""))
        return ("verified" if val == cb["combust"] else "contradicted"), truth

    def nakshatra(self, a):
        who = (a.get("planet") or "").lower()
        if who in ("lagna", "ascendant", "asc", "lagnam"):
            lon, label = self.c.lagna_lon, "Lagna"
        else:
            p = planet_of(who)
            if not p:
                return "unverifiable", "unknown body"
            lon, label = self.c.lon[p], p.title()
        k = int(lon // (360 / 27))
        pada = int((lon % (360 / 27)) // (360 / 108)) + 1
        truth = f"{label} is in {NAKSHATRAS[k]} pada {pada}"
        claimed = nak_of(a.get("name"))
        if claimed is None:
            return "unverifiable", truth
        ok = claimed == k
        if a.get("pada"):
            ok &= int(re.sub(r"\D", "", str(a["pada"]))) == pada
        return ("verified" if ok else "contradicted"), truth

    def dasha(self, a):
        lords = tuple(planet_of(x) for x in re.split(r"[-/ ]+", a.get("lords", "")) if x.strip())
        if not lords or None in lords:
            return "unverifiable", "unknown dasha lords"
        depth = len(lords)
        periods = self.c.dasha.mahadashas
        target = None
        for level in range(depth):
            cand = [p for p in periods if p.lords == lords[:level + 1]]
            if not cand:
                return "contradicted", f"No {'-'.join(l.title() for l in lords)} period in this life"
            claimed_start, _ = _parse_date(a["start"]) if a.get("start") else (None, None)
            target = min(cand, key=lambda p: abs(p.start - claimed_start)) if claimed_start else cand[0]
            periods = self.c.dasha.children(target)
        tz = self.c.time.local.tzinfo
        truth = (f"{'-'.join(l.title() for l in lords)}: {target.start.astimezone(tz):%Y-%m-%d} "
                 f"to {target.end.astimezone(tz):%Y-%m-%d}")
        checks = []
        for key, actual in (("start", target.start), ("end", target.end)):
            if a.get(key):
                d, kind = _parse_date(a[key])
                if d is None:
                    return "unverifiable", truth
                checks.append(abs(actual - d) <= TOL[kind] or (kind != "day" and _same_period(actual, d, kind)))
        if a.get("running"):
            d, kind = _parse_date(a["running"])
            if d is None:
                return "unverifiable", truth
            checks.append(target.start - TOL[kind] <= d < target.end + TOL[kind])
        if not checks:
            return "verified", truth          # the period exists; that is the claim
        return ("verified" if all(checks) else "contradicted"), truth

    def yoga(self, a):
        name = _ycanon(a.get("name", ""))
        present = _bool(a.get("present", "true"))
        if not name or not any(k in name for k in YOGA_CATALOGUE):
            return "unverifiable", "yoga outside the engine's catalogue"
        key = next(k for k in YOGA_CATALOGUE if k in name)
        found, cancelled = [], []
        for y in self.r.get("yogas", []):
            if key in _ycanon(y["name"] + " " + y["category"]):
                if y["present"] and not y.get("cancelled"):
                    found.append(y["name"])
                elif y["present"]:
                    cancelled.append(y["name"])
        truth = (f"Engine finds: {', '.join(sorted(set(found)))}" if found
                 else f"Engine does not find {a.get('name')!r} in this chart"
                 + (f" ({', '.join(cancelled)} is present but cancelled)" if cancelled else ""))
        return ("verified" if bool(found) == present else "contradicted"), truth

    def transit(self, a):
        p = planet_of(a.get("planet"))
        if not p:
            return "unverifiable", "unknown planet"
        when = None
        if a.get("date"):
            when, _ = _parse_date(a["date"])
        tr = self.r.get("transits") if when is None else None
        if tr is None:
            from vedic.transits import transits as _tr
            when = when or datetime.now(timezone.utc)
            key = when.date().isoformat()
            if key not in self._tcache:
                self._tcache[key] = _tr(self.c, when + timedelta(hours=12), horizon_years=0.0)
            tr = self._tcache[key]
        row = tr["positions"][p]
        truth = (f"On {tr['at'][:10]} {p.title()} transits {row['sign_name']}: {_ord(row['house_from_lagna'])} "
                 f"from lagna, {_ord(row['house_from_moon'])} from Moon")
        ok, any_ = True, False
        if a.get("sign"):
            any_ = True
            ok &= sign_of(a["sign"]) == row["sign"]
        if a.get("house"):
            any_ = True
            ref = (a.get("from") or "lagna").lower()
            key = "house_from_moon" if "moon" in ref or "chandra" in ref else "house_from_lagna"
            ok &= int(re.sub(r"\D", "", str(a["house"]))) == row[key]
        if not any_:
            return "unverifiable", truth
        return ("verified" if ok else "contradicted"), truth

    def sade_sati(self, a):
        ss = self.r["transits"]["sade_sati"]
        truth = (f"Sade Sati {'active, ' + ss['phase'] if ss['active'] else 'not active'}; periods: "
                 + ", ".join(f"{p['start'][:4]}-{(p['end'] or '?')[:4]}" for p in ss["lifetime_periods"]))
        if a.get("active") is not None:
            return ("verified" if _bool(a["active"]) == ss["active"] else "contradicted"), truth
        if a.get("start") or a.get("end"):
            for key in ("start", "end"):
                if a.get(key):
                    d, kind = _parse_date(a[key])
                    if d and not any(p[key] and abs(datetime.fromisoformat(p[key]).replace(tzinfo=timezone.utc) - d)
                                     <= TOL[kind] for p in ss["lifetime_periods"]):
                        return "contradicted", truth
            return "verified", truth
        return "unverifiable", truth

    def karaka(self, a):
        role = (a.get("role") or "").lower()
        p = planet_of(a.get("planet"))
        match = next((k for k in CHARA_KARAKAS if k.lower().startswith(role[:5])), None) if role else None
        if not match or not p:
            return "unverifiable", f"Chara karakas: {self.c.karakas}"
        truth = f"{match} is {self.c.karakas[match].title()}"
        return ("verified" if self.c.karakas[match] == p else "contradicted"), truth

    def panchang(self, a):
        limb = (a.get("limb") or "").lower()
        if limb not in ("tithi", "nakshatra", "yoga", "karana", "vara"):
            return "unverifiable", "unknown panchang limb"
        actual = self.c.panchang[limb]["name"]
        truth = f"Birth {limb}: {actual}"
        claimed, act = _norm(a.get("name", "")), _norm(actual)
        if limb == "tithi":
            act = _norm(self.c.panchang["tithi"]["paksha"] + actual)
            actual_core = _norm(actual)
            ok = bool(claimed) and (claimed in act or actual_core in claimed) and not (
                ("sukla" in claimed and "krisna" in act) or ("krisna" in claimed and "sukla" in act))
            return ("verified" if ok else "contradicted"), truth + f" ({self.c.panchang['tithi']['paksha']})"
        if not claimed:
            return "unverifiable", truth
        return ("verified" if claimed in act or act in claimed else "contradicted"), truth

    def sav(self, a):
        h = a.get("house")
        if not h:
            return "unverifiable", "house missing"
        h = int(re.sub(r"\D", "", str(h)))
        actual = self.r["ashtakavarga"]["sav_by_house"][h - 1]["sav"]
        truth = f"SAV of {_ord(h)} house = {actual}"
        try:
            return ("verified" if int(a.get("value")) == actual else "contradicted"), truth
        except (TypeError, ValueError):
            return "unverifiable", truth

    def strength(self, a):
        p = planet_of(a.get("planet"))
        actual = self.r.get("planet_strength", {}).get(p) if p else None
        if not actual:
            return "unverifiable", "unknown planet or strength data unavailable"
        truth = f"{p.title()} heuristic strength: {actual['label']}, {actual['score']}/100 (not classical Shadbala)"
        checked = False
        ok = True
        if a.get("label"):
            checked = True
            ok &= a["label"].strip().lower() == actual["label"].lower()
        if a.get("score") is not None:
            checked = True
            try:
                ok &= abs(float(a["score"]) - actual["score"]) < 0.01
            except (TypeError, ValueError):
                return "unverifiable", truth
        return ("verified" if checked and ok else "contradicted" if checked else "unverifiable"), truth

    def sensitivity(self, a):
        f = (a.get("factor") or "").lower().replace(" ", "_")
        s = self.r.get("sensitivity", {})
        if f not in s or not isinstance(s[f], dict):
            return "unverifiable", "unknown factor"
        truth = f"{f}: {s[f]['rating']} (nearest change {s[f]['nearest_change_min']} min)"
        r = (a.get("rating") or "").lower()
        return ("verified" if r == s[f]["rating"] else "contradicted") if r else "unverifiable", truth

    def check(self, kind: str, attrs: dict):
        fn = getattr(self, kind.replace("-", "_"), None)
        if fn is None or kind.startswith("_") or kind == "check":
            return "unverifiable", f"unknown fact kind '{kind}'"
        try:
            return fn(attrs)
        except (KeyError, ValueError, IndexError, TypeError) as e:
            return "unverifiable", f"could not check ({type(e).__name__})"


def _ycanon(s: str) -> str:
    s = _norm(s)
    for a, b in (("kalasarp", "kalsarp"), ("mangalik", "manglik"), ("kujadosa", "manglik"),
                 ("mangaldosa", "manglik"), ("necabanga", "nicabanga"), ("sasayoga", "sasayoga")):
        s = s.replace(a, b)
    return s


# canonical keys the engine evaluates (longest/most specific first)
YOGA_CATALOGUE = ["mahapurusa", "hamsa", "malavya", "rucaka", "badra", "sasa", "gajakesari", "budaditya",
                  "candramangala", "kemadruma", "yogakaraka", "viparita", "harsa", "sarala", "vimala",
                  "nicabanga", "raja", "dana", "manglik", "kalsarp", "parivartana", "sunapa", "anapa",
                  "durudara", "subakartari", "papakartari", "gurucandala", "adhi"]


def _same_period(actual: datetime, claimed: datetime, kind: str) -> bool:
    if kind == "month":
        return (actual.year, actual.month) == (claimed.year, claimed.month)
    return actual.year == claimed.year


# ------------------------------------------------------------------ extraction
FACT_RE = re.compile(r"<fact\b([^>]*)>(.*?)</fact>", re.S | re.I)
ATTR_RE = re.compile(r'([a-zA-Z_]+)\s*=\s*"([^"]*)"')

_PL = r"(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|Surya|Chandra|Mangal|Budha|Guru|Shukra|Shani)"
_SG = r"(" + "|".join(SIGNS + SIGNS_SA) + r")"
_HOUSE = r"(\d{1,2})(?:st|nd|rd|th)"
SKIP_WORDS = re.compile(r"navam|d-?\d|dasam|dasham|varga|saptam|prashna|horary|transit|gochar|currently|right now|will (?:move|enter)|"
                        r"enter|moving|from (?:your |the )?moon|chandra lagna|moon chart|if |would |could |"
                        r"suppose|hypothetical|in 20\d\d|in 19\d\d|next year|this year|<fact", re.I)
SCAN = [
    ("placement", re.compile(_PL + r"\s+(?:is\s+|sits\s+|is\s+placed\s+|placed\s+|located\s+|resides\s+|lies\s+)?"
                             r"(?:in|occupies)\s+(?:your\s+|the\s+)?" + _HOUSE + r"\s+(?:house|bhava)", re.I),
     lambda m: {"planet": m.group(1), "house": m.group(2)}),
    ("placement", re.compile(_PL + r"\s+(?:is\s+|sits\s+|is\s+placed\s+|placed\s+)?in\s+" + _SG + r"\b", re.I),
     lambda m: {"planet": m.group(1), "sign": m.group(2)}),
    ("lagna", re.compile(_SG + r"\s+(?:lagna|ascendant|rising)\b", re.I), lambda m: {"sign": m.group(1)}),
    ("lagna", re.compile(r"(?:lagna|ascendant)\s+(?:is\s+|of\s+|in\s+)" + _SG + r"\b", re.I),
     lambda m: {"sign": m.group(1)}),
    ("dignity", re.compile(_PL + r"\s+is\s+(exalted|debilitated)", re.I),
     lambda m: {"planet": m.group(1), "status": m.group(2)}),
    ("retrograde", re.compile(_PL + r"\s+is\s+retrograde", re.I), lambda m: {"planet": m.group(1), "value": "true"}),
    ("combust", re.compile(_PL + r"\s+is\s+combust", re.I), lambda m: {"planet": m.group(1), "value": "true"}),
    ("house_lord", re.compile(_HOUSE + r"\s+(?:house\s+)?lord(?:\s+is|,)?\s+" + _PL, re.I),
     lambda m: {"house": m.group(1), "lord": m.group(2)}),
    ("house_lord", re.compile(_PL + r",?\s+(?:the\s+|your\s+)?lord\s+of\s+(?:your\s+|the\s+)?" + _HOUSE, re.I),
     lambda m: {"house": m.group(2), "lord": m.group(1)}),
]


def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s)


def extract_and_verify(text: str, chart, report: dict, prashna=None) -> Report:
    v = Verifier(chart, report)
    pv = Verifier(*prashna) if prashna else None
    rep = Report()
    for m in FACT_RE.finditer(text):
        attrs = dict(ATTR_RE.findall(m.group(1)))
        kind = attrs.pop("kind", attrs.pop("type", "")).strip().lower()
        is_prashna = attrs.get("chart", "").strip().lower() in ("prashna", "prashnawali", "horary")
        if is_prashna and pv is None:
            verdict, truth = "unverifiable", "Prashna chart not supplied"
        else:
            verdict, truth = (pv if is_prashna else v).check(kind, attrs)
            if is_prashna:
                truth = truth.replace("(D1)", "(Prashna)")
                if "(Prashna)" not in truth:
                    truth += " (Prashna)"
        rep.checks.append(Check(len(rep.checks), kind, _strip_tags(m.group(2)).strip(), attrs, verdict, truth,
                                "tag", m.span()))
    # free-text scan outside fact tags, sentence by sentence
    masked = FACT_RE.sub(lambda m: " " * len(m.group(0)), text)
    for sm in re.finditer(r"[^.!?\n]+[.!?]?", masked):
        sent = sm.group(0)
        if SKIP_WORDS.search(sent):
            continue
        for kind, rx, mk in SCAN:
            for m in rx.finditer(sent):
                attrs = mk(m)
                verdict, truth = v.check(kind, attrs)
                start = sm.start() + m.start()
                rep.checks.append(Check(len(rep.checks), kind, m.group(0), attrs, verdict, truth, "scan",
                                        (start, start + len(m.group(0)))))
    return rep
