"""Application errors, rendered as `{ "detail": "message", "code": "ERROR_CODE" }`."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"
    detail = "The request could not be processed."

    def __init__(self, detail: str | None = None, code: str | None = None, status_code: int | None = None):
        self.detail = detail or self.detail
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        super().__init__(self.detail)


class NotAuthenticated(AppError):
    status_code = 401
    code = "NOT_AUTHENTICATED"
    detail = "Your session has ended. Sign in again."


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"
    detail = "Only admins can do this."


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"
    detail = "Not found."


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"
    detail = "This conflicts with existing data."


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    detail = "Some fields are invalid."


class UpstreamError(AppError):
    status_code = 502
    code = "UPSTREAM_ERROR"
    detail = "A connected service failed. Try again."


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return ValidationFailed.detail
    first = errors[0]
    if first.get("type") == "json_invalid":
        return "Request body must be valid JSON."
    if first.get("type") == "value_error":
        # Our own validators raise ValueError with a ready-to-show sentence.
        return str(first.get("ctx", {}).get("error") or first.get("msg"))
    field = next((part for part in reversed(first.get("loc", ())) if isinstance(part, str)), "")
    message = str(first.get("msg", "Invalid value"))
    return f"{field}: {message}" if field and field != "body" else message


_HTTP_CODES = {401: "NOT_AUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.detail, exc.code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _error(422, _validation_message(exc), "VALIDATION_ERROR")

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, str(exc.detail), _HTTP_CODES.get(exc.status_code, "HTTP_ERROR"))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return _error(500, "Unexpected server error.", "INTERNAL_ERROR")
