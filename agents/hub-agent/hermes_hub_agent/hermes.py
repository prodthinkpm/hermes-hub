"""Hermes CLI execution helpers."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any


def truncate_output(value: str, limit: int = 20_000) -> str:
    if len(value) <= limit:
        return value
    return value[-limit:]


def hermes_candidates() -> list[str]:
    configured = os.environ.get("HERMES_BIN", "").strip()
    candidates: list[str] = []
    if configured:
        candidates.append(configured)
    if os.name == "nt":
        candidates.extend(["hermes.cmd", "hermes.exe", "hermes"])
    else:
        candidates.append("hermes")
    return list(dict.fromkeys(candidates))


def run_hermes(args: list[str], hermes_home: Path, timeout: int = 300) -> dict[str, Any]:
    env = os.environ.copy()
    env["HERMES_HOME"] = str(hermes_home)
    candidates = hermes_candidates()
    last_error = ""
    for command in candidates:
        try:
            completed = subprocess.run(
                [command, *args],
                env=env,
                text=True,
                capture_output=True,
                timeout=timeout,
                shell=False,
            )
            return {
                "ok": completed.returncode == 0,
                "stdout": truncate_output(completed.stdout or ""),
                "stderr": truncate_output(completed.stderr or ""),
                "returncode": completed.returncode,
                "command": command,
            }
        except FileNotFoundError as exc:
            last_error = str(exc)
            continue
        except subprocess.TimeoutExpired as exc:
            return {
                "ok": False,
                "stdout": truncate_output(exc.stdout or ""),
                "stderr": truncate_output(exc.stderr or "Hermes command timed out"),
                "returncode": None,
                "command": command,
            }
    return {
        "ok": False,
        "stdout": "",
        "stderr": f"Hermes CLI not found. Tried: {', '.join(candidates)}. {last_error}",
        "returncode": None,
        "command": candidates[0] if candidates else "hermes",
    }
