from __future__ import annotations

import json
import os
import time
import traceback
from pathlib import Path
from typing import Any

from .hermes_imports import prepare_hermes_imports


def safe_call(fn, default: Any = None) -> Any:
    try:
        return fn()
    except Exception:
        return default


def make_json_safe(value: Any) -> Any:
    """Best-effort conversion of arbitrary Hermes objects to JSON-safe data."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, dict):
        return {str(k): make_json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [make_json_safe(v) for v in value]

    if hasattr(value, "model_dump"):
        try:
            return make_json_safe(value.model_dump())
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        try:
            return make_json_safe(vars(value))
        except Exception:
            pass

    return str(value)


def env_status(env: dict[str, Any]) -> dict[str, str]:
    """Return only set/missing, never secret values."""
    return {str(key): "set" if value else "missing" for key, value in env.items()}


def extract_provider(config: dict[str, Any]) -> str | None:
    model = config.get("model")
    if isinstance(model, dict):
        provider = model.get("provider")
        if provider:
            return str(provider)

    provider = config.get("provider")
    return str(provider) if provider else None


def extract_model(config: dict[str, Any]) -> str | None:
    model = config.get("model")
    if isinstance(model, dict):
        value = model.get("default") or model.get("model") or model.get("name")
        return str(value) if value else None

    if isinstance(model, str):
        return model

    value = config.get("default")
    return str(value) if value else None


def extract_terminal_cwd(config: dict[str, Any]) -> str | None:
    terminal = config.get("terminal")
    if isinstance(terminal, dict):
        cwd = terminal.get("cwd")
        return str(cwd) if cwd else None
    return None


def count_children(path: Path) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    return sum(1 for child in path.iterdir() if not child.name.startswith("."))


def get_session_summary() -> tuple[int, list[dict[str, Any]], str | None]:
    """Return sessions_count, recent_sessions, error."""
    try:
        from hermes_state import SessionDB

        db = SessionDB()
        try:
            count = int(db.session_count())
            sessions = db.list_sessions_rich(limit=20, offset=0)
            return count, make_json_safe(sessions), None
        finally:
            close = getattr(db, "close", None)
            if callable(close):
                close()
    except Exception as exc:
        return 0, [], str(exc)


def inspect_current_profile() -> dict[str, Any]:
    hermes_home = os.environ.get("HERMES_HOME")
    import_diag = prepare_hermes_imports(hermes_home)

    from hermes_cli.config import (
        check_config_version,
        get_config_path,
        get_env_path,
        get_hermes_home,
        load_config,
        load_env,
    )
    from gateway.status import get_running_pid, read_runtime_status

    home = Path(get_hermes_home())

    config_raw = safe_call(load_config, {}) or {}
    env_raw = safe_call(load_env, {}) or {}

    config = make_json_safe(config_raw)
    env = make_json_safe(env_raw)

    config_version = None
    latest_config_version = None
    try:
        version_result = check_config_version()
        if isinstance(version_result, tuple):
            if len(version_result) >= 1:
                config_version = version_result[0]
            if len(version_result) >= 2:
                latest_config_version = version_result[1]
        else:
            config_version = version_result
    except Exception:
        pass

    sessions_count, recent_sessions, sessions_error = get_session_summary()

    config_path = Path(get_config_path())
    env_path = Path(get_env_path())
    soul_path = home / "SOUL.md"
    skills_dir = home / "skills"
    cron_dir = home / "cron"

    return {
        "profile_home": str(home),
        "config_path": str(config_path),
        "env_path": str(env_path),
        "soul_path": str(soul_path),
        "has_config": config_path.exists(),
        "has_env": env_path.exists(),
        "has_soul": soul_path.exists(),
        "config_version": make_json_safe(config_version),
        "latest_config_version": make_json_safe(latest_config_version),
        "config": config,
        "provider": extract_provider(config) if isinstance(config, dict) else None,
        "model": extract_model(config) if isinstance(config, dict) else None,
        "terminal_cwd": extract_terminal_cwd(config) if isinstance(config, dict) else None,
        "env_status": env_status(env if isinstance(env, dict) else {}),
        "gateway": {
            "pid": safe_call(get_running_pid),
            "runtime": make_json_safe(safe_call(read_runtime_status, {})),
        },
        "sessions_count": sessions_count,
        "recent_sessions": recent_sessions,
        "sessions_error": sessions_error,
        "skills_count": count_children(skills_dir),
        "cron_count": count_children(cron_dir),
        "import": import_diag,
        "inspected_at": int(time.time()),
    }


def main() -> None:
    try:
        print(json.dumps({
            "ok": True,
            "profile": inspect_current_profile(),
        }, ensure_ascii=False, default=str))
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
