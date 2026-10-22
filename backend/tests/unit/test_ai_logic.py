"""Pure AI logic: rate-limit rules, display formatting, tool schemas and the Gemini adapter.

The adapter tests drive the real google-genai SDK through an in-memory HTTP transport: requests are
captured and answered locally, so nothing reaches Google and no key is needed.
"""

import json
import logging
import sys
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest

from app.core import rate_limit
from app.core.exceptions import AiUnavailable, RateLimited
from app.modules.ai import formatting as fmt
from app.modules.ai import service as ai_service
from app.modules.ai import tools
from app.modules.ai.client import (
    AssistantMessage,
    GeminiClient,
    ToolCall,
    ToolResult,
    ToolResultsMessage,
    ToolSpec,
    UserMessage,
    get_llm_client,
)

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)


# ── Rate limit ──────────────────────────────────────────────────────────────


def test_quota_counts_only_the_rolling_hour() -> None:
    """Requests older than an hour don't count; resets_at is when the oldest counted one expires."""
    times = [NOW - timedelta(minutes=m) for m in (90, 60, 45, 5)]
    quota = rate_limit.quota(times, limit=3, now=NOW)
    assert quota == rate_limit.Quota(limit=3, remaining=1, resets_at=NOW + timedelta(minutes=15))


def test_quota_with_nothing_used() -> None:
    """Full allowance, a whole window from now."""
    assert rate_limit.quota([], limit=20, now=NOW) == rate_limit.Quota(20, 20, NOW + timedelta(hours=1))


def test_quota_never_goes_negative_and_check_raises() -> None:
    """Over the limit (e.g. after lowering it) still shows 0 left; check() refuses with 429."""
    quota = rate_limit.quota([NOW - timedelta(minutes=1)] * 5, limit=2, now=NOW)
    assert quota.remaining == 0
    with pytest.raises(RateLimited) as error:
        rate_limit.check(quota, what="AI requests")
    assert error.value.status_code == 429
    assert error.value.detail == "You’ve used all 2 AI requests this hour."
    rate_limit.check(rate_limit.quota([], limit=2, now=NOW))  # no error


# ── Formatting ──────────────────────────────────────────────────────────────


def test_formatting_matches_the_frontend() -> None:
    """Same strings as lib/format.ts."""
    assert fmt.money(Decimal("1234.5"), "SAR") == "SAR 1,234.50"
    assert fmt.money(Decimal("-3"), "SAR") == "− SAR 3.00"
    assert fmt.date_range(date(2026, 10, 1), date(2026, 10, 1)) == "Oct 1"
    assert fmt.date_range(date(2026, 10, 1), date(2026, 10, 23)) == "Oct 1 – Oct 23"
    assert fmt.date_range(date(2025, 12, 1), date(2026, 1, 5)) == "Dec 1, 2025 – Jan 5, 2026"
    assert fmt.percent_change(Decimal("125"), Decimal("100")) == Decimal("25.0")
    assert fmt.percent_change(Decimal("5"), Decimal("0")) is None
    assert fmt.signed_percent(Decimal("-4")) == "−4.0%"
    assert fmt.share_percent(0.311) == "31%"
    assert fmt.plural(1, "unit") == "1 unit" and fmt.plural(1200, "unit") == "1,200 units"


def test_plain_text_and_clipping() -> None:
    """Descriptions lose Markdown; long text is cut at a word boundary."""
    assert (
        ai_service._plain_text("## **Bold** _drill_\n* not a bullet\n- bullet")
        == "Bold drill not a bullet bullet"
    )
    assert ai_service._clip("short", 10) == "short"
    assert ai_service._clip("one two three four", 12) == "one two…"


# ── Tools ───────────────────────────────────────────────────────────────────


def test_every_tool_schema_matches_its_argument_model() -> None:
    """The hand-written JSON schemas list exactly the fields the Pydantic models accept, and the
    required ones are the fields without defaults."""
    assert [spec.name for spec in tools.TOOL_SPECS] == list(tools.TOOLS)
    for tool in tools.TOOLS.values():
        schema = tool.spec.parameters
        fields = tool.args.model_fields
        assert set(schema["properties"]) == set(fields), tool.spec.name
        assert set(schema["required"]) == {n for n, f in fields.items() if f.is_required()}, tool.spec.name


