"""Vimshottari dasha, five levels (maha, antar, pratyantar, sookshma, prana)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .constants import DASHA_ORDER, DASHA_YEARS, NAK_LORD, NAK_SPAN

LEVEL_NAMES = ["Mahadasha", "Antardasha", "Pratyantardasha", "Sookshma", "Prana"]
YEAR_DAYS = {"julian": 365.25, "gregorian": 365.2425, "savana": 360.0}


@dataclass(frozen=True)
class Period:
    level: int                # 0 = mahadasha
    lords: tuple[str, ...]    # path, e.g. ("SATURN", "MERCURY")
    start: datetime
    end: datetime

    @property
    def lord(self) -> str:
        return self.lords[-1]

    def as_dict(self, tz=None):
        f = (lambda d: d.astimezone(tz).isoformat(timespec="minutes")) if tz else (lambda d: d.isoformat(timespec="minutes"))
        return {"level": LEVEL_NAMES[self.level], "lords": list(self.lords),
                "label": "-".join(x.title() for x in self.lords), "start": f(self.start), "end": f(self.end)}


def _seq_from(lord: str):
    i = DASHA_ORDER.index(lord)
    return [DASHA_ORDER[(i + k) % 9] for k in range(9)]


class Vimshottari:
    def __init__(self, moon_lon: float, birth_utc: datetime, year: str = "julian"):
        self.year_days = YEAR_DAYS[year]
        self.year_kind = year
        k = int(moon_lon // NAK_SPAN)
        self.birth_lord = NAK_LORD[k]
        self.elapsed_fraction = (moon_lon - k * NAK_SPAN) / NAK_SPAN
        lord_years = DASHA_YEARS[self.birth_lord]
        self.balance_years = (1.0 - self.elapsed_fraction) * lord_years
        start = birth_utc - timedelta(days=self.elapsed_fraction * lord_years * self.year_days)
        self.birth = birth_utc
        self.mahadashas: list[Period] = []
        cur = start
        for cycle in range(2):                  # 240 years covers any lifetime
            for lord in _seq_from(self.birth_lord):
                end = cur + timedelta(days=DASHA_YEARS[lord] * self.year_days)
                self.mahadashas.append(Period(0, (lord,), cur, end))
                cur = end

    @staticmethod
    def children(p: Period) -> list[Period]:
        if p.level >= 4:
            return []
        total = (p.end - p.start).total_seconds()
        out, cur = [], p.start
        for sub in _seq_from(p.lord):
            dur = timedelta(seconds=total * DASHA_YEARS[sub] / 120.0)
            out.append(Period(p.level + 1, p.lords + (sub,), cur, cur + dur))
            cur = cur + dur
        # absorb float drift so children tile the parent exactly
        last = out[-1]
        out[-1] = Period(last.level, last.lords, last.start, p.end)
        return out

    def running(self, at: datetime, depth: int = 5) -> list[Period]:
        chain, level = [], self.mahadashas
        for _ in range(depth):
            cur = next((p for p in level if p.start <= at < p.end), None)
            if cur is None:
                break
            chain.append(cur)
            level = self.children(cur)
        return chain

    def between(self, start: datetime, end: datetime, depth: int = 2) -> list[Period]:
        """All periods at `depth` (1=maha, 2=antar, 3=pratyantar) overlapping [start, end]."""
        level = [p for p in self.mahadashas if p.end > start and p.start < end]
        for _ in range(depth - 1):
            level = [c for p in level for c in self.children(p) if c.end > start and c.start < end]
        return level

    def summary(self):
        return {"system": "Vimshottari", "year_length_days": self.year_days,
                "birth_nakshatra_lord": self.birth_lord,
                "balance_at_birth_years": round(self.balance_years, 4),
                "elapsed_fraction_of_birth_nakshatra": round(self.elapsed_fraction, 6)}
