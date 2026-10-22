"""Read-only tools the model may call (AI-2), dispatched to the existing services. No SQL and no
writes here (AI-3): every tool calls a dashboard or products service function that only reads.

Each tool has
- a JSON schema the model sees (written by hand, so it stays within what every provider accepts),
- a Pydantic model that validates the model's arguments (dates, limit ≤ 20, the dashboard's
  five-year range cap) before any service runs, and
- a runner that returns a `ToolOutput`: the data sent back to the model, a human label for the
  "Data used" chips (ChatSource) and display rows. The chat answer's rows and sources are built
  from these outputs, never from the model's text.

Problems with a call (unknown tool, bad arguments, a range the dashboard rejects) raise `ToolError`;
the service hands its message back to the model so it can correct itself.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy.orm import Session

from app.common.pagination import PageParams
from app.core.exceptions import AppError
from app.modules.ai import formatting as fmt
from app.modules.ai.client import ToolCall, ToolSpec
from app.modules.dashboard import service as dashboard_service
from app.modules.dashboard.schemas import DashboardRange, TopProductsQuery
from app.modules.products import service as products_service
from app.modules.products.schemas import ProductFilters

# Most rows any tool returns (AI-2: keeps answers short and the model's input small).
MAX_LIMIT = 20
MAX_QUERY_LENGTH = 100


class ToolError(Exception):
    """A tool call that can't run. The message is written for the model to read and fix."""


@dataclass(frozen=True)
class Row:
    """One display row under the answer: a label and its figure."""

    label: str
    value: str


@dataclass(frozen=True)
class ToolOutput:
    """What a tool produced: `data` for the model, `label` and `rows` for the UI."""

    tool: str
    label: str
    data: dict[str, Any]
    rows: list[Row] = field(default_factory=list)


# ── Argument models ─────────────────────────────────────────────────────────


class _Args(BaseModel):
    """Base for tool arguments: unknown arguments are an error, not silently ignored."""

    model_config = ConfigDict(extra="forbid")


class DateRangeArgs(_Args):
    """An inclusive range of business-local days, within the dashboard's cap."""

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _valid_range(self) -> "DateRangeArgs":
        """start_date must not be after end_date, and the range must fit the dashboard's limit."""
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date.")
        if (self.end_date - self.start_date).days + 1 > dashboard_service.MAX_RANGE_DAYS:
            raise ValueError("The date range must be five years or less.")
        return self

    def as_range(self) -> DashboardRange:
        """The dashboard service's range type."""
        return DashboardRange(start_date=self.start_date, end_date=self.end_date)


class TopProductsArgs(DateRangeArgs):
    """get_top_products arguments."""

    limit: int = Field(5, ge=1, le=MAX_LIMIT)
    order: Literal["desc", "asc"] = "desc"
    order_by: Literal["quantity", "revenue"] = "quantity"


class LowStockArgs(_Args):
    """get_low_stock_products arguments."""

    limit: int = Field(MAX_LIMIT, ge=1, le=MAX_LIMIT)


class SearchArgs(_Args):
    """search_products arguments."""

    query: str = Field(min_length=1, max_length=MAX_QUERY_LENGTH)
    limit: int = Field(10, ge=1, le=MAX_LIMIT)
    include_inactive: bool = False

    @field_validator("query")
    @classmethod
    def _strip(cls, value: str) -> str:
        """Surrounding spaces don't count; an all-space query is empty."""
        value = value.strip()
        if not value:
            raise ValueError("query must not be empty.")
        return value


# ── JSON schemas the model sees ─────────────────────────────────────────────

_DATE = {"type": "string", "description": "Inclusive day, YYYY-MM-DD, in the business's time zone."}
_RANGE = {"start_date": _DATE, "end_date": _DATE}
_LIMIT = {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT}


def _schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    """An object schema."""
    return {"type": "object", "properties": properties, "required": required}


# ── Runners ─────────────────────────────────────────────────────────────────


def _amount(value: Decimal) -> str:
    """Money for the model: a plain decimal string, never a float."""
    return f"{value:.2f}"


