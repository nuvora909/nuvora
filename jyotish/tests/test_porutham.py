"""Porutham rules: Rajju groups, Vedha pairs, the decisive-factor verdict and the report chapter inputs."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402
from vedic.constants import NAKSHATRAS  # noqa: E402
from vedic.porutham import RAJJU_PATTERN, VEDHA_PAIRS, porutham  # noqa: E402

PARTNER = dict(year=1992, month=5, day=16, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata",
               name="Meera", place="New Delhi")


def rajju(name):
    return RAJJU_PATTERN[NAKSHATRAS.index(name) % 9]


def test_rajju_groups_match_the_classical_table():
    assert {rajju(n) for n in ("Ashwini", "Ashlesha", "Magha", "Jyeshtha", "Mula", "Revati")} == {"Paada (feet)"}
    assert {rajju(n) for n in ("Mrigashira", "Chitra", "Dhanishta")} == {"Siro (head)"}
    assert {rajju(n) for n in ("Rohini", "Ardra", "Hasta", "Swati", "Shravana", "Shatabhisha")} == {"Kantha (neck)"}
    assert {rajju(n) for n in ("Krittika", "Punarvasu", "Uttara Phalguni", "Vishakha", "Uttara Ashadha",
                               "Purva Bhadrapada")} == {"Nabhi (navel)"}


def test_vedha_pairs_cover_every_star_once_except_the_siro_triangle():
    stars = [s for pair in VEDHA_PAIRS for s in pair]
    assert sorted(set(stars)) == list(range(1, 28))
    assert (1, 18) in VEDHA_PAIRS and (10, 27) in VEDHA_PAIRS  # Ashwini–Jyeshtha, Magha–Revati


def test_reference_pair_has_ten_poruthams_and_a_consistent_verdict():
    c1, _ = analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)
    c2, _ = analyse(BirthInput(**PARTNER), Options(), REFERENCE_ASKED_AT)
    pr = porutham(c1, c2, REFERENCE_ASKED_AT)
    assert [x["key"] for x in pr["rows"]] == ["dina", "gana", "mahendra", "stree_deergha", "yoni", "rasi",
                                              "rasi_adhipati", "vasya", "rajju", "vedha"]
    assert pr["agree"] == sum(1 for x in pr["rows"] if x["ok"] is True)
    if not pr["decisive_ok"]:
        assert pr["verdict"].startswith("Not recommended")
    assert pr["papa"]["bride"] >= 0 and pr["papa"]["groom"] >= 0


def test_same_star_fails_rajju():
    c1, _ = analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)
    pr = porutham(c1, c1, REFERENCE_ASKED_AT)
    rajju_row = next(x for x in pr["rows"] if x["key"] == "rajju")
    assert rajju_row["ok"] is False and pr["verdict"].startswith("Not recommended")
