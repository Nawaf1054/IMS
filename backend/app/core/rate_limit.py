"""Per-user rolling-window rate limiting (AI-8).

The rules live here; storage doesn't. A caller passes the timestamps of the user's requests inside
the window (the AI module reads them from `ai_requests`) and gets the quota back:

- the window is rolling: a request stops counting exactly `window` after it was made;
- `resets_at` is when the oldest counted request expires, i.e. when one more request frees up.

Usage pattern: `check()` before doing the work, store the request only once it succeeded, then
`quota()` again for the response. Two requests from the same user that start at the same moment can
both pass the check when one request is left; for a per-hour AI allowance that's acceptable.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.exceptions import RateLimited

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class Quota:
    """How many requests the user may still make, and when the next one frees up."""

    limit: int
    remaining: int
    resets_at: datetime


def window_start(now: datetime, window: timedelta = HOUR) -> datetime:
    """The earliest timestamp that still counts against the limit at `now`."""
    return now - window


def quota(recent: Sequence[datetime], *, limit: int, now: datetime, window: timedelta = HOUR) -> Quota:
    """The quota given the user's request times. Times outside the window are ignored.

    With nothing in the window, `resets_at` is a full window from now (nothing is pending).
    """
    since = window_start(now, window)
    counted = sorted(t for t in recent if t > since)
    oldest = counted[0] if counted else now
    return Quota(limit=limit, remaining=max(0, limit - len(counted)), resets_at=oldest + window)


def check(current: Quota, *, what: str = "requests") -> None:
    """Raises 429 RATE_LIMITED when nothing is left in the window."""
    if current.remaining <= 0:
        raise RateLimited(f"You’ve used all {current.limit} {what} this hour.")
