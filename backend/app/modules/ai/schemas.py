"""AI request and response schemas. They match the frontend's `features/assistant/types.ts` and
`AiQuota` in `types/models.ts` field for field."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Input limits: keep requests (and the model's input) small.
MAX_CHAT_TURNS = 20
MAX_MESSAGE_LENGTH = 2000
MAX_NAME_LENGTH = 200  # products.name is VARCHAR(200)
MAX_CATEGORY_LENGTH = 200  # "Parent › Child", each name at most 80


class AiQuota(BaseModel):
    """GET /ai/quota and every AI response: requests left in the rolling hour (AI-8)."""

    limit: int
    remaining: int
    # When the oldest counted request expires, freeing one more.
    resets_at: datetime


# ── Chat (AI-1, AI-2) ───────────────────────────────────────────────────────


class ChatTurn(BaseModel):
    """One message of the conversation."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_MESSAGE_LENGTH)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        """Messages can't be empty."""
        value = value.strip()
        if not value:
            raise ValueError("Messages can’t be empty.")
        return value


class ChatRequest(BaseModel):
    """POST /ai/chat: the conversation so far, ending with the user's question."""

    messages: list[ChatTurn] = Field(min_length=1, max_length=MAX_CHAT_TURNS)

    @field_validator("messages")
    @classmethod
    def _ends_with_question(cls, value: list[ChatTurn]) -> list[ChatTurn]:
        """The last message must be the user's question."""
        if value[-1].role != "user":
            raise ValueError("Ask a question first.")
        return value


class ChatSource(BaseModel):
    """Which read-only tool produced data behind an answer."""

    tool: str
    label: str


class ChatRow(BaseModel):
    """A figure shown under the answer."""

    label: str
    value: str


class AssistantMessageOut(BaseModel):
    """The assistant's answer: text, figure rows and the tools it used."""

    role: Literal["assistant"] = "assistant"
    content: str
    rows: list[ChatRow]
    sources: list[ChatSource]


class ChatReply(BaseModel):
    """POST /ai/chat response."""

    message: AssistantMessageOut
    quota: AiQuota


# ── Insights (AI-4) ─────────────────────────────────────────────────────────

FigureTone = Literal["positive", "negative", "warning"]


class InsightsRequest(BaseModel):
    """POST /ai/insights: the period, as inclusive business-local days."""

    start_date: date
    end_date: date


class InsightFigure(BaseModel):
    """A figure computed by IMS."""

    label: str
    value: str
    tone: FigureTone | None


class InsightSection(BaseModel):
    """A paragraph written by the model."""

    heading: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=1200)


class InsightsReport(BaseModel):
    """POST /ai/insights response: figures from SQL, sections from the model."""

    start_date: date
    end_date: date
    figures: list[InsightFigure]
    sections: list[InsightSection]
    generated_at: datetime
    quota: AiQuota


# ── Product description (AI-5) ──────────────────────────────────────────────


class ProductDescriptionRequest(BaseModel):
    """POST /ai/product-description."""

    name: str = Field(max_length=MAX_NAME_LENGTH)
    category: str = Field("", max_length=MAX_CATEGORY_LENGTH)

    @field_validator("name")
    @classmethod
    def _name_given(cls, value: str) -> str:
        """The description is written from the name, so it's required."""
        value = value.strip()
        if not value:
            raise ValueError("Enter a product name first.")
        return value

    @field_validator("category")
    @classmethod
    def _strip(cls, value: str) -> str:
        """Surrounding spaces don't count."""
        return value.strip()


class ProductDescriptionResult(BaseModel):
    """POST /ai/product-description response."""

    description: str
    quota: AiQuota
