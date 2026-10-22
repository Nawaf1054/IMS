"""LLM provider adapter. The only module that imports the provider SDK.

Everything else in the AI module talks to `LLMClient` with the provider-neutral message types below,
so swapping providers means writing one new adapter class here.

The current provider is Google Gemini through the official `google-genai` SDK and its Interactions
API, used statelessly (`store=False`): the backend sends the whole conversation on every call and
Google keeps nothing between requests. The API key is read from the server's settings only (AI-6).
Every provider failure (no key, timeout, network error, 4xx/5xx, a blocked or empty response)
becomes one `AiUnavailable` error; the details are logged, never sent to the client (AI-7).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol

from app.core.config import get_settings
from app.core.exceptions import AiUnavailable

logger = logging.getLogger(__name__)


# ── Provider-neutral types ──────────────────────────────────────────────────


@dataclass(frozen=True)
class ToolSpec:
    """A function the model may call: its name, what it does and a JSON schema for its arguments."""

    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    """The model asking for one tool to be run with these arguments."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class UserMessage:
    """A message from the person using the assistant."""

    text: str


@dataclass(frozen=True)
class AssistantMessage:
    """A model turn: final text, or tool calls to run before it can answer.

    `provider_state` is opaque data the adapter that produced this turn needs back unchanged when
    the conversation continues (Gemini's thought signatures). Nothing outside the adapter reads it.
    """

    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    provider_state: Any = field(default=None, compare=False, repr=False)


@dataclass(frozen=True)
class ToolResult:
    """The outcome of one tool call. `content` must be JSON-serialisable."""

    call_id: str
    name: str
    content: Any
    is_error: bool = False


@dataclass(frozen=True)
class ToolResultsMessage:
    """The results of every tool call from the previous assistant turn."""

    results: tuple[ToolResult, ...]


Message = UserMessage | AssistantMessage | ToolResultsMessage


class LLMClient(Protocol):
    """What the AI service needs from a model provider."""

    def generate(
        self,
        *,
        system: str,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec] = (),
        json_schema: dict[str, Any] | None = None,
    ) -> AssistantMessage:
        """One model turn for `messages`. With `json_schema` the reply text is JSON matching it.

        Raises AiUnavailable on any provider failure.
        """
        ...


# ── Gemini ──────────────────────────────────────────────────────────────────

# Interaction statuses that mean the model gave up or was stopped.
_FAILED_STATUSES = {"failed", "cancelled", "budget_exceeded"}
# One retry for transient errors (429/5xx); the timeout applies to each attempt.
_ATTEMPTS = 2


