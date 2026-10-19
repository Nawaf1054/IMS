"""Business-day bounds for date filters, and the time zone setting."""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.common.time import local_day_bounds
from app.core.config import Settings


def test_bounds_cover_whole_local_days() -> None:
    since, until = local_day_bounds(date(2026, 10, 19), date(2026, 10, 20), ZoneInfo("Asia/Riyadh"))
    assert since == datetime(2026, 10, 18, 21, 0, tzinfo=UTC)
    assert until == datetime(2026, 10, 20, 21, 0, tzinfo=UTC)


def test_open_ended_bounds() -> None:
    tz = ZoneInfo("Asia/Riyadh")
    assert local_day_bounds(None, None, tz) == (None, None)
    assert local_day_bounds(date(2026, 1, 1), None, tz)[1] is None
    assert local_day_bounds(None, date(2026, 1, 1), tz)[0] is None


def test_bounds_follow_daylight_saving() -> None:
    # Berlin moves from UTC+2 to UTC+1 on 2026-10-25, so that day lasts 25 hours.
    since, until = local_day_bounds(date(2026, 10, 25), date(2026, 10, 25), ZoneInfo("Europe/Berlin"))
    assert since == datetime(2026, 10, 24, 22, 0, tzinfo=UTC)
    assert until == datetime(2026, 10, 25, 23, 0, tzinfo=UTC)


def test_unknown_time_zone_is_rejected() -> None:
    with pytest.raises(ValidationError, match="Unknown time zone"):
        Settings(business_timezone="Mars/Olympus_Mons")
