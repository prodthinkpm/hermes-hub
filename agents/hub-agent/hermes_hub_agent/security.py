"""Security helpers for redaction and safe command reporting."""

from __future__ import annotations

import re
from typing import Any

SENSITIVE_KEY_RE = re.compile(
    r"(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|VKEY)",
    re.IGNORECASE,
)

# Common credential-looking values.  This deliberately stays conservative to
# avoid mangling regular logs too aggressively.
SECRET_VALUE_RE = re.compile(
    r"(?P<prefix>\b[A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Za-z0-9_]*\s*[=:]\s*)(?P<value>[^\s'\"]+)",
    re.IGNORECASE,
)


def is_sensitive_key(key: str) -> bool:
    return bool(SENSITIVE_KEY_RE.search(key))


def redact_text(value: str) -> str:
    return SECRET_VALUE_RE.sub(lambda m: f"{m.group('prefix')}***REDACTED***", value)


def redact_mapping(value: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, item in value.items():
        if is_sensitive_key(str(key)):
            redacted[key] = "***REDACTED***"
        elif isinstance(item, dict):
            redacted[key] = redact_mapping(item)
        elif isinstance(item, list):
            redacted[key] = [redact_mapping(x) if isinstance(x, dict) else x for x in item]
        elif isinstance(item, str):
            redacted[key] = redact_text(item)
        else:
            redacted[key] = item
    return redacted