def test_tool_arguments_are_validated() -> None:
    """Dates, order and the limit ≤ 20 rule."""
    ok = tools.TopProductsArgs.model_validate({"start_date": "2026-10-01", "end_date": "2026-10-20"})
    assert ok.limit == 5 and ok.order == "desc"
    for bad in (
        {"start_date": "2026-10-01", "end_date": "2026-10-20", "limit": 21},
        {"start_date": "2026-10-01", "end_date": "2026-10-20", "limit": 0},
        {"start_date": "2026-10-01", "end_date": "2026-10-20", "order": "random"},
        {"start_date": "2026-10-20"},
    ):
        with pytest.raises(ValueError):
            tools.TopProductsArgs.model_validate(bad)
    with pytest.raises(ValueError):
        tools.SearchArgs.model_validate({"query": "   "})


def test_unknown_tool_is_a_tool_error() -> None:
    """The dispatcher refuses names it doesn't know before touching the database."""
    with pytest.raises(tools.ToolError, match="Unknown tool"):
        tools.run(None, ToolCall("1", "delete_everything", {}), "SAR")  # type: ignore[arg-type]


def test_insights_sections_parsing() -> None:
    """JSON (optionally fenced) with 1–5 sections is accepted; anything else is AI_UNAVAILABLE."""
    good = '{"sections": [{"heading": "H", "body": "B"}]}'
    assert ai_service._parse_sections(f"```json\n{good}\n```")[0].heading == "H"
    with pytest.raises(AiUnavailable):
        ai_service._parse_sections('{"sections": [' + ",".join(['{"heading": "H", "body": "B"}'] * 6) + "]}")


# ── Gemini adapter ──────────────────────────────────────────────────────────

SPEC = ToolSpec("get_low_stock_products", "Low stock.", {"type": "object", "properties": {}, "required": []})


def gemini(handler: Callable[[httpx.Request], httpx.Response]) -> tuple[GeminiClient, list[dict[str, Any]]]:
    """A GeminiClient whose SDK sends requests to `handler` instead of Google. Returns the client and
    the captured request bodies."""
    from google import genai
    from google.genai import types

    bodies: list[dict[str, Any]] = []

    def capture(request: httpx.Request) -> httpx.Response:
        assert "secret-test-key" not in str(request.url)  # the key travels in a header only
        assert request.headers["x-goog-api-key"] == "secret-test-key"
        bodies.append(json.loads(request.content))
        return handler(request)

    client = GeminiClient(api_key="secret-test-key", model="gemini-test", timeout_seconds=5)
    client._sdk_client = genai.Client(
        api_key="secret-test-key",
        http_options=types.HttpOptions(
            timeout=5000,
            retry_options=types.HttpRetryOptions(attempts=1),
            client_args={"transport": httpx.MockTransport(capture)},
        ),
    )
    return client, bodies


def reply(status: str, *steps: dict[str, Any]) -> Callable[[httpx.Request], httpx.Response]:
    """A handler answering with an Interaction of these steps."""
    return lambda _: httpx.Response(200, json={"id": "i1", "status": status, "steps": list(steps)})


def test_gemini_tool_call_round_trip_keeps_thought_signatures() -> None:
    """Tool calls are parsed; the model's own steps (with their thought signature) are sent back
    verbatim, followed by the function results. Requests are stateless (store=false)."""
    client, bodies = gemini(
        reply(
            "requires_action",
            {"type": "thought", "signature": "c2lnbmF0dXJl"},
            {
                "type": "function_call",
                "id": "call-1",
                "name": "get_low_stock_products",
                "arguments": {"limit": 3},
            },
        )
    )
    turn = client.generate(system="rules", messages=[UserMessage("What's low?")], tools=[SPEC])

    assert turn.tool_calls == (ToolCall("call-1", "get_low_stock_products", {"limit": 3}),)
    first = bodies[0]
    assert first["model"] == "gemini-test" and first["store"] is False
    assert first["system_instruction"] == "rules"
    assert first["input"] == [{"type": "user_input", "content": [{"type": "text", "text": "What's low?"}]}]
    assert first["tools"][0]["name"] == "get_low_stock_products" and first["tools"][0]["type"] == "function"

    client.generate(
        system="rules",
        messages=[
            UserMessage("What's low?"),
            turn,
            ToolResultsMessage((ToolResult("call-1", "get_low_stock_products", {"products": []}),)),
        ],
        tools=[SPEC],
    )
    steps = bodies[1]["input"]
    assert steps[1] == {"type": "thought", "signature": "c2lnbmF0dXJl"}
    assert steps[2]["type"] == "function_call" and steps[2]["id"] == "call-1"
    assert steps[3]["type"] == "function_result" and steps[3]["call_id"] == "call-1"
    assert json.loads(steps[3]["result"][0]["text"]) == {"products": []}


