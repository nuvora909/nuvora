"""Shodashavarga (16 divisional charts), Parashari definitions. Sign indices 0=Aries."""
from __future__ import annotations

import math


def _parts(d: float, n: int) -> int:
    # Guard float noise at the top edge of a sign (e.g. 29.9999999999 -> part n-1, never n).
    return min(int(math.floor(d * n / 30.0)), n - 1)


def varga_sign(lon: float, n: int) -> int:
    lon = lon % 360.0
    sign = int(lon // 30.0)
    d = lon - sign * 30.0
    odd = sign % 2 == 0          # Aries, Gemini, ... are odd (1st, 3rd, ...) signs
    mod = sign % 3               # 0 movable, 1 fixed, 2 dual
    if n == 1:
        return sign
    if n == 2:                   # Hora: odd 0-15 Sun(Leo) / 15-30 Moon(Cancer); even reversed
        first = d < 15.0
        return (4 if first else 3) if odd else (3 if first else 4)
    if n == 3:                   # Drekkana: same, 5th, 9th
        return (sign + 4 * _parts(d, 3)) % 12
    if n == 4:                   # Chaturthamsha: same, 4th, 7th, 10th
        return (sign + 3 * _parts(d, 4)) % 12
    if n == 7:                   # Saptamsha: odd from same, even from 7th
        return ((sign if odd else sign + 6) + _parts(d, 7)) % 12
    if n == 9:                   # Navamsha: continuous from Aries
        return int(math.floor(lon * 9.0 / 30.0)) % 12
    if n == 10:                  # Dashamsha: odd from same, even from 9th
        return ((sign if odd else sign + 8) + _parts(d, 10)) % 12
    if n == 12:                  # Dwadashamsha: from same
        return (sign + _parts(d, 12)) % 12
    if n == 16:                  # Shodashamsha: movable Aries, fixed Leo, dual Sagittarius
        return ((0, 4, 8)[mod] + _parts(d, 16)) % 12
    if n == 20:                  # Vimshamsha: movable Aries, fixed Sagittarius, dual Leo
        return ((0, 8, 4)[mod] + _parts(d, 20)) % 12
    if n == 24:                  # Chaturvimshamsha: odd Leo, even Cancer
        return ((4 if odd else 3) + _parts(d, 24)) % 12
    if n == 27:                  # Bhamsha: fire Aries, earth Cancer, air Libra, water Capricorn
        return int(math.floor(lon * 27.0 / 30.0)) % 12
    if n == 30:                  # Trimshamsha (unequal)
        if odd:
            for limit, s in ((5, 0), (10, 10), (18, 8), (25, 2), (30, 6)):
                if d < limit:
                    return s
        else:
            for limit, s in ((5, 1), (12, 5), (20, 11), (25, 9), (30, 7)):
                if d < limit:
                    return s
        return 6 if odd else 7
    if n == 40:                  # Khavedamsha: odd Aries, even Libra
        return ((0 if odd else 6) + _parts(d, 40)) % 12
    if n == 45:                  # Akshavedamsha: movable Aries, fixed Leo, dual Sagittarius
        return ((0, 4, 8)[mod] + _parts(d, 45)) % 12
    if n == 60:                  # Shashtiamsha: from same
        return (sign + _parts(d, 60)) % 12
    raise ValueError(f"Unsupported varga D{n}")


def varga_degree(lon: float, n: int) -> float:
    """Degree within the varga sign (standard 'expanded' convention: n * degree-in-sign mod 30)."""
    d = (lon % 30.0)
    return (d * n) % 30.0
