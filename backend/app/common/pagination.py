"""Pagination params (default 20, max 100) and the Page[T] response envelope."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class PageParams:
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(page: int = Query(1), page_size: int = Query(DEFAULT_PAGE_SIZE)) -> PageParams:
    """Out-of-range values are clamped rather than rejected, like the frontend's mock API."""
    return PageParams(page=max(1, page), page_size=min(MAX_PAGE_SIZE, max(1, page_size)))


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def paginate[T](
    session: Session, stmt: Select[Any], params: PageParams, to_item: Callable[[Any], T]
) -> Page[T]:
    """Runs `stmt` for one page plus a matching COUNT(*)."""
    total = session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = session.scalars(stmt.limit(params.page_size).offset(params.offset)).all()
    return Page[T](
        items=[to_item(row) for row in rows], total=total, page=params.page, page_size=params.page_size
    )