class GeminiClient:
    """`LLMClient` for Google Gemini (Interactions API, stateless)."""

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float) -> None:
        """Stores the settings. The SDK client is created on first use, never without a key."""
        self._api_key = api_key.strip()
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._sdk_client: Any = None

    def _sdk(self) -> Any:
        """The google-genai client (created once). Raises AiUnavailable when no key is configured."""
        if not self._api_key:
            logger.warning("AI request refused: LLM_API_KEY is not set")
            raise AiUnavailable()
        if self._sdk_client is None:
            try:
                from google import genai
                from google.genai import types

                self._sdk_client = genai.Client(
                    api_key=self._api_key,
                    http_options=types.HttpOptions(
                        timeout=int(self._timeout_seconds * 1000),  # milliseconds
                        retry_options=types.HttpRetryOptions(attempts=_ATTEMPTS),
                    ),
                )
            except Exception as exc:  # e.g. the SDK isn't installed in an old image
                logger.error(
                    "Could not create the Gemini client (%s): %s", type(exc).__name__, self._redact(str(exc))
                )
                raise AiUnavailable() from exc
        return self._sdk_client

    def generate(
        self,
        *,
        system: str,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec] = (),
        json_schema: dict[str, Any] | None = None,
    ) -> AssistantMessage:
        """Sends the conversation to Gemini and returns its turn as neutral types."""
        sdk = self._sdk()
        request: dict[str, Any] = {
            "model": self._model,
            "system_instruction": system,
            "input": [step for message in messages for step in _to_steps(message)],
            "store": False,
        }
        if tools:
            request["tools"] = [
                {"type": "function", "name": t.name, "description": t.description, "parameters": t.parameters}
                for t in tools
            ]
        if json_schema is not None:
            request["response_format"] = {
                "type": "text",
                "mime_type": "application/json",
                "schema": json_schema,
            }

        try:
            interaction = sdk.interactions.create(**request)
        except Exception as exc:  # any SDK, HTTP or network error, including timeouts
            logger.error("Gemini request failed (%s): %s", type(exc).__name__, self._redact(str(exc)))
            raise AiUnavailable() from exc
        return self._parse(interaction)

    def _parse(self, interaction: Any) -> AssistantMessage:
        """Turns an Interaction into an AssistantMessage, rejecting failed or empty responses."""
        status = str(getattr(interaction, "status", "") or "")
        if status in _FAILED_STATUSES:
            logger.error(
                "Gemini interaction ended with status %r: %s", status, getattr(interaction, "errors", None)
            )
            raise AiUnavailable()

        steps = list(getattr(interaction, "steps", None) or [])
        calls = tuple(
            ToolCall(id=str(step.id), name=str(step.name), arguments=dict(step.arguments or {}))
            for step in steps
            if getattr(step, "type", None) == "function_call"
        )
        text = str(getattr(interaction, "output_text", None) or "")
        if not calls and not text.strip():
            # Blocked by safety filters, cut off, or simply empty: nothing usable either way.
            logger.error("Gemini returned no text and no tool calls (status %r)", status)
            raise AiUnavailable()
        # The model's own steps go back verbatim on the next call so thought signatures survive.
        state = [_dump_step(step) for step in steps]
        return AssistantMessage(text=text, tool_calls=calls, provider_state=state)

    def _redact(self, text: str) -> str:
        """`text` with the API key masked, in case an error message ever echoes it."""
        return text.replace(self._api_key, "***") if self._api_key else text


def _dump_step(step: Any) -> Any:
    """A response step as the plain dict the API accepts back as input."""
    if getattr(step, "is_unknown", False):
        return step.raw
    return step.model_dump(mode="json", by_alias=True, exclude_none=True)


def _text_step(kind: str, text: str) -> dict[str, Any]:
    """A user_input or model_output step holding one text block."""
    return {"type": kind, "content": [{"type": "text", "text": text}]}


def _to_steps(message: Message) -> list[dict[str, Any]]:
    """One neutral message as Interactions API input steps."""
    if isinstance(message, UserMessage):
        return [_text_step("user_input", message.text)]
    if isinstance(message, ToolResultsMessage):
        return [
            {
                "type": "function_result",
                "call_id": r.call_id,
                "name": r.name,
                "result": [{"type": "text", "text": json.dumps(r.content, default=str)}],
                "is_error": r.is_error,
            }
            for r in message.results
        ]
    if isinstance(message.provider_state, list):
        return list(message.provider_state)
    # An earlier turn rebuilt from the chat history (or produced by another client): plain steps.
    steps = [
        {"type": "function_call", "id": c.id, "name": c.name, "arguments": c.arguments}
        for c in message.tool_calls
    ]
    if message.text:
        steps.insert(0, _text_step("model_output", message.text))
    return steps


# ── FastAPI dependency ──────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _gemini(api_key: str, model: str, timeout_seconds: float) -> GeminiClient:
    """One shared client per configuration, so HTTP connections are reused."""
    return GeminiClient(api_key=api_key, model=model, timeout_seconds=timeout_seconds)


def get_llm_client() -> LLMClient:
    """The configured LLM client. Never fails here: a missing key surfaces as AI_UNAVAILABLE when
    the client is used, so the app starts and every other feature works without one (AI-7)."""
    settings = get_settings()
    return _gemini(settings.llm_api_key, settings.llm_model_name, settings.llm_timeout_seconds)
