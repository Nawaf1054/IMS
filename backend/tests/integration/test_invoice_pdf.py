"""INV-8: the printable invoice as HTML (always tested) and as a PDF (where WeasyPrint can load)."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.invoices import pdf, service
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import BusinessSettingsUpdate
from app.modules.users.models import Profile
from tests.factories import create_invoice, create_product


def _weasyprint_loads() -> bool:
    try:
        import weasyprint  # noqa: F401
    except OSError:  # Pango and friends aren't installed (e.g. on Windows)
        return False
    return True


WEASYPRINT = _weasyprint_loads()
PRINTED_AT = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)


@pytest.fixture
def business(db: Session) -> None:
    settings_service.update(
        db,
        BusinessSettingsUpdate(
            business_name="Al Noor Building Supplies",
            business_address="Prince Sultan Road\nRiyadh 12211",
            currency="SAR",
            tax_rate="0.15",
        ),
    )


def html_for(db: Session, invoice_id: int) -> str:
    return pdf.render_html(
        service.get_detail(db, invoice_id), settings_service.read(db), printed_at=PRINTED_AT, tz=UTC
    )


def test_html_shows_the_invoice(db: Session, staff: Profile, business: None) -> None:
    drill = create_product(db, name="Cordless drill 18V", sku="TL-PWR-D18", sell_price="1449.50", quantity=5)
    invoice = create_invoice(db, staff, [(drill, 2)], customer_name="Saad Contracting")
    html = html_for(db, invoice.id)

    for text in (
        "Al Noor Building Supplies",
        "Prince Sultan Road\nRiyadh 12211",
        "TAX INVOICE",
        invoice.invoice_number,
        "Saad Contracting",
        "Staff",
        "Cordless drill 18V",
        "TL-PWR-D18",
        "SAR 1,449.50",
        "SAR 2,899.00",  # line total and subtotal
        "VAT 15%",
        "SAR 434.85",
        "SAR 3,333.85",
        "All amounts in SAR. VAT charged at 15%.",
        "Printed 20 October 2026, 09:00",
    ):
        assert text in html, text
    assert "Discount" not in html
    assert "CANCELLED" not in html


def test_html_discount_walk_in_and_cancelled(
    db: Session, admin: Profile, staff: Profile, business: None
) -> None:
    product = create_product(db, sell_price="100", quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)], discount="10")
    service.cancel_invoice(db, admin, invoice.id)
    html = html_for(db, invoice.id)
    assert "Walk-in customer" in html
    assert "− SAR 10.00" in html
    assert "Taxable amount" in html
    assert "CANCELLED" in html


def test_html_escapes_user_text(db: Session, staff: Profile, business: None) -> None:
    product = create_product(db, name='Pipe <b>4"</b>', quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)], customer_name="<script>alert(1)</script>")
    html = html_for(db, invoice.id)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert "<b>" not in html


@pytest.mark.skipif(not WEASYPRINT, reason="WeasyPrint's system libraries (Pango) aren't installed")
def test_pdf_download(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str], business: None
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)])
    response = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=staff_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == f'attachment; filename="{invoice.invoice_number}.pdf"'
    assert response.content.startswith(b"%PDF")


@pytest.mark.skipif(WEASYPRINT, reason="only meaningful where WeasyPrint can't load")
def test_pdf_unavailable_is_reported(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)])
    response = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=staff_headers)
    assert response.status_code == 503
    assert response.json() == {
        "detail": "PDF download isn’t available on this server. Use Print instead.",
        "code": "PDF_UNAVAILABLE",
    }
