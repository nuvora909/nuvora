import numpy as np
import pytest

from vedic.constants import VARGAS
from vedic.vargas import varga_degree, varga_sign

S = {n: i for i, n in enumerate(["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"])}


@pytest.mark.parametrize("lon,n,expect", [
    (0.0, 9, "Ar"), (3.34, 9, "Ta"), (70.0, 9, "Cp"), (40.0, 9, "Ar"), (39.99, 9, "Pi"), (30.0, 9, "Cp"), (60.0, 9, "Li"), (90.0, 9, "Cn"),
    (30.0, 10, "Cp"), (0.0, 10, "Ar"), (29.99, 10, "Cp"),
    (4.9, 30, "Ar"), (5.1, 30, "Aq"), (12, 30, "Sg"), (20, 30, "Ge"), (27, 30, "Li"),
    (34, 30, "Ta"), (36, 30, "Vi"), (45, 30, "Pi"), (52, 30, "Cp"), (58, 30, "Sc"),
    (10, 2, "Le"), (20, 2, "Cn"), (40, 2, "Cn"), (50, 2, "Le"),
    (15, 3, "Le"), (25, 3, "Sg"), (5, 3, "Ar"),
    (0.4, 60, "Ar"), (29.9, 60, "Pi"), (29.9, 12, "Pi"), (30.0, 7, "Sc"),
    (0.0, 16, "Ar"), (30.0, 16, "Le"), (60.0, 16, "Sg"),
    (30.0, 20, "Sg"), (60.0, 20, "Le"), (0.0, 24, "Le"), (30.0, 24, "Cn"),
    (0.0, 40, "Ar"), (30.0, 40, "Li"), (30.0, 45, "Le"), (90.0, 4, "Cn"), (97.6, 4, "Li"),
])
def test_known_values(lon, n, expect):
    assert varga_sign(lon, n) == S[expect]


def test_navamsha_continuous_equals_classical():
    """Continuous D9 must equal the classical rule: movable from same, fixed from 9th, dual from 5th."""
    for lon in np.arange(0.013, 360, 0.07):   # offset grid: exact boundaries tested below
        sign, d = int(lon // 30), lon % 30
        start = (sign, sign + 8, sign + 4)[sign % 3] % 12
        assert varga_sign(lon, 9) == (start + int(d // (10 / 3))) % 12


def test_range_and_edges():
    for n in VARGAS:
        for lon in list(np.arange(0, 360, 0.25)) + [29.9999999999, 359.9999999999, 360.0]:
            assert 0 <= varga_sign(lon, n) <= 11
            assert 0 <= varga_degree(lon, n) < 30
    assert varga_sign(29.9999999999, 9) == S["Sg"]
