"""AI assistant endpoints (AI-1 … AI-8) against a scripted FakeLLMClient; Gemini is never called.

"Now" is pinned to 2026-10-20 09:00 UTC (12:00 in Asia/Riyadh) so quota windows and dates are exact.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AiUnavailable
from app.modules.ai import repository as ai_repository
from app.modules.ai import service as ai_service
from app.modules.ai.client import AssistantMessage, ToolCall, ToolResultsMessage, UserMessage
from app.modules.ai.models import AiRequest
from app.modules.users.models import Profile
from tests.factories import (
    FakeLLMClient,
    create_category,
    create_invoice,
    create_product,
    llm_text,
    llm_tool_call,
)

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
URL = "/api/v1/ai"


@pytest.fixture(autouse=True)
def pinned_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pins the AI service's idea of "now"."""
    monkeypatch.setattr(ai_service, "utcnow", lambda: NOW)


def at(day: int, hour: int = 9, month: int = 10) -> datetime:
    """A UTC timestamp in 2026."""
    return datetime(2026, month, day, hour, 0, tzinfo=UTC)


def ask(client: TestClient, headers: dict[str, str], *questions: str) -> Any:
    """POST /ai/chat with one user turn per question (no assistant turns)."""
    turns = [{"role": "user", "content": q} for q in questions]
    return client.post(f"{URL}/chat", json={"messages": turns}, headers=headers)


def counted(db: Session, user: Profile) -> int:
    """How many AI requests are recorded for the user."""
    return db.scalar(select(func.count()).select_from(AiRequest).where(AiRequest.user_id == user.id)) or 0


def last_tool_results(llm: FakeLLMClient) -> ToolResultsMessage:
    """The tool results sent to the model in its last call."""
    message = llm.calls[-1]["messages"][-1]
    assert isinstance(message, ToolResultsMessage)
    return message


# ── Chat ────────────────────────────────────────────────────────────────────