def sales_summary(db: Session, args: DateRangeArgs, currency: str) -> ToolOutput:
    """get_sales_summary: revenue, invoices and average invoice, with the previous period."""
    s = dashboard_service.sales_summary(db, args.as_range())
    average = s.revenue / s.invoice_count if s.invoice_count else Decimal("0")
    change = fmt.percent_change(s.revenue, s.previous_revenue)
    previous_label = fmt.date_range(s.previous_start, s.previous_end)
    rows = [
        Row("Revenue", fmt.money(s.revenue, currency)),
        Row("Invoices", fmt.number(s.invoice_count)),
        Row("Average invoice", fmt.money(average, currency)),
        Row(f"Previous period ({previous_label})", fmt.money(s.previous_revenue, currency)),
    ]
    if change is not None:
        rows.append(Row("Change", fmt.signed_percent(change)))
    return ToolOutput(
        tool="get_sales_summary",
        label=f"Sales summary · {fmt.date_range(s.start, s.end)}",
        data={
            "start_date": s.start.isoformat(),
            "end_date": s.end.isoformat(),
            "currency": currency,
            "revenue": _amount(s.revenue),
            "invoice_count": s.invoice_count,
            "average_invoice": _amount(average),
            "previous_period": {
                "start_date": s.previous_start.isoformat(),
                "end_date": s.previous_end.isoformat(),
                "revenue": _amount(s.previous_revenue),
                "invoice_count": s.previous_invoice_count,
            },
            "revenue_change_percent": str(change) if change is not None else None,
            "note": "Revenue is the total of completed invoices (after discount, with tax).",
        },
        rows=rows,
    )


def top_products(db: Session, args: TopProductsArgs, currency: str) -> ToolOutput:
    """get_top_products: best or worst sellers in the range."""
    query = TopProductsQuery(
        start_date=args.start_date,
        end_date=args.end_date,
        limit=args.limit,
        order=args.order,
        order_by=args.order_by,
    )
    products = dashboard_service.top_products(db, query)
    suffix = f", lowest {args.limit}" if args.order == "asc" else ""
    return ToolOutput(
        tool="get_top_products",
        label=f"Top products · {fmt.date_range(args.start_date, args.end_date)}{suffix}",
        data={
            "start_date": args.start_date.isoformat(),
            "end_date": args.end_date.isoformat(),
            "currency": currency,
            "ordered_by": args.order_by,
            "order": args.order,
            "products": [
                {"name": p.name, "sku": p.sku, "units_sold": p.quantity, "revenue": _amount(p.revenue)}
                for p in products
            ],
            "note": "Only products with at least one completed sale in the range are listed. Revenue is "
            "the sum of line totals (before invoice discount and tax).",
        },
        rows=[
            Row(p.name, f"{fmt.plural(p.quantity, 'unit')} · {fmt.money(p.revenue, currency)}")
            for p in products
        ],
    )


def low_stock_products(db: Session, args: LowStockArgs, currency: str) -> ToolOutput:
    """get_low_stock_products: active products at or below their minimum, lowest stock first."""
    page = products_service.list_products(
        db,
        ProductFilters(low_stock=True, sort="quantity", order="asc"),
        PageParams(page=1, page_size=args.limit),
    )
    return ToolOutput(
        tool="get_low_stock_products",
        label="Low-stock products · now",
        data={
            "total_low_stock": page.total,
            "products": [
                {
                    "name": p.name,
                    "sku": p.sku,
                    "category": p.category_path,
                    "quantity": p.quantity,
                    "min_quantity": p.min_quantity,
                    "out_of_stock": p.quantity == 0,
                }
                for p in page.items
            ],
            "note": "Active products whose quantity is at or below their minimum quantity.",
        },
        rows=[Row(p.name, f"{p.quantity} / min {p.min_quantity}") for p in page.items],
    )


def category_revenue(db: Session, args: DateRangeArgs, currency: str) -> ToolOutput:
    """get_category_revenue: revenue per top-level category with its share."""
    categories = dashboard_service.category_revenue(db, args.as_range())
    return ToolOutput(
        tool="get_category_revenue",
        label=f"Category revenue · {fmt.date_range(args.start_date, args.end_date)}",
        data={
            "start_date": args.start_date.isoformat(),
            "end_date": args.end_date.isoformat(),
            "currency": currency,
            "categories": [
                {"name": c.name, "revenue": _amount(c.revenue), "share_percent": fmt.share_percent(c.share)}
                for c in categories
            ],
            "note": "Subcategories are rolled into their parent. Revenue is the sum of line totals.",
        },
        rows=[
            Row(c.name, f"{fmt.money(c.revenue, currency)} · {fmt.share_percent(c.share)}")
            for c in categories
        ],
    )


