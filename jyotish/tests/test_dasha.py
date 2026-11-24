from datetime import datetime, timedelta, timezone

from vedic.constants import NAK_SPAN
from vedic.dasha import Vimshottari

B = datetime(2000, 1, 1, tzinfo=timezone.utc)


def test_cycle_is_120_years():
    v = Vimshottari(100.0, B)
    first9 = v.mahadashas[:9]
    span = (first9[-1].end - first9[0].start).total_seconds() / 86400
    assert abs(span - 120 * 365.25) < 1e-6


def test_nakshatra_start_gives_full_period():
    v = Vimshottari(0.0, B)                 # Ashwini start -> full Ketu 7 years
    assert v.birth_lord == "KETU" and abs(v.balance_years - 7) < 1e-9
    assert v.mahadashas[0].start == B
    v = Vimshottari(NAK_SPAN * 1.5, B)      # half through Bharani -> 10 of 20 Venus years left
    assert v.birth_lord == "VENUS" and abs(v.balance_years - 10) < 1e-9


def test_children_tile_parent_exactly():
    v = Vimshottari(123.456, B)
    for md in v.mahadashas[:9]:
        ch = v.children(md)
        assert ch[0].start == md.start and ch[-1].end == md.end
        assert all(a.end == b.start for a, b in zip(ch, ch[1:]))
        assert ch[0].lord == md.lord


def test_running_chain_is_nested():
    v = Vimshottari(200.0, B)
    at = B + timedelta(days=4000)
    chain = v.running(at, depth=5)
    assert len(chain) == 5
    for parent, child in zip(chain, chain[1:]):
        assert parent.start <= child.start and child.end <= parent.end
        assert child.lords[:-1] == parent.lords
        assert child.start <= at < child.end


def test_year_lengths():
    a = Vimshottari(50.0, B, "julian").mahadashas[1]
    s = Vimshottari(50.0, B, "savana").mahadashas[1]
    assert abs((a.end - a.start).days / ((s.end - s.start).days) - 365.25 / 360) < 1e-3
