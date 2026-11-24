import pytest

from vedic.panchang import karana_info, nakshatra_info, tithi_info, yoga_info


@pytest.mark.parametrize("elong,name,paksha,idx", [
    (0.5, "Pratipada", "Shukla", 1), (174.0, "Purnima", "Shukla", 15), (180.1, "Pratipada", "Krishna", 16),
    (359.0, "Amavasya", "Krishna", 30), (49.6, "Panchami", "Shukla", 5),
])
def test_tithi(elong, name, paksha, idx):
    t = tithi_info(100.0, 100.0 + elong)
    assert (t["name"], t["paksha"], t["index"]) == (name, paksha, idx)


@pytest.mark.parametrize("elong,name", [
    (1.0, "Kimstughna"), (7.0, "Bava"), (13.0, "Balava"), (48.5, "Bava"), (49.6, "Bava"),
    (337.0, "Vishti"), (343.0, "Shakuni"), (349.0, "Chatushpada"), (355.0, "Naga"),
])
def test_karana(elong, name):
    assert karana_info(200.0, 200.0 + elong)["name"] == name


def test_karana_cycle_counts():
    names = [karana_info(0.0, 6.0 * k + 0.1)["name"] for k in range(60)]
    assert names.count("Vishti") == 8 and names.count("Bava") == 8
    assert sum(names.count(n) for n in ("Kimstughna", "Shakuni", "Chatushpada", "Naga")) == 4


def test_nakshatra_and_yoga():
    assert nakshatra_info(0.0)["name"] == "Ashwini" and nakshatra_info(0.0)["pada"] == 1
    assert nakshatra_info(359.99)["name"] == "Revati" and nakshatra_info(359.99)["pada"] == 4
    assert nakshatra_info(306.4653)["name"] == "Dhanishta"
    assert yoga_info(0.0, 0.1)["name"] == "Vishkambha"
    assert yoga_info(180.0, 179.9)["name"] == "Vaidhriti"
