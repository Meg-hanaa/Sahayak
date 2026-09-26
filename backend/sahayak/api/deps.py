"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Header, Request

from sahayak.api.errors import InvalidAccessTokenError
from sahayak.services.sessions import SessionService


def get_session_service(request: Request) -> SessionService:
    return request.app.state.session_service


def require_access_token(
    authorization: Annotated[str | None, Header()] = None,
    x_sahayak_access_token: Annotated[str | None, Header(alias="X-Sahayak-Access-Token")] = None,
) -> str:
    """Read a server-issued session token from headers. Role is never taken from the client."""

    if x_sahayak_access_token and x_sahayak_access_token.strip():
        return x_sahayak_access_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    raise InvalidAccessTokenError()
