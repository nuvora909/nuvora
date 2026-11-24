"""Rule tests on synthetic charts (exact longitudes, no ephemeris)."""
from vedic.ashtakavarga import ashtakavarga
from vedic.chart import Chart, Options
from vedic.yogas import all_yogas

BASE = {"SUN": 100, "MOON": 200, "MARS": 250, "MERCURY": 110, "JUPITER": 300, "VENUS": 80,
        "SATURN": 330, "RAHU": 50}


def mk(lagna, **over):
    lons = {**BASE, **{k.upper(): v for k, v in over.items()}}
    return Chart.from_longitudes(lagna, lons)


def names(c, present=True):
    return {y["name"] for y in all_yogas(c) if y["present"] == present}


def test_dignity_levels():
    c = mk(0, sun=10, moon=32, mercury=160, jupiter=95, saturn=200, mars=280)
    assert c.dignity["SUN"]["status"] == "Exalted"
    assert c.dignity["MOON"]["status"] == "Exalted"           # Taurus 2° < moolatrikona start (3°)
    assert c.dignity["MERCURY"]["status"] == "Exalted"
    c2 = mk(0, sun=130, moon=40, mercury=167)
    assert c2.dignity["SUN"]["status"] == "Moolatrikona"      # Leo 10°
    assert c2.dignity["MOON"]["status"] == "Moolatrikona" and c2.dignity["MOON"]["in_exaltation_sign"]
    assert c2.dignity["MERCURY"]["status"] == "Moolatrikona"  # Virgo 17°
    c3 = mk(0, sun=145, saturn=10)
    assert c3.dignity["SUN"]["status"] == "Own sign"          # Leo 25°
    assert c3.dignity["SATURN"]["status"] == "Debilitated"


def test_compound_relationship():
    # Jupiter in Gemini (Mercury's sign): natural enemy. Mercury 2nd from Jupiter -> temporary friend -> Neutral
    c = mk(0, jupiter=70, mercury=100)
    assert c.dignity["JUPITER"]["natural_relation_to_dispositor"] == "Enemy"
    assert c.dignity["JUPITER"]["compound_relation_to_dispositor"] == "Neutral"
    # Mercury 7th from Jupiter -> temporary enemy -> Great Enemy
    c = mk(0, jupiter=70, mercury=250)
    assert c.dignity["JUPITER"]["compound_relation_to_dispositor"] == "Great Enemy"


def test_aspects():
    c = mk(0, mars=5, saturn=5, jupiter=5, rahu=5)
    assert c.aspect_houses["MARS"] == [4, 7, 8]
    assert c.aspect_houses["SATURN"] == [3, 7, 10]
    assert c.aspect_houses["JUPITER"] == [5, 7, 9]
    assert c.aspect_houses["RAHU"] == [5, 7, 9]
    assert c.aspect_houses["SUN"] == [(c.house["SUN"] + 5) % 12 + 1]
    c2 = Chart.from_longitudes(0, {**BASE, "RAHU": 5}, options=Options(node_aspects=False))
    assert c2.aspect_houses["RAHU"] == [7]


def test_combustion_and_karakas():
    c = mk(0, sun=100, mercury=110, venus=100.5)
    assert c.combust["MERCURY"]["combust"] and c.combust["VENUS"]["combust"]
    c = mk(0, sun=100, mercury=116)
    assert not c.combust["MERCURY"]["combust"]                # 16° > 14° orb
    c = mk(0, sun=29.5, moon=31)
    assert c.karakas["Atmakaraka"] == "SUN"                   # highest degree within sign


def test_pancha_mahapurusha_and_gajakesari():
    c = mk(90, jupiter=95, moon=5)                            # Cancer lagna, Jupiter exalted in 1st; Moon 4th from it
    n = names(c)
    assert "Hamsa Yoga" in n and "Gajakesari Yoga" in n
    c = mk(90, jupiter=125)                                    # Jupiter in Leo: no Hamsa
    assert "Hamsa Yoga" not in names(c)


def test_kaal_sarp():
    c = mk(0, rahu=0.5, sun=10, moon=40, mars=60, mercury=20, jupiter=100, venus=30, saturn=170)
    assert "Kaal Sarp Yoga" in names(c)
    c = mk(0, rahu=0.5, sun=10, moon=200, mars=60, mercury=20, jupiter=100, venus=30, saturn=170)
    assert "Kaal Sarp Yoga" in names(c, present=False)


def test_manglik():
    assert "Manglik (Kuja) Dosha" in names(mk(0, mars=190))   # 7th from Aries lagna
    assert "Manglik (Kuja) Dosha" in names(mk(0, mars=100))   # Cancer = 4th
    assert "Manglik (Kuja) Dosha" in names(mk(0, mars=70), present=False)   # Gemini = 3rd
    assert "Manglik (Kuja) Dosha" in names(mk(0, mars=130), present=False)  # Leo = 5th


def test_parivartana_and_viparita():
    c = mk(0, sun=95, moon=125)                               # Sun in Cancer, Moon in Leo: 4th & 5th lords
    assert "Maha Parivartana Yoga" in names(c)
    c = mk(0, mercury=215)                                    # 6th lord Mercury (Virgo) in 8th (Scorpio)
    assert "Harsha (Viparita Raja) Yoga" in names(c)


def test_yogakaraka_and_neecha_bhanga():
    c = mk(30)                                                # Taurus lagna: Saturn rules 9 and 10
    assert "Yogakaraka Saturn" in names(c)
    c = mk(0, sun=190, venus=275)                             # Sun debilitated in Libra, Venus in 10th (kendra)
    y = next(y for y in all_yogas(c) if y.get("planet") == "SUN")
    assert y["present"] and y["name"] == "Neecha Bhanga Raja Yoga"


def test_ashtakavarga_any_chart():
    for lag in range(0, 360, 37):
        a = ashtakavarga(mk(lag, moon=(lag * 7) % 360, saturn=(lag * 3) % 360))
        assert sum(a["sav_by_sign"]) == 337