def test_tool_call_then_answer_builds_rows_and_sources_from_tool_data(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """The model asks for low-stock products, gets IMS data back, then answers (AI-2)."""
    tools_cat = create_category(db, name="Tools")
    create_product(db, category=tools_cat, name="Hammer", quantity=0, min_quantity=5)
    create_product(db, category=tools_cat, name="Drill", quantity=3, min_quantity=10)
    create_product(db, category=tools_cat, name="Saw", quantity=50, min_quantity=5)
    llm.script(
        llm_tool_call("get_low_stock_products", call_id="c1"),
        llm_text("Two products are low. Hammer is out."),
    )

    response = ask(client, admin_headers, "What's running low?")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["message"] == {
        "role": "assistant",
        "content": "Two products are low. Hammer is out.",
        "rows": [{"label": "Hammer", "value": "0 / min 5"}, {"label": "Drill", "value": "3 / min 10"}],
        "sources": [{"tool": "get_low_stock_products", "label": "Low-stock products · now"}],
    }
    assert body["quota"]["remaining"] == 19
    assert counted(db, admin) == 1

    # The model got the tool's data, not a summary of it.
    results = last_tool_results(llm).results
    assert results[0].call_id == "c1" and not results[0].is_error
    assert results[0].content["total_low_stock"] == 2
    assert [p["name"] for p in results[0].content["products"]] == ["Hammer", "Drill"]
    # The tool-call turn went back to the model before the results.
    assert isinstance(llm.calls[1]["messages"][-2], AssistantMessage)


def test_plain_answer_has_no_rows_or_sources(
    client: TestClient, staff_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Staff can chat too (PRD §8: all users); an answer without tools shows no data chips."""
    llm.script(llm_text("  I can only help with sales, stock and products.  "))

    response = ask(client, staff_headers, "What's the weather?")

    assert response.status_code == 200, response.text
    message = response.json()["message"]
    assert message["content"] == "I can only help with sales, stock and products."
    assert message["rows"] == [] and message["sources"] == []


def test_system_prompt_has_business_date_currency_and_rules(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Today is the business-local date; amounts are in the settings' currency; read-only tools only."""
    llm.script(llm_text("Hi."))
    ask(client, admin_headers, "Hello")

    call = llm.calls[0]
    assert "2026-10-20" in call["system"] and "Tuesday" in call["system"]
    assert get_settings().default_currency in call["system"]
    assert "Never calculate" in call["system"] and "Never invent" in call["system"]
    assert {t.name for t in call["tools"]} == {
        "get_sales_summary",
        "get_top_products",
        "get_low_stock_products",
        "get_category_revenue",
        "search_products",
    }


def test_history_is_sent_and_starts_with_a_user_turn(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Earlier turns reach the model; a leading assistant turn is dropped."""
    llm.script(llm_text("Yes."))
    turns = [
        {"role": "assistant", "content": "Welcome!"},
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "First answer"},
        {"role": "user", "content": "And now?"},
    ]
    response = client.post(f"{URL}/chat", json={"messages": turns}, headers=admin_headers)

    assert response.status_code == 200, response.text
    assert llm.calls[0]["messages"] == [
        UserMessage("First question"),
        AssistantMessage(text="First answer"),
        UserMessage("And now?"),
    ]


def test_unknown_tool_and_bad_arguments_go_back_to_the_model_as_errors(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Mistakes by the model don't fail the request: it gets an error result and can recover."""
    llm.script(
        AssistantMessage(
            tool_calls=(
                ToolCall("c1", "run_sql", {"sql": "DELETE FROM products"}),
                ToolCall("c2", "get_top_products", {"start_date": "2026-10-10", "end_date": "2026-10-01"}),
                ToolCall(
                    "c3",
                    "get_top_products",
                    {"start_date": "2026-10-01", "end_date": "2026-10-10", "limit": 50},
                ),
                ToolCall("c4", "get_category_revenue", {"start_date": "yesterday", "end_date": "2026-10-10"}),
                ToolCall("c5", "search_products", {"query": "drill", "drop": True}),
            )
        ),
        llm_text("I couldn't get that data."),
    )

    response = ask(client, admin_headers, "Top products?")

    assert response.status_code == 200, response.text
    assert response.json()["message"]["sources"] == []
    results = {r.call_id: r for r in last_tool_results(llm).results}
    assert all(r.is_error for r in results.values())
    assert "Unknown tool" in results["c1"].content["error"]
    assert "start_date must be on or before end_date" in results["c2"].content["error"]
    assert "limit" in results["c3"].content["error"]
    assert "start_date" in results["c4"].content["error"]
    assert "drop" in results["c5"].content["error"]


def test_range_over_the_dashboard_cap_is_refused(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Tool date ranges stay within the dashboard's five-year cap."""
    llm.script(
        llm_tool_call("get_sales_summary", start_date="2010-01-01", end_date="2026-10-20"),
        llm_text("That range is too long."),
    )
    ask(client, admin_headers, "All-time sales?")
    assert "five years" in last_tool_results(llm).results[0].content["error"]


def test_loop_is_capped_and_not_counted(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """A model that keeps calling tools is stopped after 5 rounds with AI_UNAVAILABLE."""
    llm.script(*[llm_tool_call("get_low_stock_products") for _ in range(10)])

    response = ask(client, admin_headers, "Loop forever")

    assert response.status_code == 503
    assert response.json() == {"detail": ai_service.TOO_MANY_STEPS, "code": "AI_UNAVAILABLE"}
    assert len(llm.calls) == ai_service.MAX_ROUNDS == 5
    assert counted(db, admin) == 0


def test_too_many_calls_in_one_round_are_refused(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """At most 8 tool calls run per round; extras get an error result."""
    calls = tuple(ToolCall(f"c{i}", "get_low_stock_products", {}) for i in range(10))
    llm.script(AssistantMessage(tool_calls=calls), llm_text("Done."))

    ask(client, admin_headers, "Many calls")

    results = last_tool_results(llm).results
    assert [r.is_error for r in results] == [False] * 8 + [True] * 2


def test_provider_failure_is_503_and_not_counted(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """AI-7: the provider failing gives a generic AI_UNAVAILABLE and doesn't use quota."""
    llm.script(AiUnavailable())

    response = ask(client, admin_headers, "Sales today?")

    assert response.status_code == 503
    assert response.json()["code"] == "AI_UNAVAILABLE"
    assert counted(db, admin) == 0
    assert client.get(f"{URL}/quota", headers=admin_headers).json()["remaining"] == 20
    # The rest of the app keeps working.
    assert client.get("/api/v1/products", headers=admin_headers).status_code == 200


def test_empty_answer_is_503(client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient) -> None:
    """A blank final answer counts as a provider failure."""
    llm.script(llm_text("   "))
    assert ask(client, admin_headers, "Hi").status_code == 503


def test_long_answers_are_clipped_to_the_history_limit(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """The answer comes back as history next time, where messages are capped at 2000 characters."""
    llm.script(llm_text("word " * 1000))
    content = ask(client, admin_headers, "Long?").json()["message"]["content"]
    assert len(content) <= 2000 and content.endswith("…")


@pytest.mark.parametrize(
    "messages",
    [
        [],
        [{"role": "user", "content": "q"}] * 21,
        [{"role": "user", "content": "x" * 2001}],
        [{"role": "user", "content": "   "}],
        [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}],
        [{"role": "system", "content": "q"}],
    ],
)
def test_chat_input_limits(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient, messages: list[dict[str, str]]
) -> None:
    """At most 20 turns of at most 2000 characters, ending with a non-empty user question."""
    response = client.post(f"{URL}/chat", json={"messages": messages}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert llm.calls == []


# ── Tools against real data ─────────────────────────────────────────────────


def test_sales_and_product_tools_read_real_figures(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Sales summary, top products, category revenue and search return figures from SQL."""
    paint = create_category(db, name="Paint")
    brush = create_product(db, category=paint, name="Brush", sku="BR-1", sell_price="10.00", quantity=100)
    roller = create_product(db, category=paint, name="Roller", sku="RO-1", sell_price="25.00", quantity=100)
    create_invoice(db, admin, [(brush, 3), (roller, 1)], created_at=at(5))  # 55.00
    create_invoice(db, admin, [(brush, 1)], created_at=at(15))  # 10.00
    create_invoice(db, admin, [(roller, 2)], created_at=at(20, month=9))  # previous period: 50.00
    llm.script(
        AssistantMessage(
            tool_calls=(
                ToolCall("s", "get_sales_summary", {"start_date": "2026-10-01", "end_date": "2026-10-20"}),
                ToolCall(
                    "t",
                    "get_top_products",
                    {"start_date": "2026-10-01", "end_date": "2026-10-20", "order_by": "revenue"},
                ),
                ToolCall("c", "get_category_revenue", {"start_date": "2026-10-01", "end_date": "2026-10-20"}),
                ToolCall("q", "search_products", {"query": " rol "}),
            )
        ),
        llm_text("Here you go."),
    )

    response = ask(client, admin_headers, "How are sales this month?")

    assert response.status_code == 200, response.text
    data = {r.call_id: r.content for r in last_tool_results(llm).results}
    assert data["s"]["revenue"] == "65.00" and data["s"]["invoice_count"] == 2
    assert data["s"]["average_invoice"] == "32.50"
    assert data["s"]["previous_period"] == {
        "start_date": "2026-09-11",
        "end_date": "2026-09-30",
        "revenue": "50.00",
        "invoice_count": 1,
    }
    assert data["s"]["revenue_change_percent"] == "30.0"
    assert data["t"]["products"] == [
        {"name": "Brush", "sku": "BR-1", "units_sold": 4, "revenue": "40.00"},
        {"name": "Roller", "sku": "RO-1", "units_sold": 1, "revenue": "25.00"},
    ]
    assert data["c"]["categories"] == [{"name": "Paint", "revenue": "65.00", "share_percent": "100%"}]
    assert [p["name"] for p in data["q"]["products"]] == ["Roller"]
    assert data["q"]["products"][0]["sell_price"] == "25.00"

    message = response.json()["message"]
    currency = get_settings().default_currency
    # Rows: the last tool result that had any (search); sources: every tool used, in order.
    assert message["rows"] == [{"label": "Roller", "value": f"RO-1 · 97 in stock · {currency} 25.00"}]
    assert [s["label"] for s in message["sources"]] == [
        "Sales summary · Oct 1 – Oct 20",
        "Top products · Oct 1 – Oct 20",
        "Category revenue · Oct 1 – Oct 20",
        "Product search · “rol”",
    ]


def test_top_products_lowest_first(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """order=asc lists the products that sold least, and says so on the chip."""
    a = create_product(db, name="Alpha", quantity=50)
    b = create_product(db, name="Beta", quantity=50)
    create_invoice(db, admin, [(a, 5), (b, 1)], created_at=at(10))
    llm.script(
        llm_tool_call(
            "get_top_products", start_date="2026-10-01", end_date="2026-10-20", order="asc", limit=1
        ),
        llm_text("Beta sold least."),
    )

    message = ask(client, admin_headers, "What sold least?").json()["message"]

    assert message["rows"] == [
        {"label": "Beta", "value": f"1 unit · {get_settings().default_currency} 15.00"}
    ]
    assert message["sources"][0]["label"] == "Top products · Oct 1 – Oct 20, lowest 1"


# ── Rate limit and quota (AI-8) ─────────────────────────────────────────────


def test_quota_for_a_new_user(client: TestClient, staff_headers: dict[str, str]) -> None:
    """Nothing used: the full limit, resetting an hour from now."""
    response = client.get(f"{URL}/quota", headers=staff_headers)
    assert response.status_code == 200
    assert response.json() == {"limit": 20, "remaining": 20, "resets_at": "2026-10-20T10:00:00Z"}


def test_quota_uses_a_rolling_hour(
    client: TestClient, db: Session, admin: Profile, staff: Profile, admin_headers: dict[str, str]
) -> None:
    """Only the last hour counts; resets_at is when the oldest counted request expires; other users'
    requests don't count."""
    ai_repository.add(db, admin.id, "chat", NOW - timedelta(minutes=61))
    ai_repository.add(db, admin.id, "chat", NOW - timedelta(minutes=50))
    ai_repository.add(db, admin.id, "insights", NOW - timedelta(minutes=10))
    ai_repository.add(db, staff.id, "chat", NOW - timedelta(minutes=5))
    db.commit()

    body = client.get(f"{URL}/quota", headers=admin_headers).json()

    assert body == {"limit": 20, "remaining": 18, "resets_at": "2026-10-20T09:10:00Z"}


def test_21st_request_in_an_hour_is_rate_limited(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """20 requests per hour; the 21st answers 429 without calling the model."""
    for i in range(20):
        llm.script(llm_text(f"Description {i}."))
        response = client.post(
            f"{URL}/product-description", json={"name": f"Item {i}"}, headers=admin_headers
        )
        assert response.status_code == 200, response.text
        assert response.json()["quota"]["remaining"] == 19 - i

    calls_before = len(llm.calls)
    response = ask(client, admin_headers, "One more?")

    assert response.status_code == 429
    assert response.json() == {"detail": "You’ve used all 20 AI requests this hour.", "code": "RATE_LIMITED"}
    assert len(llm.calls) == calls_before
    assert client.get(f"{URL}/quota", headers=admin_headers).json()["remaining"] == 0
    assert counted(db, admin) == 20


def test_old_rows_are_pruned_when_recording(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Rows outside the window are deleted, so the table stays small."""
    ai_repository.add(db, admin.id, "chat", NOW - timedelta(hours=3))
    db.commit()
    llm.script(llm_text("Hi."))
    ask(client, admin_headers, "Hello")
    assert counted(db, admin) == 1


# ── Insights (AI-4) ─────────────────────────────────────────────────────────


def test_insights_figures_come_from_sql_and_sections_from_the_model(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """IMS computes every figure; only those figures reach the model, which writes the sections."""
    tools_cat = create_category(db, name="Tools")
    paint = create_category(db, name="Paint")
    drill = create_product(db, category=tools_cat, name="Drill", sell_price="100.00", quantity=20)
    brush = create_product(db, category=paint, name="Brush", sell_price="10.00", quantity=20, min_quantity=30)
    create_invoice(db, admin, [(drill, 1), (brush, 5)], created_at=at(3))  # 150.00
    create_invoice(db, admin, [(drill, 1)], created_at=at(9))  # 100.00
    create_invoice(db, admin, [(drill, 2)], created_at=at(25, month=9))  # previous: 200.00
    sections = '{"sections": [{"heading": "Sales are up", "body": "Revenue rose 25.0%."}]}'
    llm.script(llm_text(f"```json\n{sections}\n```"))

    response = client.post(
        f"{URL}/insights", json={"start_date": "2026-10-01", "end_date": "2026-10-10"}, headers=admin_headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    c = get_settings().default_currency
    assert body["start_date"] == "2026-10-01" and body["end_date"] == "2026-10-10"
    assert body["figures"] == [
        {"label": "Revenue", "value": f"{c} 250.00", "tone": None},
        {"label": "vs Sep 21 – Sep 30", "value": "+25.0%", "tone": "positive"},
        {"label": "Invoices", "value": "2", "tone": None},
        {"label": "Avg invoice", "value": f"{c} 125.00", "tone": None},
        {"label": "Top category", "value": "Tools 80%", "tone": None},
        {"label": "Low stock", "value": "1 product", "tone": "warning"},
    ]
    assert body["sections"] == [{"heading": "Sales are up", "body": "Revenue rose 25.0%."}]
    assert body["generated_at"] == "2026-10-20T09:00:00Z"
    assert body["quota"]["remaining"] == 19

    call = llm.calls[0]
    assert call["tools"] == [] and call["json_schema"] is not None
    sent = call["messages"][0].text
    assert f"{c} 250.00" in sent and "+25.0%" in sent and "Brush" in sent


def test_insights_with_no_sales(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """No sales: zero figures, no change, no top category, neutral tones."""
    llm.script(llm_text('{"sections": [{"heading": "No sales", "body": "Nothing was sold."}]}'))
    body = client.post(
        f"{URL}/insights", json={"start_date": "2026-10-01", "end_date": "2026-10-10"}, headers=admin_headers
    ).json()
    values = {f["label"]: (f["value"], f["tone"]) for f in body["figures"]}
    assert values["vs Sep 21 – Sep 30"] == ("—", None)
    assert values["Top category"] == ("—", None)
    assert values["Low stock"] == ("0 products", None)


@pytest.mark.parametrize(
    "reply",
    ["not json", '{"sections": []}', '{"sections": [{"heading": "", "body": "x"}]}', '{"other": 1}'],
)
def test_invalid_insights_reply_is_503_and_not_counted(
    client: TestClient,
    db: Session,
    admin: Profile,
    admin_headers: dict[str, str],
    llm: FakeLLMClient,
    reply: str,
) -> None:
    """The model's JSON is validated; anything else is a provider failure."""
    llm.script(llm_text(reply))
    response = client.post(
        f"{URL}/insights", json={"start_date": "2026-10-01", "end_date": "2026-10-10"}, headers=admin_headers
    )
    assert response.status_code == 503
    assert counted(db, admin) == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"start_date": "2026-10-10", "end_date": "2026-10-01"},
        {"start_date": "2010-01-01", "end_date": "2026-10-01"},
    ],
)
def test_insights_needs_a_valid_period(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient, payload: dict[str, str]
) -> None:
    """A missing, reversed or over-long period is 422 and never reaches the model."""
    response = client.post(f"{URL}/insights", json=payload, headers=admin_headers)
    assert response.status_code == 422
    assert llm.calls == []


# ── Product description (AI-5) ──────────────────────────────────────────────


def test_product_description_is_short_plain_text(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """Markdown, bullets and wrapping quotes are removed; name and category reach the model as data."""
    llm.script(llm_text('"**Cordless drill** for wood and metal.\n- Comes with a case."'))

    response = client.post(
        f"{URL}/product-description",
        json={"name": "  Cordless Drill 18V ", "category": "Tools › Power Tools"},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["description"] == "Cordless drill for wood and metal. Comes with a case."
    assert response.json()["quota"]["remaining"] == 19
    sent = llm.calls[0]["messages"][0].text
    assert '"name": "Cordless Drill 18V"' in sent and "Tools › Power Tools" in sent


def test_product_description_is_capped(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient
) -> None:
    """A rambling reply is clipped to 600 characters."""
    llm.script(llm_text("Very long sentence. " * 100))
    description = client.post(
        f"{URL}/product-description", json={"name": "Thing"}, headers=admin_headers
    ).json()["description"]
    assert len(description) <= ai_service.MAX_DESCRIPTION_LENGTH


@pytest.mark.parametrize(
    "payload", [{}, {"name": "   "}, {"name": "x" * 201}, {"name": "ok", "category": "c" * 201}]
)
def test_product_description_input_limits(
    client: TestClient, admin_headers: dict[str, str], llm: FakeLLMClient, payload: dict[str, str]
) -> None:
    """A name is required; name and category lengths are limited."""
    response = client.post(f"{URL}/product-description", json=payload, headers=admin_headers)
    assert response.status_code == 422
    assert llm.calls == []


# ── Permissions and configuration ───────────────────────────────────────────


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/quota"), ("post", "/chat"), ("post", "/insights"), ("post", "/product-description")],
)
def test_ai_endpoints_need_a_session(client: TestClient, llm: FakeLLMClient, method: str, path: str) -> None:
    """401 without a token, before anything else runs."""
    response = client.request(method, f"{URL}{path}", json={})
    assert response.status_code == 401
    assert response.json()["code"] == "NOT_AUTHENTICATED"
    assert llm.calls == []


def test_without_a_key_the_real_client_answers_ai_unavailable(
    client: TestClient, db: Session, admin: Profile, admin_headers: dict[str, str]
) -> None:
    """AI-7 / safety net: tests run with an empty LLM_API_KEY, and the real Gemini client refuses to
    run without one (no network call). The app still starts and other endpoints work."""
    from app.main import app
    from app.modules.ai.client import get_llm_client

    assert get_settings().llm_api_key == ""
    app.dependency_overrides.pop(get_llm_client)

    response = ask(client, admin_headers, "Sales?")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The AI service isn’t responding. Try again in a moment.",
        "code": "AI_UNAVAILABLE",
    }
    assert counted(db, admin) == 0
    assert client.get(f"{URL}/quota", headers=admin_headers).status_code == 200
