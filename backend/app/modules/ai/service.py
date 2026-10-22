"""AI use cases: tool-calling chat (AI-1, AI-2), insights (AI-4) and product descriptions (AI-5),
behind the per-user hourly limit (AI-8).

Every request follows the same order: check the quota, do the work (database reads, then the model),
and only after it succeeded record the request and commit. A provider failure raises AiUnavailable
before anything is recorded, so it never uses up the user's quota (AI-7).
"""

import json
import logging
import re
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.common.pagination import PageParams
from app.common.time import utcnow
from app.core import rate_limit
from app.core.config import get_settings
from app.core.exceptions import AiUnavailable
from app.modules.ai import formatting as fmt
from app.modules.ai import prompts, repository, tools
from app.modules.ai.client import (
    AssistantMessage,
    LLMClient,
    Message,
    ToolCall,
    ToolResult,
    ToolResultsMessage,
    UserMessage,
)
from app.modules.ai.models import AiRequestKind
from app.modules.ai.schemas import (
    MAX_MESSAGE_LENGTH,
    AiQuota,
    AssistantMessageOut,
    ChatReply,
    ChatRequest,
    ChatRow,
    ChatSource,
    InsightFigure,
    InsightSection,
    InsightsReport,
    InsightsRequest,
    ProductDescriptionRequest,
    ProductDescriptionResult,
)
from app.modules.dashboard import service as dashboard_service
from app.modules.dashboard.schemas import DashboardRange, TopProductsQuery
from app.modules.products import service as products_service
from app.modules.products.schemas import ProductFilters
from app.modules.settings import service as settings_service
from app.modules.users.models import Profile

logger = logging.getLogger(__name__)

# Most model calls for one chat question; the last one must answer instead of calling tools.
MAX_ROUNDS = 5
# Most tool calls the model may make in one round; extra ones get an error result.
MAX_CALLS_PER_ROUND = 8
# Most figure rows shown under an answer.
MAX_ROWS = 20
MAX_DESCRIPTION_LENGTH = 600

TOO_MANY_STEPS = "The assistant needed too many steps for this question. Try asking something more specific."


# ── Quota (AI-8) ────────────────────────────────────────────────────────────


def _current_quota(db: Session, user: Profile) -> rate_limit.Quota:
    """The user's quota right now, from their requests in the last hour."""
    now = utcnow()
    times = repository.request_times_since(db, user.id, rate_limit.window_start(now))
    return rate_limit.quota(times, limit=get_settings().ai_rate_limit_per_hour, now=now)


def _to_schema(quota: rate_limit.Quota) -> AiQuota:
    """The API view of a quota."""
    return AiQuota(limit=quota.limit, remaining=quota.remaining, resets_at=quota.resets_at)


def get_quota(db: Session, user: Profile) -> AiQuota:
    """GET /ai/quota."""
    return _to_schema(_current_quota(db, user))


def _ensure_allowed(db: Session, user: Profile) -> None:
    """429 RATE_LIMITED when the user has no requests left this hour."""
    rate_limit.check(_current_quota(db, user), what="AI requests")


def _record(db: Session, user: Profile, kind: AiRequestKind) -> AiQuota:
    """Counts a successful request, drops rows that no longer count, commits and returns the quota."""
    now = utcnow()
    repository.add(db, user.id, kind.value, now)
    repository.delete_before(db, user.id, rate_limit.window_start(now))
    db.commit()
    return get_quota(db, user)


def _today() -> date:
    """Today in the business's time zone."""
    return utcnow().astimezone(get_settings().business_tz).date()


# ── Chat (AI-1, AI-2) ───────────────────────────────────────────────────────


def _history(request: ChatRequest) -> list[Message]:
    """The conversation as neutral messages. It always starts with a user turn."""
    messages: list[Message] = []
    for turn in request.messages:
        if turn.role == "user":
            messages.append(UserMessage(turn.content))
        elif messages:  # an assistant turn before any question carries no context
            messages.append(AssistantMessage(text=turn.content))
    return messages


