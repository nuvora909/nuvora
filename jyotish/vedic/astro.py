"""Ephemeris layer: JPL DE440 via Skyfield, Lahiri ayanamsa, true/mean nodes, ascendant.

Validated against Swiss Ephemeris 2.10.03 (see tests/test_reference.py):
  planets < 0.4", Moon < 2.2", true node < 0.05", ascendant < 6" (≈0.4 s of birth time).

Commercial note: Skyfield is MIT, JPL ephemerides are public domain. No AGPL code ships.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np
from skyfield import almanac
from skyfield.api import load, load_file, wgs84
from skyfield.framelib import ecliptic_frame
from skyfield.nutationlib import iau2000b_radians, mean_obliquity

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EPHEMERIS_FILE = DATA_DIR / "de440s.bsp"

# --- Lahiri (Chitrapaksha) ayanamsa -------------------------------------------------------
# Same definition as Swiss Ephemeris SE_SIDM_LAHIRI (t0 = JD 2435553.5, value matching the
# Indian Astronomical Ephemeris), propagated with IAU 2006 general precession in longitude.
# The +0.131" term is a calibrated constant: residual vs SE has zero spread (std 0.000").
_LAHIRI_T0 = (2435553.5 - 2451545.0) / 36525.0
_LAHIRI_A0 = 23.250182778 - 0.004658035 + 0.131 / 3600.0

AYANAMSAS = ("LAHIRI",)


def _general_precession_arcsec(T):
    return (5028.796195 * T + 1.1054348 * T ** 2 + 0.00007964 * T ** 3
            - 0.000023857 * T ** 4 - 0.0000000383 * T ** 5)


def _prep(t):
    """Use IAU 2000B nutation (Skyfield's documented fast path; agrees with 2000A to ~1 mas)
    and cache it on the Time so GAST, frames and ayanamsa all use the same angles."""
    t._nutation_angles_radians = iau2000b_radians(t)
    return t


def _nutation(t):
    if "_nutation_angles_radians" not in t.__dict__:
        _prep(t)
    return t._nutation_angles_radians


def _wrap360(x):
    return np.mod(x, 360.0)


class Ephemeris:
    """Thread-safe for reads; build once and share."""

    BODY_KEYS = {"SUN": "sun", "MOON": "moon", "MARS": "mars barycenter", "MERCURY": "mercury",
                 "JUPITER": "jupiter barycenter", "VENUS": "venus", "SATURN": "saturn barycenter"}

    def __init__(self, path: Path = EPHEMERIS_FILE):
        if not Path(path).exists():
            raise FileNotFoundError(f"JPL ephemeris missing: {path}. Run scripts/fetch_data.py")
        self.ts = load.timescale(builtin=True)
        self.eph = load_file(str(path))
        self.earth = self.eph["earth"]
        self.bodies = {k: self.eph[v] for k, v in self.BODY_KEYS.items()}
        self.moon = self.eph["moon"]
        self.sun = self.eph["sun"]
        self.valid_from = self.ts.tdb_jd(max(s.spk_segment.start_jd for s in self.eph.segments)).utc_datetime()
        self.valid_to = self.ts.tdb_jd(min(s.spk_segment.end_jd for s in self.eph.segments)).utc_datetime()

    # ---- time -----------------------------------------------------------------------
    def time(self, when_utc):
        """datetime (aware, UTC) or list of them -> Skyfield Time."""
        if isinstance(when_utc, datetime):
            self._check_range(when_utc)
            return _prep(self.ts.from_datetime(when_utc))
        return _prep(self.ts.from_datetimes(list(when_utc)))

    def _check_range(self, dt):
        if not (self.valid_from + timedelta(days=2) <= dt <= self.valid_to - timedelta(days=2)):
            raise ValueError(f"Date {dt:%Y-%m-%d} outside ephemeris range "
                             f"{self.valid_from:%Y}-{self.valid_to:%Y}")

    # ---- ayanamsa ---------------------------------------------------------------------
    def ayanamsa(self, t, ayanamsa: str = "LAHIRI"):
        """Returns (mean_ayanamsa_deg, true_ayanamsa_deg). True = mean + nutation in longitude.
        Sidereal longitude = tropical apparent longitude - true ayanamsa (Swiss Ephemeris convention)."""
        if ayanamsa != "LAHIRI":
            raise ValueError(f"Unsupported ayanamsa {ayanamsa}")
        T = (t.tt - 2451545.0) / 36525.0
        mean = _LAHIRI_A0 + (_general_precession_arcsec(T) - _general_precession_arcsec(_LAHIRI_T0)) / 3600.0
        dpsi, _ = _nutation(t)
        return mean, mean + np.degrees(dpsi)

    # ---- planets -------------------------------------------------------------------
    def _tropical_body(self, t, key):
        lat, lon, _ = self.earth.at(t).observe(self.bodies[key]).apparent().frame_latlon(ecliptic_frame)
        return lon.degrees, lat.degrees

    def _tropical_true_node(self, t):
        # Osculating ascending node of the geocentric lunar orbit, ecliptic & equinox of date.
        r, v = (self.moon - self.earth).at(t).frame_xyz_and_velocity(ecliptic_frame)
        h = np.cross(r.au, v.au_per_d, axis=0)
        return _wrap360(np.degrees(np.arctan2(h[0], -h[1])))

    def _tropical_mean_node(self, t):
        T = (t.tt - 2451545.0) / 36525.0
        om = (125.0445479 - 1934.1362891 * T + 0.0020754 * T ** 2 + T ** 3 / 467441.0
              - T ** 4 / 60616000.0)
        dpsi, _ = _nutation(t)
        return _wrap360(om + np.degrees(dpsi))

    def sidereal_positions(self, when_utc: datetime, node: str = "TRUE", ayanamsa: str = "LAHIRI"):
        """Sidereal longitude, latitude and speed (deg/day) for the nine grahas at one instant."""
        dt_h = 1.0  # finite-difference half-step, hours
        times = [when_utc - timedelta(hours=dt_h), when_utc, when_utc + timedelta(hours=dt_h)]
        self._check_range(when_utc)
        t3 = _prep(self.ts.from_datetimes(times))
        _, ayan_true = self.ayanamsa(t3, ayanamsa)
        out = {}
        for key in self.BODY_KEYS:
            lon, lat = self._tropical_body(t3, key)
            sid = _wrap360(lon - ayan_true)
            out[key] = _pack(sid, lat, dt_h)
        node_lon = self._tropical_true_node(t3) if node == "TRUE" else self._tropical_mean_node(t3)
        rahu = _wrap360(node_lon - ayan_true)
        out["RAHU"] = _pack(rahu, np.zeros(3), dt_h)
        out["KETU"] = _pack(_wrap360(rahu + 180.0), np.zeros(3), dt_h)
        mean, true = self.ayanamsa(t3[1], ayanamsa)
        return out, {"mean": float(mean), "true": float(true), "name": ayanamsa}

    def sidereal_longitude_series(self, times_utc, key: str, ayanamsa: str = "LAHIRI"):
        """Vectorised sidereal longitude of one graha over many instants (used for transits/search)."""
        t = _prep(self.ts.from_datetimes(list(times_utc)))
        _, ayan_true = self.ayanamsa(t, ayanamsa)
        if key in self.BODY_KEYS:
            lon, _ = self._tropical_body(t, key)
        elif key in ("RAHU", "KETU"):
            lon = self._tropical_true_node(t) + (180.0 if key == "KETU" else 0.0)
        else:
            raise KeyError(key)
        return _wrap360(lon - ayan_true)

    # ---- ascendant -----------------------------------------------------------------
    def ascendant(self, t, lat_deg: float, lon_deg: float, ayanamsa: str = "LAHIRI"):
        """Sidereal ascendant (deg). Vectorised over Skyfield Time arrays."""
        dpsi, deps = _nutation(t)
        eps = np.radians(mean_obliquity(t.tdb) / 3600.0) + deps
        ramc = np.radians(_wrap360(t.gast * 15.0 + lon_deg))
        phi = math.radians(lat_deg)
        asc = np.degrees(np.arctan2(np.cos(ramc), -(np.sin(ramc) * np.cos(eps) + math.tan(phi) * np.sin(eps))))
        _, ayan_true = self.ayanamsa(t, ayanamsa)
        return _wrap360(asc - ayan_true)

    def ascendant_at(self, when_utc: datetime, lat: float, lon: float):
        return float(self.ascendant(self.time(when_utc), lat, lon))

    # ---- sunrise / sunset ------------------------------------------------------------
    def sun_events(self, when_utc: datetime, lat: float, lon: float):
        """Sunrise that began the Vedic day containing `when_utc`, plus that day's sunset and next sunrise.
        Uses the upper limb with standard refraction (-0.8333 deg)."""
        obs = self.earth + wgs84.latlon(lat, lon)
        t0 = self.ts.from_datetime(when_utc - timedelta(hours=36))
        t1 = self.ts.from_datetime(when_utc + timedelta(hours=36))
        rises, rflags = almanac.find_risings(obs, self.sun, t0, t1)
        sets, sflags = almanac.find_settings(obs, self.sun, t0, t1)
        rises = [r.utc_datetime() for r, ok in zip(rises, rflags) if ok]
        sets = [s.utc_datetime() for s, ok in zip(sets, sflags) if ok]
        before = [r for r in rises if r <= when_utc]
        after = [r for r in rises if r > when_utc]
        if not before or not after:
            return None  # polar day/night: no sunrise-based day
        sunrise, next_sunrise = before[-1], after[0]
        sunset = next((s for s in sets if sunrise < s < next_sunrise), None)
        return {"sunrise": sunrise, "sunset": sunset, "next_sunrise": next_sunrise}


def _pack(sid, lat, dt_h):
    d = (sid[2] - sid[0] + 540.0) % 360.0 - 180.0
    return {"lon": float(sid[1]), "lat": float(lat[1]), "speed": float(d / (2 * dt_h / 24.0))}


@lru_cache(maxsize=1)
def default_ephemeris() -> Ephemeris:
    return Ephemeris()
