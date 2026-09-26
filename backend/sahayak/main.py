"""FastAPI application entry point."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sahayak import __version__
from sahayak.api.errors import register_exception_handlers
from sahayak.api.health import router as health_router
from sahayak.api.websocket import router as websocket_router
from sahayak.config import Settings, get_settings
from sahayak.logging import configure_logging, get_logger
from sahayak.providers.registry import build_provider_registry

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "Sahayak backend starting",
        extra={
            "extra_fields": {
                "environment": app.state.settings.environment.value,
                "version": __version__,
            }
        },
    )
    yield
    logger.info("Sahayak backend shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application."""

    resolved = settings or get_settings()
    configure_logging(resolved)

    app = FastAPI(
        title=resolved.app_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if resolved.environment.value != "production" else None,
        redoc_url=None,
    )
    app.state.settings = resolved
    app.state.providers = build_provider_registry(resolved)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(health_router, prefix=resolved.api_prefix)
    app.include_router(websocket_router)

    return app


app = create_app()
