"""Cross-check against an independent production system (Jyai, Swiss Ephemeris based) for one chart:
1990-01-01 12:00 IST, New Delhi. Values were read from Jyai's public kundli output."""
from datetime import datetime, timezone

import pytest

from vedic import BirthInput, Chart, full_report
from vedic.ashtakavarga import ashtakavarga


@pytest.fixture(scope="module")
def chart():
    return Chart(BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090,
                            tz_name="Asia/Kolkata"))


def test_lagna_and_luminaries(chart):
    assert chart.lagna_sign == 11 and abs(chart.lagna_lon % 30 - 13.92) < 0.01
    assert abs(chart.lon["MOON"] - 306.4653) < 0.001
    assert abs(chart.lon["SUN"] - 256.8599) < 0.001


def test_vargas_match_jyai(chart):
    assert chart.varga[9]["planets"]["MOON"]["sign_name"] == "Scorpio"
    assert chart.varga[60]["lagna"]["sign_name"] == "Gemini"
    assert chart.varga[10]["lagna"]["sign_name"] == "Pisces"
    assert chart.varga[10]["planets"]["MOON"]["sign_name"] == "Aries"


def test_dasha_matches_jyai(chart):
    sat = next(p for p in chart.dasha.mahadashas if p.lord == "SATURN")
    # Jyai: 2024-02-09T14:44 -> 2043-02-09T08:44 IST. 1" of Moon ≈ 77 min of dasha start, so a few
    # minutes is the expected inter-engine spread.
    assert abs((sat.start - datetime(2024, 2, 9, 9, 14, tzinfo=timezone.utc)).total_seconds()) < 15 * 60
    assert abs((sat.end - datetime(2043, 2, 9, 3, 14, tzinfo=timezone.utc)).total_seconds()) < 15 * 60
    mars = chart.dasha.mahadashas[0]
    mars_moon = next(c for c in chart.dasha.children(mars) if c.lord == "MOON")
    # Jyai lists Mars-Moon ending 08-Feb-1990; ours ends 1990-02-08 21:10 UTC (02:40 IST on the 9th).
    assert mars_moon.end.date().isoformat() == "1990-02-08"


def test_panchang_and_avastha(chart):
    assert chart.panchang["karana"]["name"] == "Bava"
    assert chart.panchang["tithi"]["name"] == "Panchami" and chart.panchang["tithi"]["paksha"] == "Shukla"
    assert chart.panchang["vara"]["name"].startswith("Somavara")      # 1 Jan 1990 was a Monday
    d = chart.planet_dict("JUPITER")
    assert d["avastha_baladi"] == "Kumara"
    assert d["dignity"]["natural_relation_to_dispositor"] == "Enemy"
    assert chart.retro["MERCURY"] and chart.retro["VENUS"] and chart.retro["JUPITER"]
    assert chart.combust["SATURN"]["combust"]


def test_ashtakavarga_checksums(chart):
    a = ashtakavarga(chart)
    assert {p: sum(r) for p, r in a["bav_by_sign"].items()} == {
        "SUN": 48, "MOON": 49, "MARS": 39, "MERCURY": 54, "JUPITER": 56, "VENUS": 52, "SATURN": 39}
    assert sum(a["sav_by_sign"]) == 337


def test_full_report_is_json(chart):
    import json
    r = full_report(chart.birth, now=datetime(2026, 11, 14, tzinfo=timezone.utc))
    s = json.dumps(r)
    assert len(s) > 10000
    assert r["transits"]["sade_sati"]["active"] is True          # Saturn in Pisces, 2nd from Aquarius Moon
    periods = r["transits"]["sade_sati"]["lifetime_periods"]
    assert periods[1]["start"] == "2020-01-24"                    # Saturn's sidereal Capricorn ingress


def test_sensitivity_edges_are_real(chart):
    from datetime import timedelta
    from vedic.sensitivity import sensitivity
    from vedic.vargas import varga_sign
    s = sensitivity(chart)
    b = chart.birth
    for key, n in (("lagna_sign", 1), ("navamsha_lagna", 9), ("dashamsha_lagna", 10)):
        ref = varga_sign(chart.lagna_lon, n)
        for side, sgn in (("after_min", 1), ("before_min", -1)):
            m = s[key][side]
            inside = chart.time.utc + sgn * timedelta(minutes=m - 0.1)
            outside = chart.time.utc + sgn * timedelta(minutes=m + 0.1)
            assert varga_sign(chart.eph.ascendant_at(inside, b.lat, b.lon), n) == ref
            assert varga_sign(chart.eph.ascendant_at(outside, b.lat, b.lon), n) != ref
    # Moon leaves Dhanishta ~21.6 min after birth: the birth mahadasha would flip Mars -> Rahu.
    assert s["moon_nakshatra"]["rating"] == "sensitive"
    assert 20 < s["moon_nakshatra"]["after_min"] < 23
