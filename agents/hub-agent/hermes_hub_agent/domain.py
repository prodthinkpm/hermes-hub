"""Domain objects for Hermes Hub Agent runtime.

This module keeps wire-level dictionaries at the edge of the agent and gives the
rest of the runtime small, typed objects to work with.  It intentionally avoids
third-party dependencies so the agent remains lightweight.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class CommandValidationError(ValueError):
    """Raised when a Hub command cannot be normalized into a domain object."""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass(frozen=True)
class CommandEnvelope:
    """A normalized command received from the Hub controller."""

    id: str
    type: str
    payload: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "CommandEnvelope":
        command_id = raw.get("id")
        command_type = raw.get("type")
        payload = raw.get("payload", {})
        if not isinstance(command_id, str) or not command_id:
            raise CommandValidationError("command id must be a non-empty string")
        if not isinstance(command_type, str) or not command_type:
            raise CommandValidationError("command type must be a non-empty string")
        if not isinstance(payload, dict):
            raise CommandValidationError("command payload must be an object")
        return cls(id=command_id, type=command_type, payload=payload)

    @property
    def timeout_seconds(self) -> int:
        value = self.payload.get("timeoutSeconds", 300)
        return int(value) if isinstance(value, (int, float)) and value > 0 else 300

    @property
    def profile_name(self) -> str:
        value = self.payload.get("profile_name")
        return value if isinstance(value, str) else ""


@dataclass(frozen=True)
class CommandContext:
    """Execution context resolved by the runtime before a handler is invoked."""

    hermes_home: Path
    target_home: Path
    timeout_seconds: int


@dataclass
class CommandExecutionResult:
    """Internal execution result returned by command handlers."""

    ok: bool
    stdout: str = ""
    stderr: str = ""
    returncode: int | None = None
    command: str | None = None
    data: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def failed(cls, message: str) -> "CommandExecutionResult":
        return cls(ok=False, stdout="", stderr=message)

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "CommandExecutionResult":
        return cls(
            ok=bool(value.get("ok")),
            stdout=str(value.get("stdout", "")),
            stderr=str(value.get("stderr", "")),
            returncode=value.get("returncode") if isinstance(value.get("returncode"), int) else None,
            command=value.get("command") if isinstance(value.get("command"), str) else None,
            data=value.get("result") if isinstance(value.get("result"), dict) else {},
        )

    def to_mapping(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "ok": self.ok,
            "stdout": self.stdout,
            "stderr": self.stderr,
        }
        if self.returncode is not None:
            result["returncode"] = self.returncode
        if self.command:
            result["command"] = self.command
        if self.data:
            result["result"] = self.data
        return result