def _run_calls(
    db: Session, calls: tuple[ToolCall, ...], currency: str
) -> tuple[list[ToolResult], list[tools.ToolOutput]]:
    """Runs one round of tool calls. Errors go back to the model as error results."""
    results: list[ToolResult] = []
    outputs: list[tools.ToolOutput] = []
    for index, call in enumerate(calls):
        if index >= MAX_CALLS_PER_ROUND:
            error = f"Too many tool calls at once; at most {MAX_CALLS_PER_ROUND} per step."
            results.append(ToolResult(call.id, call.name, {"error": error}, is_error=True))
            continue
        try:
            output = tools.run(db, call, currency)
        except tools.ToolError as exc:
            logger.info("AI tool call rejected: %s(%s): %s", call.name, call.arguments, exc)
            results.append(ToolResult(call.id, call.name, {"error": str(exc)}, is_error=True))
            continue
        outputs.append(output)
        results.append(ToolResult(call.id, call.name, output.data))
    return results, outputs


def _sources(outputs: list[tools.ToolOutput]) -> list[ChatSource]:
    """One chip per distinct tool result that fed the answer, in the order they were used."""
    seen: dict[str, ChatSource] = {}
    for output in outputs:
        seen.setdefault(output.label, ChatSource(tool=output.tool, label=output.label))
    return list(seen.values())


def _rows(outputs: list[tools.ToolOutput]) -> list[ChatRow]:
    """The figures to show: those of the last tool result that had any (the one the answer is about)."""
    for output in reversed(outputs):
        if output.rows:
            return [ChatRow(label=r.label, value=r.value) for r in output.rows[:MAX_ROWS]]
    return []


def _clip(text: str, limit: int) -> str:
    """`text` cut to `limit` characters at a word boundary, with an ellipsis if it was cut."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.;:") + "…"


def chat(db: Session, user: Profile, llm: LLMClient, request: ChatRequest) -> ChatReply:
    """Answers the last question with the tool loop: the model calls read-only tools, gets their
    results and finally answers. Rows and sources come from the tool results, not the model's text."""
    _ensure_allowed(db, user)
    business = settings_service.read(db)
    system = prompts.chat_system_prompt(
        today=_today(),
        timezone=get_settings().business_timezone,
        currency=business.currency,
        business_name=business.business_name,
    )
    messages = _history(request)
    outputs: list[tools.ToolOutput] = []

    for _ in range(MAX_ROUNDS):
        reply = llm.generate(system=system, messages=messages, tools=tools.TOOL_SPECS)
        if not reply.tool_calls:
            break
        results, round_outputs = _run_calls(db, reply.tool_calls, business.currency)
        outputs += round_outputs
        messages += [reply, ToolResultsMessage(tuple(results))]
    else:
        logger.warning("AI chat stopped after %d rounds without an answer", MAX_ROUNDS)
        raise AiUnavailable(TOO_MANY_STEPS)

    answer = reply.text.strip()
    if not answer:
        raise AiUnavailable()
    # The answer is sent back as history next time, where messages are capped.
    content = _clip(answer, MAX_MESSAGE_LENGTH)
    quota = _record(db, user, AiRequestKind.CHAT)
    return ChatReply(
        message=AssistantMessageOut(content=content, rows=_rows(outputs), sources=_sources(outputs)),
        quota=quota,
    )


# ── Insights (AI-4) ─────────────────────────────────────────────────────────


class _Sections(BaseModel):
    """The model's insights reply."""

    sections: list[InsightSection] = Field(min_length=1, max_length=5)


def _parse_sections(text: str) -> list[InsightSection]:
    """The sections from the model's JSON reply; AiUnavailable if it isn't valid."""
    raw = text.strip()
    # Tolerate a ```json fence even though JSON output was requested.
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        return _Sections.model_validate(json.loads(raw)).sections
    except (ValueError, ValidationError) as exc:
        logger.error("AI insights reply was not valid JSON sections: %s", exc)
        raise AiUnavailable() from exc


