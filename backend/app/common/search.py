"""Helpers for case-insensitive "contains" search with ILIKE."""

LIKE_ESCAPE = "\\"


def contains_pattern(text: str) -> str:
    """ILIKE pattern matching `text` anywhere, with % and _ taken literally (use escape=LIKE_ESCAPE)."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
