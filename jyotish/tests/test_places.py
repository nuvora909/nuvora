import csv

import pytest

from vedic import places


@pytest.fixture
def small_places_db(tmp_path, monkeypatch):
    db = tmp_path / "places.tsv"
    rows = [
        ("Pune", "Pune", "18.5204", "73.8567", "India", "Maharashtra", "12400000", "Asia/Kolkata"),
        ("Salem", "Salem", "44.9429", "-123.0351", "United States", "Oregon", "177000", "America/Los_Angeles"),
        ("Salem", "Salem", "11.6643", "78.1460", "India", "Tamil Nadu", "829000", "Asia/Kolkata"),
        ("São Paulo", "Sao Paulo", "-23.5505", "-46.6333", "Brazil", "Sao Paulo", "12200000", "America/Sao_Paulo"),
    ]
    with db.open("w", encoding="utf-8", newline="") as out:
        csv.writer(out, delimiter="\t").writerows(rows)
    monkeypatch.setattr(places, "TSV", db)
    places._index.cache_clear()
    yield
    places._index.cache_clear()


def test_city_prefix_search_is_case_insensitive_and_population_ranked(small_places_db):
    assert places.search("sal", limit=1)[0]["region"] == "Tamil Nadu"
    assert places.search("PUNE")[0]["country"] == "India"


def test_city_search_can_narrow_by_region_and_country(small_places_db):
    result = places.search("Salem, Tamil Nadu")
    assert len(result) == 1
    assert result[0]["country"] == "India"


def test_ascii_prefix_finds_unicode_city_name(small_places_db):
    result = places.search("sao paulo")
    assert result[0]["name"] == "São Paulo"
