"""Engine speed-ups must not change results: cached sign changes, interpolated sensitivity, shared activation."""
from datetime import datetime, timedelta, timezone

import pytest

import vedic
import vedic.events as events_mod
from vedic import BirthInput, Chart, Options, analyse
from vedic.astro import default_ephemeris
from vedic.sensitivity import sensitivity
from vedic.transits import _scan, ingresses

DELHI = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata")


@pytest.mark.parametrize("planet", ["SATURN", "JUPITER", "RAHU"])
def test_cached_slow_planet_ingresses_match_a_fresh_scan(planet):
    eph = default_ephemeris()
    start, end = datetime(2018, 3, 1, tzinfo=timezone.utc), datetime(2034, 9, 1, tzinfo=timezone.utc)
    cached, fresh = ingresses(eph, planet, start, end), _scan(eph, planet, start, end, 2.0)
    assert [(i["from"], i["to"]) for i in cached] == [(i["from"], i["to"]) for i in fresh]
    assert all(abs((a["time"] - b["time"]).total_seconds()) <= 60 for a, b in zip(cached, fresh))


def test_ingress_times_are_pinned_to_the_minute():
    """Each reported time is just after the sign change: a minute earlier the planet is still in the old sign."""
    eph = default_ephemeris()
    for ing in ingresses(eph, "SATURN", datetime(2019, 1, 1, tzinfo=timezone.utc), datetime(2030, 1, 1, tzinfo=timezone.utc)):
        before = eph.sidereal_longitude_series([ing["time"] - timedelta(minutes=1)], "SATURN")[0] // 30
        after = eph.sidereal_longitude_series([ing["time"]], "SATURN")[0] // 30
        assert int(after) == ing["to_sign"] and int(before) != ing["to_sign"]


def test_cached_results_are_copies():
    eph = default_ephemeris()
    start, end = datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2029, 1, 1, tzinfo=timezone.utc)
    first = ingresses(eph, "JUPITER", start, end)
    first[0]["time"] = "mutated by a caller"
    assert isinstance(ingresses(eph, "JUPITER", start, end)[0]["time"], datetime)


def test_interpolated_sensitivity_matches_the_bisection_results():
    """Values recorded with the previous one-second bisection search (minutes before / after birth)."""
    expected = {"lagna_sign": (39.0, 46.0), "navamsha_lagna": (1.7, 7.7), "dashamsha_lagna": (5.4, 3.0),
                "saptamsha_lagna": (3.0, 9.1), "shashtiamsha_lagna": (1.2, 0.2), "moon_sign": (696.0, 2492.2),
                "moon_nakshatra": (1418.8, 21.6), "moon_pada": (336.5, 21.6), "moon_navamsha": (336.5, 21.6)}
    s = sensitivity(Chart(DELHI))
    for key, (before, after) in expected.items():
        assert abs(s[key]["before_min"] - before) <= 0.15 and abs(s[key]["after_min"] - after) <= 0.15, key


def test_prashna_style_report_computes_activation_once(monkeypatch):
    calls = []
    real = vedic.activation_windows

    def counting(*args, **kwargs):
        calls.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(vedic, "activation_windows", counting)
    monkeypatch.setattr(events_mod, "activation_windows", counting)
    analyse(DELHI, Options(vargas=()), now=datetime(2026, 11, 24, tzinfo=timezone.utc),
            include_transits=False, include_sensitivity=False)
    assert len(calls) == 1, "every topic should share one activation computation"
