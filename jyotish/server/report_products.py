"""Standalone PDF reports with server-selected launch and standard pricing."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

OFFER_END = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
OFFER_END_ISO = OFFER_END.isoformat()

_CATALOGUE = [
    {"key": "life_1", "name": "Premium Life Kundali — 1 Year", "kind": "life", "years": 1, "reference": 299,
     "features": ["Year-by-year outlook across six life areas", "Important charts and calculation tables", "Lagna, Rashi and birth Nakshatra traits", "Planetary positions, dashas, yogas and doshas", "Traditional reflection and remedy suggestions"]},
    {"key": "life_5", "name": "Premium Life Kundali — 5 Years", "kind": "life", "years": 5, "reference": 399,
     "features": ["Year-by-year outlook across six life areas", "Important charts and calculation tables", "Lagna, Rashi and birth Nakshatra traits", "Planetary positions, dashas, yogas and doshas", "Traditional reflection and remedy suggestions"]},
    {"key": "life_10", "name": "Premium Life Kundali — 10 Years", "kind": "life", "years": 10, "reference": 499,
     "features": ["Year-by-year outlook across six life areas", "Important charts and calculation tables", "Lagna, Rashi and birth Nakshatra traits", "Planetary positions, dashas, yogas and doshas", "Traditional reflection and remedy suggestions"]},
    {"key": "life_20", "name": "Premium Life Kundali — 20 Years", "kind": "life", "years": 20, "reference": 699,
     "features": ["Year-by-year outlook across six life areas", "Important charts and calculation tables", "Lagna, Rashi and birth Nakshatra traits", "Planetary positions, dashas, yogas and doshas", "Traditional reflection and remedy suggestions"]},
    {"key": "sade_sati", "name": "Detailed Sade Sati Report", "kind": "sade_sati", "reference": 125,
     "features": ["Current Sade Sati status", "Calculated lifetime Sade Sati periods", "Phase-by-phase chart-linked analysis", "Saturn house from natal Moon", "Traditional reflection and remedy suggestions"]},
    {"key": "dosha", "name": "Detailed Dosha Report", "kind": "dosha", "reference": 99,
     "features": ["Manglik Dosha with severity and cancellation review", "Transparent Pitru Dosha screening", "Kaal Sarp detection and spread", "Evidence for every present or absent result", "Traditional reflection and remedy suggestions"]},
    {"key": "match", "name": "Premium Match Making Report", "kind": "match", "reference": 249,
     "features": ["Detailed Ashtakoota factor analysis", "Manglik and Kaal Sarp checks for both charts", "Transparent dosha-cancellation review", "D9 and relationship indicators", "Practical compatibility conversations"]},
    {"key": "marriage", "name": "Favourable Marriage Timing", "kind": "marriage", "reference": 189,
     "features": ["Birth details, Lagna and Moon chart data", "Relationship conditions from the calculated chart", "Ranked marriage activation windows", "Candidate Shubh Vivah dates", "Tithi and Nakshatra for each candidate"]},
    {"key": "rudraksha", "name": "Rudraksha Suggestion", "kind": "rudraksha", "reference": 49,
     "features": ["Birth details, Lagna and Moon chart data", "Planet and ascendant assessment", "Transparent planet-selection rationale", "Traditional Rudraksha association", "Non-guaranteeing use guidance"]},
    {"key": "gemstone", "name": "Gemstone Suggestion", "kind": "gemstone", "reference": 75,
     "features": ["Birth details, Lagna and Moon chart data", "Planet and ascendant assessment", "Transparent planet-selection rationale", "Traditional gemstone association", "Suitability cautions and non-guaranteeing guidance"]},
]
PRODUCTS = {item["key"]: item for item in _CATALOGUE}


def _gbp(reference: int) -> Decimal:
    raw = Decimal(reference) / 2 * Decimal("0.012")
    return max(Decimal("0.50"), (raw * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2)


def price(key: str, country: str, at: datetime | None = None) -> tuple[str, str]:
    item = PRODUCTS[key]
    promotional = (at or datetime.now(timezone.utc)) <= OFFER_END
    reference = Decimal(item["reference"])
    if country == "IN":
        value = reference / 2 if promotional else reference
        return "INR", f"{value:.2f}"
    value = _gbp(item["reference"]) if promotional else _gbp(item["reference"]) * 2
    return "GBP", f"{value:.2f}"


def catalogue(country: str, at: datetime | None = None) -> list[dict]:
    at = at or datetime.now(timezone.utc)
    out = []
    for source in _CATALOGUE:
        item = dict(source)
        currency, amount = price(item["key"], country, at)
        half = Decimal(item["reference"]) / 2
        item.update({"currency": currency, "amount": amount,
                     "display": ("₹" if currency == "INR" else "£") + amount,
                     "reference_price": f"₹{item['reference']}", "half_price_inr": f"₹{half:.2f}",
                     "offer": at <= OFFER_END, "offer_ends_at": OFFER_END_ISO,
                     "regional_note": None if currency == "INR" else "GBP regional checkout price; the verified reference price is INR-only."})
        out.append(item)
    return out
