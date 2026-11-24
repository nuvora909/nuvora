"""Panchang (five limbs) at an instant: tithi, vara, nakshatra, yoga, karana."""
from __future__ import annotations

from datetime import datetime

from .constants import (KARANAS_MOVABLE, NAK_LORD, NAK_SPAN, NAKSHATRAS, PADA_SPAN, TITHIS, VARA_LORD,
                        VARAS, YOGAS_27)


def tithi_info(sun_lon: float, moon_lon: float):
    elong = (moon_lon - sun_lon) % 360.0
    k = int(elong // 12.0)                      # 0..29
    paksha = "Shukla" if k < 15 else "Krishna"
    i = k % 15
    if i == 14:
        name = "Purnima" if paksha == "Shukla" else "Amavasya"
    else:
        name = TITHIS[i]
    return {"index": k + 1, "name": name, "paksha": paksha,
            "elapsed_fraction": round((elong - 12.0 * k) / 12.0, 6), "moon_sun_elongation": round(elong, 6)}


def karana_info(sun_lon: float, moon_lon: float):
    elong = (moon_lon - sun_lon) % 360.0
    k = int(elong // 6.0)                       # 0..59 half-tithis
    if k == 0:
        name = "Kimstughna"
    elif k <= 56:
        name = KARANAS_MOVABLE[(k - 1) % 7]
    else:
        name = ("Shakuni", "Chatushpada", "Naga")[k - 57]
    return {"index": k + 1, "name": name, "fixed": k == 0 or k >= 57}


def yoga_info(sun_lon: float, moon_lon: float):
    s = (sun_lon + moon_lon) % 360.0
    k = int(s // NAK_SPAN)
    return {"index": k + 1, "name": YOGAS_27[k], "elapsed_fraction": round((s - k * NAK_SPAN) / NAK_SPAN, 6)}


def nakshatra_info(lon: float):
    lon %= 360.0
    k = int(lon // NAK_SPAN)
    within = lon - k * NAK_SPAN
    return {"index": k + 1, "name": NAKSHATRAS[k], "lord": NAK_LORD[k],
            "pada": int(within // PADA_SPAN) + 1, "elapsed_fraction": round(within / NAK_SPAN, 6)}


def vara_info(sunrise_local: datetime | None, when_local: datetime):
    """Vedic weekday runs sunrise to sunrise. If no sunrise exists (polar), the civil date is used."""
    basis = sunrise_local if sunrise_local is not None else when_local
    idx = (basis.weekday() + 1) % 7            # python Monday=0 -> Sunday=0
    return {"index": idx, "name": VARAS[idx], "lord": VARA_LORD[idx],
            "basis": "sunrise" if sunrise_local is not None else "civil date (no sunrise at this latitude)"}


def panchang(sun_lon: float, moon_lon: float, when_local: datetime, sun_events: dict | None):
    tz = when_local.tzinfo
    sunrise_local = sun_events["sunrise"].astimezone(tz) if sun_events else None
    out = {
        "tithi": tithi_info(sun_lon, moon_lon),
        "vara": vara_info(sunrise_local, when_local),
        "nakshatra": nakshatra_info(moon_lon),
        "yoga": yoga_info(sun_lon, moon_lon),
        "karana": karana_info(sun_lon, moon_lon),
    }
    if sun_events:
        f = lambda d: d.astimezone(tz).isoformat(timespec="seconds") if d else None
        out["sunrise"] = f(sun_events["sunrise"])
        out["sunset"] = f(sun_events["sunset"])
        out["next_sunrise"] = f(sun_events["next_sunrise"])
        sr, ss = sun_events["sunrise"], sun_events["sunset"]
        when_utc = when_local.astimezone(sr.tzinfo)
        out["born_during"] = "day" if ss and sr <= when_utc < ss else "night"
    return out
