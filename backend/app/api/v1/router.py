"""Mounts every module router under /api/v1."""

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DbSession
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(users_router)
