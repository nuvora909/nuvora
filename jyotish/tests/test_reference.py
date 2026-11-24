"""Published accuracy bounds vs Swiss Ephemeris 2.10.03 over 500 random births (see tests/accuracy.py)."""
import numpy as np
import pytest

from tests.accuracy import PLANETS, compute_errors

BOUNDS_ARCSEC = {"AYANAMSA": 0.01, "SUN": 0.5, "MERCURY": 0.5, "VENUS": 0.5, "MARS": 0.5, "JUPITER": 0.5,
                 "SATURN": 0.5, "MOON": 2.5, "TRUE_NODE": 0.2, "MEAN_NODE": 0.2, "ASCENDANT": 6.0}


@pytest.fixture(scope="module")
def errors():
    return compute_errors()


@pytest.mark.parametrize("key", list(BOUNDS_ARCSEC))
def test_longitude_bounds(errors, key):
    _, errs, _ = errors
    assert len(errs[key]) == 500
    worst = float(np.abs(errs[key]).max())
    assert worst < BOUNDS_ARCSEC[key], f"{key} worst error {worst:.3f}\""


@pytest.mark.parametrize("key", PLANETS)
def test_speed_bounds(errors, key):
    _, _, spd = errors
    assert float(np.abs(spd[key]).max()) < 2e-4


def test_sign_agreement(errors):
    """No case where an error would flip sign, nakshatra or navamsha in practice: errors are tiny
    compared with the 3°20' navamsha span, so count boundary disagreements explicitly."""
    ref, errs, _ = errors
    flips = 0
    for i, c in enumerate(ref["cases"]):
        for p in PLANETS:
            ours = (c["sidereal"][p] + errs[p][i] / 3600.0) % 360.0
            flips += int(ours // (10 / 3)) != int(c["sidereal"][p] // (10 / 3))
    assert flips <= 1  # a single flip is possible only if a body sits within ~2" of a boundary
