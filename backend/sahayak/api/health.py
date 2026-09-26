"""Health check routes."""

from __future__ import annotations

from fastapi import APIRouter, Request

from sahayak import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    """Return liveness information for the running application."""

    settings = request.app.state.settings
    return {
        "status": "ok",
        "service": "sahayak",
        "version": __version__,
        "environment": settings.environment.value,
    }
