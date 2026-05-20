from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from .hermes_imports import default_hermes_home


def discover_profiles(root_hermes_home: str | None = None) -> list[dict[str, Any]]:
    """Discover default profile and named profiles.

    Default profile:
      HERMES_HOME

    Named profiles:
      HERMES_HOME/profiles/*
    """
    root = Path(root_hermes_home or os.environ.get("HERMES_HOME") or default_hermes_home()).expanduser()

    profiles: list[dict[str, Any]] = [
        {
            "name": "default",
            "home": str(root),
            "is_default": True,
        }
    ]

    profiles_dir = root / "profiles"
    if profiles_dir.exists() and profiles_dir.is_dir():
        for child in sorted(profiles_dir.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir():
                continue
            if child.name.startswith("."):
                continue
            profiles.append({
                "name": child.name,
                "home": str(child),
                "is_default": False,
            })

    return profiles


def inspect_profile(profile_home: str, timeout: int = 30) -> dict[str, Any]:
    """Run profile_inspector in a child process with isolated HERMES_HOME."""
    env = os.environ.copy()
    env["HERMES_HOME"] = profile_home
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, "-m", "hermes_hub_agent.profile_inspector"],
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
    )

    if result.returncode != 0:
        return {
            "ok": False,
            "profile_home": profile_home,
            "error": result.stderr or result.stdout or f"Inspector exited with {result.returncode}",
        }

    stdout = (result.stdout or "").strip()
    if not stdout:
        return {
            "ok": False,
            "profile_home": profile_home,
            "error": "Inspector returned empty stdout",
            "stderr": result.stderr,
        }

    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "profile_home": profile_home,
            "error": f"Inspector returned invalid JSON: {exc}",
            "stdout": stdout,
            "stderr": result.stderr,
        }

def flatten_profile_snapshot(discovered: dict[str, Any], inspected: dict[str, Any]) -> dict[str, Any]:
    profile = inspected.get("profile") if isinstance(inspected, dict) else None
    if not isinstance(profile, dict):
        profile = {}

    gateway = profile.get("gateway") or {}

    return {
        "profile_name": discovered["name"],
        "profile_home": discovered["home"],
        "is_default": bool(discovered.get("is_default")),
        "ok": bool(inspected.get("ok")),
        "error": inspected.get("error"),
        "provider": profile.get("provider"),
        "model": profile.get("model"),
        "terminal_cwd": profile.get("terminal_cwd"),
        "has_config": profile.get("has_config", False),
        "has_env": profile.get("has_env", False),
        "has_soul": profile.get("has_soul", False),
        "env_status": profile.get("env_status") or {},
        "gateway_status": derive_gateway_status(gateway),
        "gateway": gateway,
        "sessions_count": profile.get("sessions_count", 0),
        "skills_count": profile.get("skills_count", 0),
        "cron_count": profile.get("cron_count", 0),
        "inspected_at": profile.get("inspected_at"),
        "raw": inspected,
    }


def scan_profiles(root_hermes_home: str | None = None) -> list[dict[str, Any]]:
    """Scan all local Hermes profiles and return flattened snapshots."""
    snapshots: list[dict[str, Any]] = []

    for discovered in discover_profiles(root_hermes_home):
        inspected = inspect_profile(str(discovered["home"]))
        snapshots.append(flatten_profile_snapshot(discovered, inspected))

    return snapshots


def scan_all(root_hermes_home: str | None = None) -> list[dict[str, Any]]:
    """Backward-compatible alias."""
    return scan_profiles(root_hermes_home)


def derive_gateway_status(gateway: Any) -> str:
    if not isinstance(gateway, dict):
        return "unknown"

    runtime = gateway.get("runtime") or {}
    if isinstance(runtime, dict):
        state = runtime.get("gateway_state") or runtime.get("state") or runtime.get("status")
        if state:
            return str(state)

    pid = gateway.get("pid")
    if pid:
        return "running"

    return "stopped"
