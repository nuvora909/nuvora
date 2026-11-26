"""PDF reports: every product renders, reads as its own subject and carries its visuals."""
import re
import sys
from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from server.report_content import build_report  # noqa: E402
from server.report_pdf import render_pdf  # noqa: E402
from server.report_products import PRODUCTS  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402

PARTNER = dict(year=1992, month=5, day=16, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata",
               name="Meera", place="New Delhi")

# Chapters each product must contain: the report has to be about its own subject.
EXPECTED = {
    "core": ["Your birth chart", "Avakhada chakra and favourable points", "Numerology",
             "House-by-house results (Bhava phal)", "KP system (Krishnamurti Paddhati)", "Divisional charts", "Your planetary periods", "Current transits"],
    "life_1": ["Career and status", "Marriage and relationships", "Wealth and finances", "Year by year",
               "Avakhada chakra and favourable points", "House-by-house results (Bhava phal)",
               "Varshaphal: your annual charts", "Month by month"],
    "life_5": ["Health and vitality", "Year by year", "Varshaphal: your annual charts"],
    "sade_sati": ["Sade Sati status and phase analysis", "How strongly it is felt in your chart", "Phase by phase"],
    "dosha": ["Manglik (Kuja) Dosha", "Kaal Sarp Yoga", "Other classical checks"],
    "marriage": ["Marriage conditions", "Your partner as the chart describes", "Candidate Shubh Vivah Muhurat dates"],
    "gemstone": ["Chart-linked gemstone suggestion", "Supporting stones and stones to avoid"],
    "rudraksha": ["Chart-linked rudraksha suggestion", "How to wear and care for it"],
    "match": ["Match summary", "The eight factors explained", "Porutham: South Indian matching", "Doshas and cancellations"],
    "child": ["Temperament and nature", "Name letters (Namakshar)", "Birth doshas and remedies",
              "Planetary periods of childhood", "Sanskar muhurats"],
}


@pytest.fixture(scope="module")
def charts():
    c, r = analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)
    c2, r2 = analyse(BirthInput(**PARTNER), Options(), REFERENCE_ASKED_AT)
    return c, r, c2, r2


def _build(key, charts):
    c, r, c2, r2 = charts
    return build_report(key, c, r, c2 if key == "match" else None, r2 if key == "match" else None, now=REFERENCE_ASKED_AT)


@pytest.mark.parametrize("key", list(EXPECTED))
def test_each_product_is_about_its_subject(key, charts):
    title, subtitle, sections = _build(key, charts)
    chapters = [s["title"] for s in sections if s.get("chapter")]
    for name in EXPECTED[key]:
        assert name in chapters, (key, chapters)
    assert sections[0].get("cover"), "every full report opens with a title page"
    if key != "core":  # the sample endpoint serves standalone products only
        assert sum(1 for s in sections if s.get("sample")) >= 1, "the sample endpoint needs a marked section"


@pytest.mark.parametrize("key", ["core", "life_1", "sade_sati", "dosha", "match", "marriage", "gemstone", "rudraksha"])
def test_every_product_renders_a_full_pdf(key, charts):
    title, subtitle, sections = _build(key, charts)
    reader = PdfReader(BytesIO(render_pdf(title, subtitle, sections)))
    assert len(reader.pages) >= 5
    text = " ".join(page.extract_text() for page in reader.pages[1:4])
    assert "Contents" in text and title.split(" —")[0] in text
    body = " ".join(page.extract_text() for page in reader.pages)
    assert "<fact" not in body and "**" not in body, "markup must never leak into the PDF"


def test_life_report_reads_like_an_astrologer(charts):
    _, _, sections = _build("life_1", charts)
    career = next(s for s in sections if s["title"] == "Career and status")
    kinds = [b["t"] for b in career["blocks"]]
    assert kinds[0] == "callout" and "flow" in kinds, "verdict first, then a drawn timing chart"
    texts = " ".join(str(b.get("text", "")) + " ".join(b.get("items", [])) for b in career["blocks"])
    assert "10th" in texts and "double transit" in texts
    assert "Period(" not in texts and not re.search(r"\bH\d", texts)
    year = next(s for s in sections if s["title"].startswith("Year 1 ·"))
    assert any(b["t"] == "callout" and b["title"] == "Focus for the year" for b in year["blocks"])


def test_twenty_year_report_has_every_year(charts):
    _, _, sections = _build("life_20", charts)
    assert sum(1 for s in sections if s["title"].startswith("Year ") and " · " in s["title"]) == 20


def test_sample_page_renders_from_the_marked_section(charts):
    for key in ("life_5", "sade_sati", "dosha", "marriage", "gemstone", "rudraksha", "match"):
        title, _, sections = _build(key, charts)
        sample = next(s for s in sections if s.get("sample"))
        reader = PdfReader(BytesIO(render_pdf(title, "Preview", [sample])))
        assert len(reader.pages) >= 2


def test_legacy_sections_still_render():
    pdf = render_pdf("Test Kundli", "Core", [{"title": "Birth details", "paragraphs": ["Calculated chart"],
                                               "bullets": ["one"], "table": {"headers": ["A"], "rows": [["1"]]}}])
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 2 and "Test Kundli" in reader.pages[1].extract_text()


def test_classical_tables_are_computed_correctly(charts):
    from server.report_content import Ctx
    from server import report_extras as X
    c, r, _, _ = charts
    ctx = Ctx(c, r, REFERENCE_ASKED_AT)
    # Bhinnashtakavarga totals are fixed by the classical rules for every chart
    bav = r["ashtakavarga"]["bav_by_sign"]
    assert {g: sum(v) for g, v in bav.items()} == {"SUN": 48, "MOON": 49, "MARS": 39, "MERCURY": 54,
                                                     "JUPITER": 56, "VENUS": 52, "SATURN": 39}
    # Yogini dasha: periods tile time with the 1..8-year lengths in fixed order
    periods = X.yogini_periods(ctx, years=60)
    order = [name for name, _, _ in X.YOGINI]
    for a, b in zip(periods, periods[1:]):
        assert a["end"] == b["start"]
        assert order.index(b["name"]) == (order.index(a["name"]) + 1) % 8
    # Varshaphal: the Sun returns to its natal sidereal longitude, near the birthday
    when = X.solar_return(ctx, 2026)
    lon = float(c.eph.sidereal_longitude_series([when], "SUN")[0])
    assert abs((lon - c.lon["SUN"] + 180) % 360 - 180) < 0.001
    assert abs((when - when.replace(month=1, day=1, hour=6, minute=30)).days) <= 2
    annual = X.annual_chart(ctx, 2026)
    assert annual["muntha"] == (c.lagna_sign + 36) % 12
