"""AI endpoints (PRD §6.8): POST /ai/chat, /ai/insights, /ai/product-description and GET /ai/quota.

Any signed-in user may use them (PRD §8: "All"), within the hourly limit (AI-8). A provider failure
answers 503 AI_UNAVAILABLE and isn't counted; the limit answers 429 RATE_LIMITED.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.modules.ai import service
from app.modules.ai.client import LLMClient, get_llm_client
from app.modules.ai.schemas import (
    AiQuota,
    ChatReply,
    ChatRequest,
    InsightsReport,
    InsightsRequest,
    ProductDescriptionRequest,
    ProductDescriptionResult,
)

router = APIRouter(prefix="/ai", tags=["ai"])

Llm = Annotated[LLMClient, Depends(get_llm_client)]


@router.get("/quota", response_model=AiQuota)
def quota(db: DbSession, user: CurrentUser) -> AiQuota:
    """AI-8: how many AI requests the user has left this hour."""
    return service.get_quota(db, user)


@router.post("/chat", response_model=ChatReply)
def chat(data: ChatRequest, db: DbSession, user: CurrentUser, llm: Llm) -> ChatReply:
    """AI-1, AI-2: answers the last question using read-only tools."""
    return service.chat(db, user, llm, data)


@router.post("/insights", response_model=InsightsReport)
def insights(data: InsightsRequest, db: DbSession, user: CurrentUser, llm: Llm) -> InsightsReport:
    """AI-4: a short written report on the period's figures, which IMS computes."""
    return service.insights(db, user, llm, data)


@router.post("/product-description", response_model=ProductDescriptionResult)
def product_description(
    data: ProductDescriptionRequest, db: DbSession, user: CurrentUser, llm: Llm
) -> ProductDescriptionResult:
    """AI-5: a draft description from a product's name and category."""
    return service.product_description(db, user, llm, data)
