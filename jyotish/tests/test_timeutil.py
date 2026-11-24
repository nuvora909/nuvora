from datetime import timedelta

import pytest

from vedic.timeutil import resolve_birth_time


def test_india_war_time():
    r = resolve_birth_time(1943, 6, 1, 12, 0, tz_name="Asia/Kolkata")
    assert r.local.utcoffset() == timedelta(hours=6, minutes=30)
    assert any("Historical Indian offset" in w for w in r.warnings)


def test_india_modern():
    r = resolve_birth_time(1990, 1, 1, 12, 0, tz_name="Asia/Kolkata")
    assert r.utc.hour == 6 and r.utc.minute == 30 and not r.warnings


def test_nonexistent_dst_time():
    r = resolve_birth_time(2021, 3, 14, 2, 30, tz_name="America/New_York")
    assert any("did not exist" in w for w in r.warnings)


def test_ambiguous_dst_time():
    r = resolve_birth_time(2021, 11, 7, 1, 30, tz_name="America/New_York")
    assert any("occurred twice" in w for w in r.warnings)


def test_fixed_offset_warns():
    r = resolve_birth_time(1990, 1, 1, 12, 0, utc_offset_hours=5.5)
    assert r.source == "fixed" and r.warnings


def test_bad_zone():
    with pytest.raises(ValueError):
        resolve_birth_time(1990, 1, 1, 12, 0, tz_name="Mars/Olympus")