def test_gemini_final_text_and_json_mode() -> None:
    """Final text comes from the model output; a JSON schema becomes the response format."""
    client, bodies = gemini(
        reply("completed", {"type": "model_output", "content": [{"type": "text", "text": '{"a": 1}'}]})
    )
    history = [UserMessage("q"), AssistantMessage(text="earlier answer"), UserMessage("again")]
    turn = client.generate(system="s", messages=history, json_schema={"type": "object"})

    assert turn.text == '{"a": 1}' and turn.tool_calls == ()
    assert bodies[0]["response_format"] == {
        "type": "text",
        "mime_type": "application/json",
        "schema": {"type": "object"},
    }
    assert "tools" not in bodies[0]
    assert bodies[0]["input"][1] == {
        "type": "model_output",
        "content": [{"type": "text", "text": "earlier answer"}],
    }


@pytest.mark.parametrize(
    "handler",
    [
        lambda _: httpx.Response(500, json={"error": {"code": 500, "message": "boom", "status": "INTERNAL"}}),
        lambda _: httpx.Response(
            400, json={"error": {"code": 400, "message": "API key not valid", "status": "INVALID_ARGUMENT"}}
        ),
        lambda _: httpx.Response(
            429, json={"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}}
        ),
        reply("failed"),
        reply("completed"),  # nothing usable (e.g. blocked)
        reply("completed", {"type": "model_output", "content": [{"type": "text", "text": "  "}]}),
    ],
)
def test_gemini_failures_become_ai_unavailable(handler: Callable[[httpx.Request], httpx.Response]) -> None:
    """HTTP errors, bad keys, provider rate limits, failed or empty interactions: one error type."""
    client, _ = gemini(handler)
    with pytest.raises(AiUnavailable) as error:
        client.generate(system="s", messages=[UserMessage("q")])
    assert error.value.status_code == 503 and error.value.code == "AI_UNAVAILABLE"


def test_gemini_timeout_and_network_errors_become_ai_unavailable(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Transport errors are logged server-side (with the key masked) and reported generically."""
    # The test session's Alembic run (fileConfig) disables loggers that already exist.
    monkeypatch.setattr(logging.getLogger("app.modules.ai.client"), "disabled", False)

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out talking to secret-test-key", request=request)

    client, _ = gemini(timeout)
    with caplog.at_level(logging.ERROR), pytest.raises(AiUnavailable) as error:
        client.generate(system="s", messages=[UserMessage("q")])
    assert "secret-test-key" not in error.value.detail
    assert "Gemini request failed" in caplog.text and "secret-test-key" not in caplog.text


def test_real_client_refuses_to_run_without_a_key() -> None:
    """Safety net: no key means AI_UNAVAILABLE before any SDK client or network call exists."""
    client = GeminiClient(api_key="  ", model="gemini-test", timeout_seconds=5)
    with pytest.raises(AiUnavailable):
        client.generate(system="s", messages=[UserMessage("q")])
    assert client._sdk_client is None


def test_get_llm_client_does_not_need_a_key() -> None:
    """The dependency builds the Gemini client lazily, so an empty key never breaks startup (AI-7)."""
    assert isinstance(get_llm_client(), GeminiClient)


def test_missing_sdk_is_ai_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """A deployment without the SDK still answers AI_UNAVAILABLE instead of a 500."""
    monkeypatch.setitem(sys.modules, "google.genai", None)
    client = GeminiClient(api_key="secret-test-key", model="gemini-test", timeout_seconds=5)
    with pytest.raises(AiUnavailable):
        client.generate(system="s", messages=[UserMessage("q")])