def search_products(db: Session, args: SearchArgs, currency: str) -> ToolOutput:
    """search_products: products whose name or SKU contains the query."""
    page = products_service.list_products(
        db,
        ProductFilters(search=args.query, include_inactive=args.include_inactive),
        PageParams(page=1, page_size=args.limit),
    )
    return ToolOutput(
        tool="search_products",
        label=f"Product search · “{args.query}”",
        data={
            "query": args.query,
            "total_matches": page.total,
            "currency": currency,
            "products": [
                {
                    "name": p.name,
                    "sku": p.sku,
                    "category": p.category_path,
                    "sell_price": _amount(p.sell_price),
                    "cost_price": _amount(p.cost_price),
                    "quantity": p.quantity,
                    "min_quantity": p.min_quantity,
                    "is_low_stock": p.is_low_stock,
                    "is_active": p.is_active,
                }
                for p in page.items
            ],
        },
        rows=[
            Row(p.name, f"{p.sku} · {fmt.number(p.quantity)} in stock · {fmt.money(p.sell_price, currency)}")
            for p in page.items
        ],
    )


# ── Registry ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Tool:
    """A tool's schema for the model, its argument model and its runner."""

    spec: ToolSpec
    args: type[_Args]
    run: Callable[[Session, Any, str], ToolOutput]


_TOOL_LIST = [
    Tool(
        ToolSpec(
            name="get_sales_summary",
            description="Total revenue, number of completed invoices and average invoice for a date range, "
            "plus the same figures for the previous period of equal length and the percent change.",
            parameters=_schema(_RANGE, ["start_date", "end_date"]),
        ),
        DateRangeArgs,
        sales_summary,
    ),
    Tool(
        ToolSpec(
            name="get_top_products",
            description="Best-selling (order=desc) or least-selling (order=asc) products in a date range, "
            "ranked by units sold or revenue. Only products with at least one sale are included.",
            parameters=_schema(
                {
                    **_RANGE,
                    "limit": {**_LIMIT, "description": "How many products to return (default 5)."},
                    "order": {"type": "string", "enum": ["desc", "asc"], "description": "desc = most sold."},
                    "order_by": {"type": "string", "enum": ["quantity", "revenue"]},
                },
                ["start_date", "end_date"],
            ),
        ),
        TopProductsArgs,
        top_products,
    ),
    Tool(
        ToolSpec(
            name="get_low_stock_products",
            description="Active products at or below their minimum quantity right now, lowest stock first, "
            "with the total number of low-stock products.",
            parameters=_schema(
                {"limit": {**_LIMIT, "description": "How many products to list (default 20)."}}, []
            ),
        ),
        LowStockArgs,
        low_stock_products,
    ),
    Tool(
        ToolSpec(
            name="get_category_revenue",
            description="Revenue per top-level category in a date range, with each category's share.",
            parameters=_schema(_RANGE, ["start_date", "end_date"]),
        ),
        DateRangeArgs,
        category_revenue,
    ),
    Tool(
        ToolSpec(
            name="search_products",
            description="Find products by part of their name or SKU. Returns price, cost, quantity on hand, "
            "minimum quantity and category.",
            parameters=_schema(
                {
                    "query": {"type": "string", "description": "Text to look for in the name or SKU."},
                    "limit": {**_LIMIT, "description": "How many products to return (default 10)."},
                    "include_inactive": {
                        "type": "boolean",
                        "description": "Also match deactivated products.",
                    },
                },
                ["query"],
            ),
        ),
        SearchArgs,
        search_products,
    ),
]

TOOLS: dict[str, Tool] = {tool.spec.name: tool for tool in _TOOL_LIST}
TOOL_SPECS: list[ToolSpec] = [tool.spec for tool in _TOOL_LIST]


def _describe(error: ValidationError) -> str:
    """Pydantic's errors as one short sentence for the model."""
    parts = []
    for item in error.errors():
        where = ".".join(str(part) for part in item.get("loc", ())) or "arguments"
        message = str(item.get("ctx", {}).get("error") or item.get("msg", "invalid"))
        parts.append(f"{where}: {message}")
    return "Invalid arguments. " + "; ".join(parts)


def run(db: Session, call: ToolCall, currency: str) -> ToolOutput:
    """Validates the call's arguments and runs the tool. Raises ToolError for anything the model
    should fix (unknown tool, bad arguments, a range a service refuses)."""
    tool = TOOLS.get(call.name)
    if tool is None:
        raise ToolError(f"Unknown tool “{call.name}”. Available tools: {', '.join(TOOLS)}.")
    try:
        args = tool.args.model_validate(call.arguments)
    except ValidationError as exc:
        raise ToolError(_describe(exc)) from exc
    try:
        return tool.run(db, args, currency)
    except AppError as exc:  # e.g. ValidationFailed from the dashboard's own checks
        raise ToolError(exc.detail) from exc
