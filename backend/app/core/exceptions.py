"""Application errors, rendered as `{ "detail": "message", "code": "ERROR_CODE" }`."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for errors the API reports to the client. Subclasses set the status and code."""

    status_code = 400
    code = "BAD_REQUEST"
    detail = "The request could not be processed."

    def __init__(self, detail: str | None = None, code: str | None = None, status_code: int | None = None):
        """Lets a raise site override the default message, code or status."""
        self.detail = detail or self.detail
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        super().__init__(self.detail)


class NotAuthenticated(AppError):
    """401: no token, a bad or expired token, or an inactive account."""

    status_code = 401
    code = "NOT_AUTHENTICATED"
    detail = "Your session has ended. Sign in again."


class Forbidden(AppError):
    """403: signed in, but the role isn't allowed to do this."""

    status_code = 403
    code = "FORBIDDEN"
    detail = "Only admins can do this."


class NotFound(AppError):
    """404: the record doesn't exist."""

    status_code = 404
    code = "NOT_FOUND"
    detail = "Not found."


class Conflict(AppError):
    """409: the request clashes with the current data (e.g. not enough stock, a taken SKU)."""

    status_code = 409
    code = "CONFLICT"
    detail = "This conflicts with existing data."


class ValidationFailed(AppError):
    """422: the input is invalid."""

    status_code = 422
    code = "VALIDATION_ERROR"
    detail = "Some fields are invalid."


class UpstreamError(AppError):
    """502: a service the API depends on (e.g. Supabase Auth) failed."""

    status_code = 502
    code = "UPSTREAM_ERROR"
    detail = "A connected service failed. Try again."


class RateLimited(AppError):
    """429: the user has used up their requests for the current window (AI-8)."""

    status_code = 429
    code = "RATE_LIMITED"
    detail = "Too many requests. Try again later."


class AiUnavailable(AppError):
    """503: the LLM provider failed, timed out, refused or isn't configured (AI-7). The message is
    always generic; the provider's own error is only logged."""

    status_code = 503
    code = "AI_UNAVAILABLE"
    detail = "The AI service isn’t responding. Try again in a moment."


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    """Builds the standard `{detail, code}` JSON error response."""
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _validation_message(exc: RequestValidationError) -> str:
    """Turns Pydantic's validation errors into one sentence for the UI."""
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
    """Makes every error, expected or not, come back in the `{detail, code}` format."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        """Our own errors: their status, message and code as raised."""
        return _error(exc.status_code, exc.detail, exc.code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        """Request validation errors: 422 with the first problem."""
        return _error(422, _validation_message(exc), "VALIDATION_ERROR")

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Framework errors such as 404 for an unknown route or 405."""
        return _error(exc.status_code, str(exc.detail), _HTTP_CODES.get(exc.status_code, "HTTP_ERROR"))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        """Bugs: logged with the traceback; the client only sees a generic 500."""
        logger.exception("Unhandled error", exc_info=exc)
        return _error(500, "Unexpected server error.", "INTERNAL_ERROR")
