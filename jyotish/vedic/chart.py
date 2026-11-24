"""Chart assembly: one deterministic object that both the UI and the claim verifier read from.

Conventions (stated in output meta so readings can cite them):
  * sidereal zodiac, Lahiri ayanamsa, whole-sign houses (Parashari)
  * true node by default; Ketu = Rahu + 180
  * aspects are whole-sign graha drishti; Rahu/Ketu 5/7/9 optional
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from .astro import Ephemeris, default_ephemeris
from .constants import (CHARA_KARAKAS, COMBUSTION, DEBILITATION, EXALTATION, GRAHAS, MOOLATRIKONA,
                        NATURAL_ENEMIES, NATURAL_FRIENDS, OWN_SIGNS, SEVEN, SIGN_LORD, SIGNS, SIGNS_SA,
                        SPECIAL_ASPECTS, VARGA_DOMAIN, VARGA_NAMES, VARGAS)
from .dasha import Vimshottari
from .panchang import nakshatra_info, panchang
from .timeutil import ResolvedTime, resolve_birth_time
from .vargas import varga_degree, varga_sign

ENGINE_VERSION = "0.4.0"
KENDRAS = (1, 4, 7, 10)
TRIKONAS = (1, 5, 9)
DUSTHANAS = (6, 8, 12)


@dataclass(kw_only=True)
class BirthInput:
    year: int
    month: int
    day: int
    hour: int
    minute: int
    second: int = 0
    lat: float
    lon: float
    tz_name: str | None = None
    utc_offset_hours: float | None = None
    name: str = ""
    gender: str | None = None
    place: str = ""

    def validate(self):
        if not (-90 <= self.lat <= 90 and -180 <= self.lon <= 180):
            raise ValueError("Latitude/longitude out of range")
        if abs(self.lat) > 66.0:
            # Ascendant formula is valid, but signs rise extremely unevenly; flag it.
            return ["Birth latitude beyond ±66°: some signs barely rise; lagna is very time-sensitive."]
        return []


@dataclass(kw_only=True)
class Options:
    node: str = "TRUE"                 # TRUE | MEAN
    dasha_year: str = "julian"         # julian 365.25 | gregorian 365.2425 | savana 360
    node_aspects: bool = True          # Rahu/Ketu 5/7/9
    vargas: tuple[int, ...] = tuple(VARGAS)


def dms(x: float) -> str:
    x = x % 360.0
    total = int(round(x * 3600))
    d, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{d}°{m:02d}'{s:02d}\""


def natural_relation(p: str, q: str) -> str:
    if p not in NATURAL_FRIENDS or q not in NATURAL_FRIENDS or p == q:
        return "n/a"
    if q in NATURAL_FRIENDS[p]:
        return "Friend"
    if q in NATURAL_ENEMIES[p]:
        return "Enemy"
    return "Neutral"


_COMPOUND = {("Friend", True): "Great Friend", ("Friend", False): "Neutral",
             ("Neutral", True): "Friend", ("Neutral", False): "Enemy",
             ("Enemy", True): "Neutral", ("Enemy", False): "Great Enemy"}


def baladi_avastha(sign: int, deg: float) -> str:
    names = ["Bala", "Kumara", "Yuva", "Vriddha", "Mrita"]
    i = min(int(deg // 6.0), 4)
    return names[i] if sign % 2 == 0 else names[4 - i]


def angular_sep(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


class Chart:
    def __init__(self, birth: BirthInput, options: Options | None = None, eph: Ephemeris | None = None):
        self.birth = birth
        self.options = options or Options()
        self.eph = eph or default_ephemeris()
        warnings = birth.validate()
        self.time: ResolvedTime = resolve_birth_time(birth.year, birth.month, birth.day, birth.hour,
                                                     birth.minute, birth.second, birth.tz_name,
                                                     birth.utc_offset_hours)
        self.warnings = warnings + self.time.warnings
        utc = self.time.utc
        pos, self.ayanamsa = self.eph.sidereal_positions(utc, node=self.options.node)
        lagna = self.eph.ascendant_at(utc, birth.lat, birth.lon)
        self._assemble(lagna, pos)
        self.sun_events = self.eph.sun_events(utc, birth.lat, birth.lon)
        self.panchang = panchang(self.lon["SUN"], self.lon["MOON"], self.time.local, self.sun_events)

    @classmethod
    def from_longitudes(cls, lagna_lon: float, lons: dict, speeds: dict | None = None,
                        options: Options | None = None):
        """Synthetic chart for unit tests: no ephemeris, birth fixed at 2000-01-01 UTC."""
        c = cls.__new__(cls)
        c.birth = BirthInput(year=2000, month=1, day=1, hour=0, minute=0, lat=0.0, lon=0.0,
                             utc_offset_hours=0.0)
        c.options = options or Options()
        c.eph = None
        c.time = resolve_birth_time(2000, 1, 1, 0, 0, 0, None, 0.0)
        c.warnings = ["synthetic chart"]
        c.ayanamsa = {"mean": 0.0, "true": 0.0, "name": "LAHIRI"}
        lons = dict(lons)
        if "KETU" not in lons:
            lons["KETU"] = (lons["RAHU"] + 180.0) % 360.0
        speeds = speeds or {}
        pos = {g: {"lon": lons[g] % 360.0, "lat": 0.0, "speed": speeds.get(g, -0.05 if g in ("RAHU", "KETU") else 1.0)}
               for g in GRAHAS}
        c._assemble(lagna_lon % 360.0, pos)
        c.sun_events = None
        c.panchang = panchang(c.lon["SUN"], c.lon["MOON"], c.time.local, None)
        return c

    def _assemble(self, lagna_lon: float, pos: dict):
        utc = self.time.utc
        self.lagna_lon = lagna_lon
        self.lagna_sign = int(self.lagna_lon // 30.0)

        self.lon = {g: pos[g]["lon"] for g in GRAHAS}
        self.lat = {g: pos[g]["lat"] for g in GRAHAS}
        self.speed = {g: pos[g]["speed"] for g in GRAHAS}
        self.sign = {g: int(self.lon[g] // 30.0) for g in GRAHAS}
        self.deg = {g: self.lon[g] - 30.0 * self.sign[g] for g in GRAHAS}
        self.house = {g: self.house_of_sign(self.sign[g]) for g in GRAHAS}
        self.retro = {g: (True if g in ("RAHU", "KETU") else self.speed[g] < 0) for g in GRAHAS}
        if self.speed["SUN"] < 0 or self.speed["MOON"] < 0:  # physically impossible; guards regressions
            raise RuntimeError("Sun/Moon retrograde: ephemeris error")

        self.house_sign = {h: (self.lagna_sign + h - 1) % 12 for h in range(1, 13)}
        self.house_lord = {h: SIGN_LORD[self.house_sign[h]] for h in range(1, 13)}
        self.lord_of = {g: sorted(h for h in range(1, 13) if self.house_lord[h] == g) for g in GRAHAS}
        self.occupants = {h: [g for g in GRAHAS if self.house[g] == h] for h in range(1, 13)}

        self.aspect_houses = {g: self._aspect_offsets(g) for g in GRAHAS}  # houses (from lagna) aspected
        self.aspected_by = {h: [g for g in GRAHAS if h in self.aspect_houses[g]] for h in range(1, 13)}

        self.combust = {g: self._combust(g) for g in GRAHAS}
        self.dignity = {g: self._dignity(g) for g in GRAHAS}
        self.karakas = self._chara_karakas()

        self.varga = {n: self._varga(n) for n in self.options.vargas}
        self.dasha = Vimshottari(self.lon["MOON"], utc, self.options.dasha_year)

    # ---------------------------------------------------------------- helpers
    def house_of_sign(self, sign: int, from_sign: int | None = None) -> int:
        base = self.lagna_sign if from_sign is None else from_sign
        return (sign - base) % 12 + 1

    def house_from(self, g: str, ref: str) -> int:
        """House of graha g counted from graha ref (1 = same sign)."""
        return (self.sign[g] - self.sign[ref]) % 12 + 1

    def _aspect_offsets(self, g: str) -> list[int]:
        offs = SPECIAL_ASPECTS.get(g, (7,))
        if g in ("RAHU", "KETU") and not self.options.node_aspects:
            offs = (7,)
        return sorted({(self.house[g] + o - 2) % 12 + 1 for o in offs})

    def aspects(self, g: str, target_house: int) -> bool:
        return target_house in self.aspect_houses[g]

    def _combust(self, g: str):
        if g not in COMBUSTION:
            return {"combust": False, "distance_from_sun": None, "orb": None}
        orb = COMBUSTION[g][1 if self.retro[g] else 0]
        d = angular_sep(self.lon[g], self.lon["SUN"])
        return {"combust": d < orb, "distance_from_sun": round(d, 4), "orb": orb}

    def _dignity(self, g: str):
        s, d = self.sign[g], self.deg[g]
        disp = SIGN_LORD[s]
        ex_s, _ = EXALTATION[g]
        deb_s, _ = DEBILITATION[g]
        mt = MOOLATRIKONA.get(g)
        in_mt = mt is not None and s == mt[0] and mt[1] <= d < mt[2]
        if s == ex_s and in_mt:          # Moon 3-30 Taurus, Mercury 15-20 Virgo
            status = "Moolatrikona"
        elif s == ex_s:
            status = "Exalted"
        elif s == deb_s:
            status = "Debilitated"
        elif in_mt:
            status = "Moolatrikona"
        elif s in OWN_SIGNS.get(g, set()):
            status = "Own sign"
        else:
            status = None
        nat = natural_relation(g, disp)
        if nat != "n/a":
            temp_friend = self.house_from(disp, g) in (2, 3, 4, 10, 11, 12)
            compound = _COMPOUND[(nat, temp_friend)]
        else:
            compound = "n/a"
        if status is None:
            status = f"{compound}'s sign" if compound != "n/a" else "Neutral (node)"
        return {"status": status, "in_exaltation_sign": s == ex_s, "in_debilitation_sign": s == deb_s,
                "dispositor": disp, "natural_relation_to_dispositor": nat,
                "compound_relation_to_dispositor": compound}

    def _chara_karakas(self):
        ranked = sorted(SEVEN, key=lambda g: self.deg[g], reverse=True)
        return {CHARA_KARAKAS[i]: g for i, g in enumerate(ranked)}

    def _varga(self, n: int):
        lag = varga_sign(self.lagna_lon, n)
        planets = {}
        for g in GRAHAS:
            s = varga_sign(self.lon[g], n)
            planets[g] = {"sign": s, "sign_name": SIGNS[s], "house": (s - lag) % 12 + 1,
                          "degree": round(varga_degree(self.lon[g], n), 4)}
        return {"name": VARGA_NAMES[n], "domain": VARGA_DOMAIN[n],
                "lagna": {"sign": lag, "sign_name": SIGNS[lag],
                          "degree": round(varga_degree(self.lagna_lon, n), 4)},
                "planets": planets}

    def associated(self, a: str, b: str) -> list[str]:
        """Parashari sambandha between two grahas: conjunction, exchange, mutual aspect, one-way aspect."""
        if a == b:
            return []
        how = []
        if self.sign[a] == self.sign[b]:
            how.append("conjunction")
        if SIGN_LORD[self.sign[a]] == b and SIGN_LORD[self.sign[b]] == a:
            how.append("exchange")
        ab, ba = self.aspects(a, self.house[b]), self.aspects(b, self.house[a])
        if ab and ba and "conjunction" not in how:
            how.append("mutual aspect")
        elif ab and "conjunction" not in how:
            how.append(f"{a.title()} aspects {b.title()}")
        elif ba and "conjunction" not in how:
            how.append(f"{b.title()} aspects {a.title()}")
        return how

    # ---------------------------------------------------------------- output
    def planet_dict(self, g: str):
        nk = nakshatra_info(self.lon[g])
        karaka = next((k for k, v in self.karakas.items() if v == g), None)
        return {
            "name": g, "lon": round(self.lon[g], 6), "sign": self.sign[g], "sign_name": SIGNS[self.sign[g]],
            "sign_sanskrit": SIGNS_SA[self.sign[g]], "degree": round(self.deg[g], 6), "dms": dms(self.deg[g]),
            "house": self.house[g], "nakshatra": nk["name"], "nakshatra_lord": nk["lord"], "pada": nk["pada"],
            "speed_deg_per_day": round(self.speed[g], 6), "retrograde": self.retro[g],
            "combustion": self.combust[g], "dignity": self.dignity[g],
            "avastha_baladi": baladi_avastha(self.sign[g], self.deg[g]),
            "chara_karaka": karaka, "lord_of_houses": self.lord_of[g],
            "aspects_houses": self.aspect_houses[g],
            "vargottama": self.sign[g] == varga_sign(self.lon[g], 9),
        }

    def to_dict(self, now: datetime | None = None, mahadasha_depth: int = 2):
        tz = self.time.local.tzinfo
        now = now or datetime.now(timezone.utc)
        lag_nk = nakshatra_info(self.lagna_lon)
        houses = [{"house": h, "sign": self.house_sign[h], "sign_name": SIGNS[self.house_sign[h]],
                   "lord": self.house_lord[h], "lord_in_house": self.house[self.house_lord[h]],
                   "occupants": self.occupants[h], "aspected_by": self.aspected_by[h]} for h in range(1, 13)]
        md = []
        for p in self.dasha.mahadashas:
            if p.end < self.time.utc:
                continue
            item = p.as_dict(tz)
            if mahadasha_depth >= 2:
                item["antardashas"] = [c.as_dict(tz) for c in Vimshottari.children(p)]
            md.append(item)
            if p.start.year - self.time.utc.year > 120:
                break
        return {
            "meta": {
                "engine": f"nuvora-vedic {ENGINE_VERSION}", "zodiac": "sidereal",
                "ayanamsa": {"name": "Lahiri", "value_deg": round(self.ayanamsa["true"], 6),
                             "value_dms": dms(self.ayanamsa["true"]),
                             "mean_deg": round(self.ayanamsa["mean"], 6)},
                "house_system": "whole sign", "node": self.options.node.lower(),
                "dasha_year_days": self.dasha.year_days, "node_aspects_5_7_9": self.options.node_aspects,
                "ephemeris": "JPL DE440s via Skyfield",
                "warnings": self.warnings,
            },
            "birth": {**asdict(self.birth), "utc": self.time.utc.isoformat(timespec="seconds"),
                      "local": self.time.local.isoformat(timespec="seconds"),
                      "utc_offset_hours": self.time.utc_offset_hours, "tz_source": self.time.source},
            "lagna": {"lon": round(self.lagna_lon, 6), "sign": self.lagna_sign,
                      "sign_name": SIGNS[self.lagna_sign], "degree": round(self.lagna_lon % 30, 6),
                      "dms": dms(self.lagna_lon % 30), "nakshatra": lag_nk["name"], "pada": lag_nk["pada"],
                      "lord": SIGN_LORD[self.lagna_sign]},
            "planets": {g: self.planet_dict(g) for g in GRAHAS},
            "houses": houses,
            "chara_karakas": self.karakas,
            "vargas": {f"D{n}": v for n, v in self.varga.items()},
            "panchang": self.panchang,
            "dasha": {**self.dasha.summary(),
                      "running_now": [p.as_dict(tz) for p in self.dasha.running(now, depth=3)],
                      "running_at_birth": [p.as_dict(tz) for p in self.dasha.running(self.time.utc, depth=3)],
                      "mahadashas": md},
        }
