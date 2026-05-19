"""Profile-scoped file command handlers."""

from __future__ import annotations

import json
import re
import shutil
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hermes_hub_agent.hermes import truncate_output


ENV_KEY_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def failed(message: str) -> dict[str, Any]:
    return {"ok": False, "stdout": "", "stderr": message}


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_profile_home(hermes_home: Path, profile_home: Path) -> tuple[bool, Path, str]:
    root = hermes_home.expanduser().resolve()
    profiles_root = (root / "profiles").resolve()
    target = profile_home.expanduser().resolve()
    if target == root or _is_relative_to(target, profiles_root):
        return True, target, ""
    return False, target, f"profile_home must be inside {root} or {profiles_root}"


def target_profile_home(hermes_home: Path, payload: dict[str, Any]) -> tuple[bool, Path, str]:
    raw = payload.get("profile_home")
    target = Path(raw) if isinstance(raw, str) and raw.strip() else hermes_home
    return validate_profile_home(hermes_home, target)


def backup_file(path: Path, suffix: str, profile_name: str) -> None:
    if not path.exists():
        return
    backup_dir = Path.home() / ".hermes-hub" / "backups" / profile_name
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    dest = backup_dir / f"{path.name}.{ts}{suffix}"
    shutil.copy2(path, dest)


def handle_logs_tail(target_home: Path, payload: dict[str, Any]) -> dict[str, Any]:
    lines = payload.get("lines", 100)
    if not isinstance(lines, int) or lines <= 0:
        lines = 100
    log_file = target_home / "logs" / "hermes.log"
    if log_file.exists():
        try:
            content = "\n".join(
                deque(
                    log_file.read_text(encoding="utf-8", errors="replace").splitlines(),
                    maxlen=lines,
                )
            )
        except OSError:
            content = "(log file read error)"
    else:
        content = "(no log file)"
    return {"ok": True, "stdout": truncate_output(content), "stderr": ""}


def handle_config_read(target_home: Path) -> dict[str, Any]:
    config_path = target_home / "config.yaml"
    if not config_path.exists():
        return failed("config.yaml not found")
    try:
        content = config_path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return failed(f"Failed to read config.yaml: {exc}")
    return {"ok": True, "stdout": truncate_output(content), "stderr": ""}


def handle_config_patch(target_home: Path, payload: dict[str, Any]) -> dict[str, Any]:
    content = payload.get("content", "")
    if not isinstance(content, str):
        return failed("content is required")
    config_path = target_home / "config.yaml"
    try:
        backup_file(config_path, ".yaml.bak", target_home.name)
        config_path.write_text(content, encoding="utf-8")
    except OSError as exc:
        return failed(f"Failed to write config.yaml: {exc}")
    return {"ok": True, "stdout": "config.yaml updated", "stderr": ""}


def handle_soul_read(target_home: Path) -> dict[str, Any]:
    soul_path = target_home / "SOUL.md"
    if not soul_path.exists():
        return {"ok": True, "stdout": "", "stderr": ""}
    try:
        content = soul_path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return failed(f"Failed to read SOUL.md: {exc}")
    return {"ok": True, "stdout": truncate_output(content), "stderr": ""}


def handle_soul_update(target_home: Path, payload: dict[str, Any]) -> dict[str, Any]:
    content = payload.get("content", "")
    if not isinstance(content, str):
        return failed("content is required")
    soul_path = target_home / "SOUL.md"
    try:
        backup_file(soul_path, ".md.bak", target_home.name)
        soul_path.write_text(content, encoding="utf-8")
    except OSError as exc:
        return failed(f"Failed to write SOUL.md: {exc}")
    return {"ok": True, "stdout": "SOUL.md updated", "stderr": ""}


def handle_skills_list(target_home: Path) -> dict[str, Any]:
    skills_dir = target_home / "skills"
    if skills_dir.is_dir():
        try:
            names = [p.stem for p in skills_dir.glob("*.md") if p.is_file()]
        except OSError:
            names = []
    else:
        names = []
    return {"ok": True, "stdout": json.dumps(names), "stderr": ""}


def handle_env_status(target_home: Path) -> dict[str, Any]:
    env_path = target_home / ".env"
    keys: list[str] = []
    if env_path.exists():
        try:
            for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    keys.append(line.split("=", 1)[0].strip())
        except OSError:
            pass
    return {"ok": True, "stdout": json.dumps(keys), "stderr": ""}


def handle_env_set(target_home: Path, payload: dict[str, Any]) -> dict[str, Any]:
    key = payload.get("key")
    value = payload.get("value")
    if not isinstance(key, str) or not key.strip():
        return failed("key is required")
    key = key.strip()
    if not ENV_KEY_RE.match(key):
        return failed("key must match ^[A-Z_][A-Z0-9_]*$")
    if not isinstance(value, str):
        return failed("value is required")
    if "\n" in value or "\r" in value:
        return failed("value must not contain newlines")

    env_path = target_home / ".env"
    env_lines: list[str] = []
    found = False
    if env_path.exists():
        try:
            env_lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError as exc:
            return failed(f"Failed to read .env: {exc}")
    out_lines: list[str] = []
    for line in env_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            line_key = stripped.split("=", 1)[0].strip()
            if line_key == key:
                out_lines.append(f"{key}={value}")
                found = True
                continue
        out_lines.append(line)
    if not found:
        out_lines.append(f"{key}={value}")
    try:
        backup_file(env_path, ".env.bak", target_home.name)
        env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    except OSError as exc:
        return failed(f"Failed to write .env: {exc}")
    return {"ok": True, "stdout": f"env {key} set", "stderr": ""}


def handle_env_delete(target_home: Path, payload: dict[str, Any]) -> dict[str, Any]:
    key = payload.get("key")
    if not isinstance(key, str) or not key.strip():
        return failed("key is required")
    key = key.strip()
    if not ENV_KEY_RE.match(key):
        return failed("key must match ^[A-Z_][A-Z0-9_]*$")

    env_path = target_home / ".env"
    if not env_path.exists():
        return {"ok": True, "stdout": ".env not found, nothing to delete", "stderr": ""}
    try:
        env_lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        return failed(f"Failed to read .env: {exc}")

    out_lines: list[str] = []
    for line in env_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            line_key = stripped.split("=", 1)[0].strip()
            if line_key == key:
                continue
        out_lines.append(line)
    try:
        backup_file(env_path, ".env.bak", target_home.name)
        env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    except OSError as exc:
        return failed(f"Failed to write .env: {exc}")
    return {"ok": True, "stdout": f"env {key} deleted", "stderr": ""}