def insights(db: Session, user: Profile, llm: LLMClient, request: InsightsRequest) -> InsightsReport:
    """IMS computes the period's figures in SQL; the model only writes the sections from them."""
    _ensure_allowed(db, user)
    currency = settings_service.read(db).currency
    period = DashboardRange(start_date=request.start_date, end_date=request.end_date)
    sales = dashboard_service.sales_summary(db, period)  # also validates the range (422)
    categories = dashboard_service.category_revenue(db, period)
    top = dashboard_service.top_products(
        db, TopProductsQuery(start_date=request.start_date, end_date=request.end_date, limit=3)
    )
    low = products_service.list_products(
        db, ProductFilters(low_stock=True, sort="quantity", order="asc"), PageParams(page=1, page_size=5)
    )

    average = sales.revenue / sales.invoice_count if sales.invoice_count else Decimal("0")
    change = fmt.percent_change(sales.revenue, sales.previous_revenue)
    previous_label = fmt.date_range(sales.previous_start, sales.previous_end)
    leader = categories[0] if categories else None

    figures = [
        InsightFigure(label="Revenue", value=fmt.money(sales.revenue, currency), tone=None),
        InsightFigure(
            label=f"vs {previous_label}",
            value=fmt.signed_percent(change) if change is not None else "—",
            tone=None if change is None else ("positive" if change >= 0 else "negative"),
        ),
        InsightFigure(label="Invoices", value=fmt.number(sales.invoice_count), tone=None),
        InsightFigure(label="Avg invoice", value=fmt.money(average, currency), tone=None),
        InsightFigure(
            label="Top category",
            value=f"{leader.name} {fmt.share_percent(leader.share)}" if leader else "—",
            tone=None,
        ),
        InsightFigure(
            label="Low stock", value=fmt.plural(low.total, "product"), tone="warning" if low.total else None
        ),
    ]
    # Only these figures reach the model, already formatted, so it has nothing to compute.
    facts = {
        "period": fmt.date_range(sales.start, sales.end),
        "days": (sales.end - sales.start).days + 1,
        "revenue": fmt.money(sales.revenue, currency),
        "invoices": sales.invoice_count,
        "average_invoice": fmt.money(average, currency),
        "previous_period": previous_label,
        "previous_revenue": fmt.money(sales.previous_revenue, currency),
        "previous_invoices": sales.previous_invoice_count,
        "revenue_change_vs_previous": fmt.signed_percent(change) if change is not None else "no sales before",
        "categories_by_revenue": [
            {"name": c.name, "revenue": fmt.money(c.revenue, currency), "share": fmt.share_percent(c.share)}
            for c in categories[:5]
        ],
        "top_products_by_units": [
            {"name": p.name, "units_sold": p.quantity, "revenue": fmt.money(p.revenue, currency)} for p in top
        ],
        "low_stock_count": low.total,
        "lowest_stock_products": [
            {"name": p.name, "quantity": p.quantity, "min_quantity": p.min_quantity} for p in low.items
        ],
    }

    reply = llm.generate(
        system=prompts.INSIGHTS_SYSTEM_PROMPT,
        messages=[UserMessage(prompts.insights_request(facts))],
        json_schema=prompts.INSIGHTS_SCHEMA,
    )
    sections = _parse_sections(reply.text)
    quota = _record(db, user, AiRequestKind.INSIGHTS)
    return InsightsReport(
        start_date=sales.start,
        end_date=sales.end,
        figures=figures,
        sections=sections,
        generated_at=utcnow(),
        quota=quota,
    )


# ── Product description (AI-5) ──────────────────────────────────────────────


def _plain_text(text: str) -> str:
    """The model's text as one plain paragraph: no Markdown marks, bullets or wrapping quotes."""
    text = re.sub(r"[*_#`>]+", "", text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.MULTILINE)
    text = " ".join(text.split())
    return text.strip().strip("\"“”'")


def product_description(
    db: Session, user: Profile, llm: LLMClient, request: ProductDescriptionRequest
) -> ProductDescriptionResult:
    """A short plain-text draft from the product's name and category."""
    _ensure_allowed(db, user)
    reply = llm.generate(
        system=prompts.DESCRIPTION_SYSTEM_PROMPT,
        messages=[UserMessage(prompts.description_request(request.name, request.category))],
    )
    description = _clip(_plain_text(reply.text), MAX_DESCRIPTION_LENGTH)
    if not description:
        raise AiUnavailable()
    quota = _record(db, user, AiRequestKind.PRODUCT_DESCRIPTION)
    return ProductDescriptionResult(description=description, quota=quota)
