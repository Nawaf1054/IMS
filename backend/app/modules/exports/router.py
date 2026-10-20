"""Excel export endpoints (EXP-1 … EXP-5). Every signed-in user can export (PRD §8).

Each endpoint accepts the same query parameters as its list endpoint, so the file matches what's
on screen. Paging parameters are ignored: an export holds every matching row.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.modules.exports import service
from app.modules.exports.service import ExportFile
from app.modules.exports.xlsx import XLSX_MEDIA_TYPE
from app.modules.invoices.schemas import InvoiceFilters
from app.modules.products.schemas import ProductFilters
from app.modules.stock.schemas import MovementFilters

router = APIRouter(prefix="/exports", tags=["exports"])

# Lets OpenAPI show these endpoints as file downloads.
_XLSX_RESPONSE: dict[int | str, dict[str, Any]] = {
    200: {"content": {XLSX_MEDIA_TYPE: {}}, "description": "Excel workbook"}
}


def _download(export: ExportFile) -> Response:
    """Sends the workbook as an attachment with its file name."""
    return Response(
        export.content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{export.filename}"'},
    )


@router.get("/products", response_class=Response, responses=_XLSX_RESPONSE)
def export_products(db: DbSession, _: CurrentUser, filters: Annotated[ProductFilters, Query()]) -> Response:
    """EXP-1: the product list with the current search, category, low-stock and sort filters."""
    return _download(service.export_products(db, filters))


@router.get("/movements", response_class=Response, responses=_XLSX_RESPONSE)
def export_movements(db: DbSession, _: CurrentUser, filters: Annotated[MovementFilters, Query()]) -> Response:
    """EXP-2: stock movements for the chosen date range and type."""
    return _download(service.export_movements(db, filters))


@router.get("/invoices", response_class=Response, responses=_XLSX_RESPONSE)
def export_invoices(db: DbSession, _: CurrentUser, filters: Annotated[InvoiceFilters, Query()]) -> Response:
    """EXP-3: invoices for the chosen date range, search and status."""
    return _download(service.export_invoices(db, filters))
