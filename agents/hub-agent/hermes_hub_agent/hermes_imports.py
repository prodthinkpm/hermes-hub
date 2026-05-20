from __future__ import annotations

import os
import sys
from pathlib import Path


def default_hermes_home() -> str:
    """Return a reasonable default HERMES_HOME for the current platform."""
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            return str(Path(local_app_data) / "hermes")
    return str(Path.home() / ".hermes")


def candidate_hermes_repos(hermes_home: str | None = None) -> list[Path]:
    """Return possible hermes-agent source checkout locations."""
    candidates: list[Path] = []

    explicit_repo = os.environ.get("HERMES_AGENT_REPO")
    if explicit_repo:
        candidates.append(Path(explicit_repo).expanduser())

    if hermes_home:
        candidates.append(Path(hermes_home).expanduser() / "hermes-agent")

    env_home = os.environ.get("HERMES_HOME")
    if env_home:
        candidates.append(Path(env_home).expanduser() / "hermes-agent")

    candidates.append(Path(default_hermes_home()) / "hermes-agent")
    candidates.append(Path.home() / ".hermes" / "hermes-agent")

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[Path] = []
    for item in candidates:
        key = str(item.resolve()) if item.exists() else str(item)
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return unique


def prepare_hermes_imports(hermes_home: str | None = None) -> dict[str, str | bool | None]:
    """Make hermes-agent internal Python modules importable.

    Supported layouts:
    1. hermes-agent installed in the current Python environment.
    2. source checkout at $HERMES_AGENT_REPO.
    3. source checkout at <HERMES_HOME>/hermes-agent.

    Returns a small diagnostic dict.
    """
    for candidate in candidate_hermes_repos(hermes_home):
        if (candidate / "hermes_cli").exists():
            path = str(candidate)
            if path not in sys.path:
                sys.path.insert(0, path)
            return {
                "ok": True,
                "mode": "source",
                "path": path,
            }

    # If hermes-agent is installed into site-packages, no sys.path change is needed.
    return {
        "ok": True,
        "mode": "installed-or-unknown",
        "path": None,
    }
