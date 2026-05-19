"""Hermes profile discovery and summary extraction."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def default_hermes_home() -> Path:
    configured = os.environ.get("HERMES_HOME")
    if configured:
        return Path(configured).expanduser()

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidate = Path(local_app_data) / "hermes"
        if candidate.exists():
            return candidate

    return Path.home() / ".hermes"


def read_yaml_scalar(config_path: Path, key: str) -> str | None:
    if not config_path.exists():
        return None
    try:
        for line in config_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped.startswith(f"{key}:"):
                continue
            value = stripped.split(":", 1)[1].strip()
            if value.startswith(("'", '"')) and value.endswith(("'", '"')):
                value = value[1:-1]
            return value or None
    except OSError:
        return None
    return None


def read_nested_model(config_path: Path) -> tuple[str | None, str | None]:
    if not config_path.exists():
        return None, None
    try:
        lines = config_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None, None

    provider: str | None = None
    model: str | None = None
    in_model = False
    for line in lines:
        stripped = line.strip()
        if not in_model and stripped.startswith("model:") and stripped != "model:":
            value = stripped.split(":", 1)[1].strip().strip("'\"")
            return None, value or None
        if stripped == "model:":
            in_model = True
            continue
        if in_model and line and not line.startswith((" ", "\t")):
            break
        if stripped.startswith("provider:"):
            provider = stripped.split(":", 1)[1].strip().strip("'\"") or None
        if stripped.startswith("default:"):
            model = stripped.split(":", 1)[1].strip().strip("'\"") or None
    return provider, model


def count_files(path: Path, suffixes: tuple[str, ...] | None = None) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    total = 0
    for child in path.rglob("*"):
        if not child.is_file():
            continue
        if suffixes and child.suffix.lower() not in suffixes:
            continue
        total += 1
    return total


def has_profile_marker(profile_home: Path) -> bool:
    markers = ["config.yaml", ".env", "SOUL.md", "sessions", "logs", "skills"]
    return any((profile_home / marker).exists() for marker in markers)


def profile_summary(profile_name: str, profile_home: Path) -> dict[str, Any]:
    config_path = profile_home / "config.yaml"
    provider, model = read_nested_model(config_path)
    setup_status = "ready" if config_path.exists() else "needs_setup"
    gateway_state_path = profile_home / "gateway_state.json"
    gateway_status = "stopped"
    gateway_state = {}
    if gateway_state_path.exists():
        try:
            gateway_state = json.loads(gateway_state_path.read_text(encoding="utf-8"))
            raw_state = str(gateway_state.get("gateway_state", "")).lower()
            gateway_status = "running" if raw_state == "running" else raw_state or "unknown"
        except (OSError, json.JSONDecodeError):
            gateway_status = "unknown"
    print(gateway_state)
    return {
        "profile_name": profile_name,
        "profile_home": str(profile_home),
        "provider": provider,
        "model": model,
        "terminal_cwd": read_yaml_scalar(config_path, "cwd"),
        "setup_status": setup_status,
        "gateway_status": gateway_status,
        "gateway": gateway_state,
        "api_server_status": "unknown",
        "has_env": (profile_home / ".env").exists(),
        "has_soul": (profile_home / "SOUL.md").exists(),
        "sessions_count": count_files(profile_home / "sessions"),
        "skills_count": count_files(profile_home / "skills", (".md",)),
        "cron_count": count_files(profile_home / "cron"),
    }


def scan_profiles(hermes_home: Path) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    if hermes_home.exists() and has_profile_marker(hermes_home):
        profiles.append(profile_summary("default", hermes_home))

    profiles_dir = hermes_home / "profiles"
    if profiles_dir.exists() and profiles_dir.is_dir():
        for child in sorted(profiles_dir.iterdir(), key=lambda item: item.name.lower()):
            if child.is_dir() and has_profile_marker(child):
                profiles.append(profile_summary(child.name, child))

    return profiles
