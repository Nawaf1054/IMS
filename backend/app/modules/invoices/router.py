"""Invoices: everyone can create, view and print them; only admins can cancel (PRD §4, §8)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.common.pagination import Page, PageParams, page_params
from app.modules.invoices import service
from app.modules.invoices.schemas import (
    DateRange,
    InvoiceCreate,
    InvoiceFilters,
    InvoiceOut,
    InvoiceStats,
    InvoiceSummaryOut,
    NextNumberOut,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=Page[InvoiceSummaryOut])
def list_invoices(
    db: DbSession,
    _: CurrentUser,
    filters: Annotated[InvoiceFilters, Query()],
    params: PageParams = Depends(page_params),
) -> Page[InvoiceSummaryOut]:
    """Invoices matching the search, status and date filters, newest first (INV-7)."""
    return service.list_invoices(db, filters, params)


# Fixed paths come before /{invoice_id}.
@router.get("/summary", response_model=InvoiceStats)
def invoice_stats(db: DbSession, _: CurrentUser, dates: Annotated[DateRange, Query()]) -> InvoiceStats:
    """Totals for the invoices list header over the chosen dates."""
    return service.stats(db, dates)


@router.get("/next-number", response_model=NextNumberOut)
def next_number(db: DbSession, _: CurrentUser) -> NextNumberOut:
    """Preview of the number the next invoice will get (not reserved)."""
    return NextNumberOut(invoice_number=service.next_number(db))


@router.post("", response_model=InvoiceOut)
def create_invoice(data: InvoiceCreate, db: DbSession, user: CurrentUser) -> InvoiceOut:
    """Saves an invoice and reduces stock in one transaction (INV-4)."""
    return service.create_invoice(db, user, data)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: DbSession, _: CurrentUser) -> InvoiceOut:
    """One invoice with its lines and stock movements."""
    return service.get_detail(db, invoice_id)


@router.post("/{invoice_id}/cancel", response_model=InvoiceOut)
def cancel_invoice(invoice_id: int, db: DbSession, admin: AdminUser) -> InvoiceOut:
    """Admin: cancels an invoice and puts its stock back (INV-6)."""
    return service.cancel_invoice(db, admin, invoice_id)


@router.get("/{invoice_id}/pdf", response_class=Response)
def invoice_pdf(invoice_id: int, db: DbSession, _: CurrentUser) -> Response:
    """The invoice as a PDF download (INV-8)."""
    filename, content = service.render_pdf(db, invoice_id)
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
