"""Logging setup: one plain line per record on stdout."""

import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Sends all log records to stdout as single lines at the given level."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
