"""KP: Placidus cusps agree with Swiss Ephemeris; sub lords follow Vimshottari proportions."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from vedic import BirthInput, Options  # noqa: E402
from vedic.chart import Chart  # noqa: E402
from vedic.kp import _lords_at, kp_chart, placidus_cusps  # noqa: E402

# Sidereal (Lahiri) Placidus cusps 1-12 from swisseph-wasm 2.10 houses_ex(..., 'P') — see reference/.
REFERENCE = {
    (1990, 1, 1, 12, 0, 28.6139, 77.209, "Asia/Kolkata"): [343.92264, 20.09517, 47.47094, 71.20153, 95.60879, 125.10639,
                                                           163.92264, 200.09517, 227.47094, 251.20153, 275.60879, 305.10639],
    (1985, 7, 4, 14, 15, 51.5074, -0.1278, "UTC"): [188.76336, 216.35962, 251.11342, 290.03650, 323.60254, 349.24566,
                                                    8.76336, 36.35962, 71.11342, 110.03650, 143.60254, 169.24566],
    (2001, 3, 9, 2, 0, -33.8688, 151.2093, "UTC"): [41.08698, 72.41596, 107.68581, 143.13080, 173.98465, 199.32535,
                                                    221.08698, 252.41596, 287.68581, 323.13080, 353.98465, 19.32535],
}


def _chart(key):
    y, m, d, h, mi, lat, lon, tz = key
    return Chart(BirthInput(year=y, month=m, day=d, hour=h, minute=mi, lat=lat, lon=lon, tz_name=tz), Options())


@pytest.mark.parametrize("key", list(REFERENCE))
def test_placidus_cusps_match_swiss_ephemeris(key):
    got = placidus_cusps(_chart(key))
    for g, e in zip(got, REFERENCE[key]):
        assert abs((g - e + 180) % 360 - 180) * 3600 < 15  # arc-seconds


def test_sub_lords_follow_vimshottari_proportions():
    assert _lords_at(0.0) == ("MARS", "KETU", "KETU", "KETU")          # 0° Aries: Ashwini, first sub
    assert _lords_at(13.3334)[1:3] == ("VENUS", "VENUS")              # start of Bharani
    ketu_sub = 360 / 27 * 7 / 120                                      # Ketu's 7-year share of Ashwini
    assert _lords_at(ketu_sub + 1e-6)[2] == "VENUS"
    assert _lords_at(ketu_sub - 1e-6)[2] == "KETU"


def test_kp_chart_is_complete():
    kp = kp_chart(_chart(next(iter(REFERENCE))))
    assert len(kp["cusps"]) == 12 and len(kp["planets"]) == 9
    assert set(kp["events"]) >= {"marriage", "career", "money"}
    assert all(1 <= p["house"] <= 12 for p in kp["planets"].values())
    assert all(set(s) == {"a", "b", "c", "d"} for s in kp["significators"].values())
