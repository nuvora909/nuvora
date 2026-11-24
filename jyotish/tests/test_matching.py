from vedic.chart import Chart
from vedic.constants import GRAHAS
from vedic.matching import _vashya, match_charts


def synthetic(moon, name="Partner", gender=None):
    lons = {g: 40.0 for g in GRAHAS}
    lons["MOON"] = moon
    lons["KETU"] = 220.0
    c = Chart.from_longitudes(0.0, lons)
    c.birth.name = name
    c.birth.gender = gender
    return c


def test_identical_moon_has_same_nadi_zero_and_complete_eight_factors():
    out = match_charts(synthetic(0.0, "A"), synthetic(0.0, "B"))
    by_key = {k["key"]: k for k in out["kootas"]}
    assert out["calculated_factors"] == 8 and out["maximum"] == 36
    assert by_key["nadi"]["score"] == 0
    assert out["total"] == 28
    assert all(0 <= k["score"] <= k["max"] for k in out["kootas"])


def test_ashwini_bharani_reference_score_and_direction():
    out = match_charts(synthetic(0.0, "A"), synthetic(14.0, "B"))
    by_key = {k["key"]: k for k in out["kootas"]}
    assert by_key["varna"]["score"] == 1
    assert by_key["vashya"]["score"] == 2
    assert by_key["tara"]["score"] == 3
    assert by_key["yoni"]["score"] == 2
    assert by_key["gana"]["score"] == 6
    assert by_key["maitri"]["score"] == 5
    assert by_key["bhakoot"]["score"] == 7
    assert by_key["nadi"]["score"] == 8
    assert out["total"] == 34
    reverse = match_charts(synthetic(14.0, "A"), synthetic(0.0, "B"))
    assert {k["key"]: k for k in reverse["kootas"]}["gana"]["score"] == 5
    assert reverse["total"] == 33


def test_bhakoot_difficult_relation_and_split_vashya_signs():
    out = match_charts(synthetic(0.0), synthetic(30.0))
    assert {k["key"]: k for k in out["kootas"]}["bhakoot"]["score"] == 0
    assert _vashya(8, 14.9) == "Human" and _vashya(8, 15.0) == "Quadruped"
    assert _vashya(9, 14.9) == "Quadruped" and _vashya(9, 15.0) == "Jalachara"


def test_gender_direction_and_birth_time_context_are_explicit():
    a = synthetic(0.0, "A", "male")
    b = synthetic(14.0, "B", "female")
    out = match_charts(a, b)
    assert "female chart as bride" in out["direction"]
    assert out["person1"]["name"] == "A" and out["person2"]["name"] == "B"
    assert out["person1"]["relationship_indicators"]["d9_lagna"]
    assert "not a probability" in out["caution"]
    assert "not a medical" in out["caution"]
