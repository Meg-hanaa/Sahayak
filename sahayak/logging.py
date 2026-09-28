"""Structured JSON logging for the Sahayak backend."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from sahayak.config import Settings

_CONFIGURED = False


import re

_SENSITIVE_KEY_SUBSTRINGS = (
    "token",
    "secret",
    "api_key",
    "apikey",
    "password",
    "authorization",
    "auth",
    "token_hash",
    "access_token",
    "private_key",
    "client_secret",
)

_BEARER_PATTERN = re.compile(r"(bearer\s+)[a-zA-Z0-9_\-\.]+", re.IGNORECASE)
_PARAM_PATTERN = re.compile(r"((?:api[_-]?key|secret|token|password)=)[^\s&]+", re.IGNORECASE)


def sanitize_sensitive_data(data: Any) -> Any:
    """Recursively redact sensitive key-values and tokens from logs."""
    if isinstance(data, dict):
        sanitized: dict[str, Any] = {}
        for k, v in data.items():
            key_lower = str(k).lower()
            if any(sub in key_lower for sub in _SENSITIVE_KEY_SUBSTRINGS):
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = sanitize_sensitive_data(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_sensitive_data(item) for item in data]
    elif isinstance(data, str):
        s = _BEARER_PATTERN.sub(r"\1[REDACTED]", data)
        return _PARAM_PATTERN.sub(r"\1[REDACTED]", s)
    return data


class JsonLogFormatter(logging.Formatter):
    """Format log records as single-line JSON objects with automatic secret redaction."""

    def format(self, record: logging.LogRecord) -> str:
        raw_msg = record.getMessage()
        safe_msg = sanitize_sensitive_data(raw_msg)
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": safe_msg,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(sanitize_sensitive_data(extra))
        return json.dumps(payload, default=str)


def configure_logging(settings: Settings) -> None:
    """Configure the root logger once for the process."""

    global _CONFIGURED
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a named logger."""

    return logging.getLogger(name)
