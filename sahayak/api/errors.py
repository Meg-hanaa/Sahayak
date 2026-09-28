"""API error types and FastAPI exception handlers."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class SahayakError(Exception):
    """Application-level error with a stable machine-readable code."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "sahayak_error",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class SessionNotFoundError(SahayakError):
    def __init__(self) -> None:
        super().__init__("Session not found", code="session_not_found", status_code=status.HTTP_404_NOT_FOUND)


class SessionExpiredError(SahayakError):
    def __init__(self) -> None:
        super().__init__("Session has expired", code="session_expired", status_code=status.HTTP_410_GONE)


class InvalidAccessTokenError(SahayakError):
    def __init__(self) -> None:
        super().__init__(
            "Invalid or missing session access token",
            code="invalid_access_token",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class InvalidRoleError(SahayakError):
    def __init__(self, message: str = "Invalid participant role") -> None:
        super().__init__(message, code="invalid_role", status_code=status.HTTP_400_BAD_REQUEST)


class DuplicateParticipantError(SahayakError):
    def __init__(self) -> None:
        super().__init__(
            "A participant with this role has already joined the session",
            code="duplicate_participant",
            status_code=status.HTTP_409_CONFLICT,
        )


class InvalidStateTransitionError(SahayakError):
    def __init__(self, message: str = "Invalid session state transition") -> None:
        super().__init__(message, code="invalid_state_transition", status_code=status.HTTP_409_CONFLICT)


class ForbiddenSessionActionError(SahayakError):
    def __init__(self, message: str = "Not allowed for this participant") -> None:
        super().__init__(message, code="forbidden_session_action", status_code=status.HTTP_403_FORBIDDEN)


class ConfirmationNotAllowedError(SahayakError):
    def __init__(self, message: str = "Confirmation is not allowed for this turn or state") -> None:
        super().__init__(message, code="confirmation_not_allowed", status_code=status.HTTP_400_BAD_REQUEST)



def error_payload(*, code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    """Build a consistent error response body."""

    payload: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return payload


async def sahayak_error_handler(_request: Request, exc: SahayakError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code=exc.code, message=exc.message, details=exc.details),
    )


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "HTTP error"
    details = exc.detail if not isinstance(exc.detail, str) else None
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code="http_error", message=message, details=details),
    )


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_payload(
            code="validation_error",
            message="Request validation failed",
            details=exc.errors(),
        ),
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", extra={"extra_fields": {"error_type": type(exc).__name__}})
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_payload(
            code="internal_error",
            message="An unexpected error occurred",
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach consistent JSON error handlers to the application."""

    app.add_exception_handler(SahayakError, sahayak_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
