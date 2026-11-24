"""Local birth time -> UTC, with honest handling of historical zones and DST edge cases."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass
class ResolvedTime:
    utc: datetime
    local: datetime
    utc_offset_hours: float
    source: str                     # "iana" or "fixed"
    tz_name: str | None
    warnings: list[str] = field(default_factory=list)


def resolve_birth_time(year: int, month: int, day: int, hour: int, minute: int, second: int = 0,
                       tz_name: str | None = None, utc_offset_hours: float | None = None) -> ResolvedTime:
    """Prefer an IANA zone (historically correct offsets, e.g. India's 1942-45 war time, US DST).
    Fall back to a fixed offset if that is all we have."""
    naive = datetime(year, month, day, hour, minute, second)
    warnings: list[str] = []
    if tz_name:
        try:
            zi = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError as e:
            raise ValueError(f"Unknown timezone '{tz_name}'") from e
        a = naive.replace(tzinfo=zi, fold=0)
        b = naive.replace(tzinfo=zi, fold=1)
        if a.utcoffset() != b.utcoffset():
            # Either ambiguous (clock fell back) or non-existent (clock jumped forward).
            roundtrip = a.astimezone(timezone.utc).astimezone(zi).replace(tzinfo=None)
            if roundtrip != naive:
                warnings.append(f"{naive:%Y-%m-%d %H:%M} did not exist in {tz_name} (clocks moved forward). "
                                f"Interpreted with the pre-change offset; please confirm the birth time.")
            else:
                warnings.append(f"{naive:%Y-%m-%d %H:%M} occurred twice in {tz_name} (clocks moved back). "
                                f"Using the first occurrence; the other is {abs((a.utcoffset()-b.utcoffset()).total_seconds())/60:.0f} min later.")
        local = a
        off = local.utcoffset()
        if tz_name == "Asia/Kolkata" and off != timedelta(hours=5, minutes=30):
            warnings.append(f"Historical Indian offset applied: UTC{_fmt(off)} (not today's +05:30).")
        return ResolvedTime(local.astimezone(timezone.utc), local, off.total_seconds() / 3600, "iana", tz_name, warnings)
    if utc_offset_hours is None:
        raise ValueError("Provide tz_name (preferred) or utc_offset_hours")
    tz = timezone(timedelta(hours=utc_offset_hours))
    local = naive.replace(tzinfo=tz)
    warnings.append("Fixed UTC offset used; historical DST/war-time changes are not applied.")
    return ResolvedTime(local.astimezone(timezone.utc), local, utc_offset_hours, "fixed", None, warnings)


def _fmt(off: timedelta) -> str:
    m = int(off.total_seconds() // 60)
    s = "+" if m >= 0 else "-"
    m = abs(m)
    return f"{s}{m // 60:02d}:{m % 60:02d}"
