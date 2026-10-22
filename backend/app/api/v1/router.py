"""Mounts every module router under /api/v1."""

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DbSession
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.categories.router import router as categories_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.exports.router import router as exports_router
from app.modules.invoices.router import router as invoices_router
from app.modules.products.router import router as products_router
from app.modules.settings.router import router as settings_router
from app.modules.stock.router import router as stock_router
from app.modules.users.router import router as users_router

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
def health(db: DbSession) -> dict[str, str]:
    """Liveness check that also proves the database answers."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(categories_router)
api_router.include_router(products_router)
api_router.include_router(stock_router)
api_router.include_router(invoices_router)
api_router.include_router(exports_router)
api_router.include_router(dashboard_router)
api_router.include_router(settings_router)
api_router.include_router(ai_router)
