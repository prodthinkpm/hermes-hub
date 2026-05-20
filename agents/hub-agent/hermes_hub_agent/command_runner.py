from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .heartbeat import AgentConfig
from .hermes_imports import prepare_hermes_imports
from .hub_client import HubClient
from .scanner import inspect_profile, scan_profiles


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CommandRunner:
    """Poll Hub commands and execute local whitelisted operations."""

    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.client = HubClient(config)
        self._closed = False

    def close(self) -> None:
        self._closed = True
        self.client.close()

    def loop(self) -> None:
        while not self._closed:
            try:
                result = self.poll_once()
                if result.get("commands_count", 0):
                    print(f"[hub-agent] command result: {json.dumps(result, ensure_ascii=False, default=str)}", flush=True)
            except Exception as exc:
                print(f"[hub-agent] command runner exception: {exc}", flush=True)

            time.sleep(self.config.poll_interval_seconds)

    def poll_once(self) -> dict[str, Any]:
        polled = self.client.poll_commands(self.config.node_id)

        if not polled.get("ok", True):
            return polled

        commands = polled.get("commands") or []
        if not isinstance(commands, list):
            return {"ok": False, "error": "poll_commands response.commands must be a list"}

        results: list[dict[str, Any]] = []

        for command in commands:
            if not isinstance(command, dict):
                results.append({"ok": False, "error": "invalid command payload", "command": command})
                continue

            command_id = str(command.get("id") or "")
            command_type = str(command.get("type") or "")

            if not command_id:
                results.append({"ok": False, "error": "command missing id", "command": command})
                continue

            self.client.mark_command_started(self.config.node_id, command_id)
            result = self.run_command(command)
            report_response = self.client.report_command_result(self.config.node_id, command_id, result)

            results.append({
                "command_id": command_id,
                "type": command_type,
                "status": result.get("status"),
                "report_ok": report_response.get("ok", True),
                "report_error": report_response.get("error"),
            })

        return {
            "ok": True,
            "commands_count": len(commands),
            "results": results,
        }

    # ── dispatch ──────────────────────────────────────────────────────

    def run_command(self, command: dict[str, Any]) -> dict[str, Any]:
        started_at = now_iso()

        try:
            command_type = str(command.get("type") or "")
            payload = command.get("payload") or {}

            if not isinstance(payload, dict):
                raise ValueError("command.payload must be an object")

            # -- read-only queries --

            if command_type == "profile.scan":
                return success_result(self.command_profile_scan(payload), started_at)

            if command_type == "config.read":
                return success_result(self.command_config_read(payload), started_at)

            if command_type == "env.status":
                return success_result(self.command_env_status(payload), started_at)

            if command_type == "soul.read":
                return success_result(self.command_soul_read(payload), started_at)

            if command_type == "gateway.status":
                return success_result(self.command_gateway_status(payload), started_at)

            if command_type == "sessions.list":
                return success_result(self.command_sessions_list(payload), started_at)

            if command_type == "skills.list":
                return success_result(self.command_skills_list(payload), started_at)

            # -- write / destructive commands --

            if command_type == "profile.create":
                return success_result(self.command_profile_create(payload), started_at)

            if command_type == "profile.rename":
                return success_result(self.command_profile_rename(payload), started_at)

            if command_type == "profile.delete":
                return success_result(self.command_profile_delete(payload), started_at)

            if command_type == "setup.run":
                return success_result(self.command_setup_run(payload), started_at)

            if command_type == "doctor.run":
                return success_result(self.command_doctor_run(payload), started_at)

            if command_type == "gateway.start":
                return success_result(self.command_gateway_start(payload), started_at)

            if command_type == "gateway.stop":
                return success_result(self.command_gateway_stop(payload), started_at)

            if command_type == "gateway.restart":
                return success_result(self.command_gateway_restart(payload), started_at)

            if command_type == "config.patch":
                return success_result(self.command_config_patch(payload), started_at)

            if command_type == "soul.update":
                return success_result(self.command_soul_update(payload), started_at)

            if command_type == "env.set":
                return success_result(self.command_env_set(payload), started_at)

            if command_type == "env.delete":
                return success_result(self.command_env_delete(payload), started_at)

            if command_type == "logs.tail":
                return success_result(self.command_logs_tail(payload), started_at)

            return failed_result(f"Unsupported command type: {command_type}", started_at)

        except Exception as exc:
            return {
                "status": "failed",
                "stdout": "",
                "stderr": traceback.format_exc(),
                "error": str(exc),
                "started_at": started_at,
                "finished_at": now_iso(),
            }

    # ── read-only handlers ────────────────────────────────────────────

    def command_profile_scan(self, payload: dict[str, Any]) -> dict[str, Any]:
        hermes_home = (
            payload.get("hermes_home")
            or payload.get("root_hermes_home")
            or self.config.hermes_home
            or os.environ.get("HERMES_HOME")
        )

        if not hermes_home:
            raise ValueError("profile.scan requires hermes_home")

        return {
            "hermes_home": str(hermes_home),
            "profiles": scan_profiles(str(hermes_home)),
        }

    def command_config_read(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        inspected = inspect_profile(profile_home)

        if not inspected.get("ok"):
            return inspected

        profile = inspected.get("profile") or {}

        return {
            "profile_home": profile_home,
            "config_path": profile.get("config_path"),
            "has_config": profile.get("has_config"),
            "config": profile.get("config"),
            "provider": profile.get("provider"),
            "model": profile.get("model"),
            "terminal_cwd": profile.get("terminal_cwd"),
        }

    def command_env_status(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        inspected = inspect_profile(profile_home)

        if not inspected.get("ok"):
            return inspected

        profile = inspected.get("profile") or {}

        return {
            "profile_home": profile_home,
            "env_path": profile.get("env_path"),
            "has_env": profile.get("has_env"),
            "env_status": profile.get("env_status") or {},
        }

    def command_soul_read(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        soul_path = Path(profile_home) / "SOUL.md"

        if not soul_path.exists():
            return {
                "profile_home": profile_home,
                "soul_path": str(soul_path),
                "has_soul": False,
                "content": "",
            }

        content = soul_path.read_text(encoding="utf-8", errors="replace")

        return {
            "profile_home": profile_home,
            "soul_path": str(soul_path),
            "has_soul": True,
            "content": content,
            "size_bytes": soul_path.stat().st_size,
            "mtime": soul_path.stat().st_mtime,
        }

    def command_gateway_status(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        inspected = inspect_profile(profile_home)

        if not inspected.get("ok"):
            return inspected

        profile = inspected.get("profile") or {}
        gateway = profile.get("gateway") or {}

        return {
            "profile_home": profile_home,
            "gateway": gateway,
            "gateway_status": derive_gateway_status(gateway),
        }

    def command_sessions_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        limit = int(payload.get("limit") or 50)

        inspected = inspect_profile(profile_home)

        if not inspected.get("ok"):
            return inspected

        profile = inspected.get("profile") or {}
        recent_sessions = profile.get("recent_sessions") or []

        return {
            "profile_home": profile_home,
            "sessions_count": profile.get("sessions_count") or 0,
            "sessions": recent_sessions[:limit],
            "sessions_error": profile.get("sessions_error"),
        }

    def command_skills_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        skills_dir = Path(profile_home) / "skills"

        if not skills_dir.exists() or not skills_dir.is_dir():
            return {
                "profile_home": profile_home,
                "skills_dir": str(skills_dir),
                "skills_count": 0,
                "skills": [],
            }

        skills: list[dict[str, Any]] = []

        for child in sorted(skills_dir.iterdir(), key=lambda p: p.name.lower()):
            if child.name.startswith("."):
                continue

            skills.append({
                "name": child.name,
                "path": str(child),
                "type": "directory" if child.is_dir() else "file",
                "size_bytes": child.stat().st_size if child.is_file() else None,
                "mtime": child.stat().st_mtime,
            })

        return {
            "profile_home": profile_home,
            "skills_dir": str(skills_dir),
            "skills_count": len(skills),
            "skills": skills,
        }

    # ── write / destructive handlers ──────────────────────────────────

    def command_setup_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        section = str(payload.get("section") or "all")
        timeout = int(payload.get("timeoutSeconds") or 300)

        result = self._run_hermes_cli(profile_home, ["setup", "--section", section], timeout)

        return {
            "profile_home": profile_home,
            "section": section,
            "returncode": result["returncode"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
        }

    def command_doctor_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        timeout = int(payload.get("timeoutSeconds") or 120)

        result = self._run_hermes_cli(profile_home, ["doctor"], timeout)

        return {
            "profile_home": profile_home,
            "returncode": result["returncode"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
        }

    def command_profile_create(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_name = validate_profile_name(payload.get("profile_name"), "profile_name")
        root = self._configured_hermes_home()
        profile_dir = self._validate_profile_home(root / "profiles" / profile_name)

        if profile_dir.exists():
            raise ValueError(f"Profile directory already exists: {profile_dir}")

        profile_dir.mkdir(parents=True, exist_ok=False)

        # Clone from another profile if requested.
        clone_from = payload.get("clone_from")
        if clone_from:
            clone_from = validate_profile_name(clone_from, "clone_from")
            source_dir = (
                self._validate_profile_home(root / "profiles" / clone_from)
                if clone_from != "default"
                else root
            )
            for name in ("config.yaml", ".env", "SOUL.md", "skills"):
                src = source_dir / name
                if src.exists():
                    if src.is_dir():
                        shutil.copytree(src, profile_dir / name)
                    else:
                        shutil.copy2(src, profile_dir / name)

        return {
            "profile_name": profile_name,
            "profile_home": str(profile_dir),
            "created": True,
        }

    def command_profile_rename(self, payload: dict[str, Any]) -> dict[str, Any]:
        new_name = validate_profile_name(payload.get("new_name"), "new_name")

        old_path = Path(self.resolve_profile_home(payload))
        if not old_path.exists():
            raise ValueError(f"Profile directory not found: {old_path}")

        root = self._configured_hermes_home()
        if old_path.resolve() == root.resolve():
            raise ValueError("Refusing to rename the root hermes home directory")

        new_path = old_path.parent / new_name
        self._validate_profile_home(new_path)

        if new_path.exists():
            raise ValueError(f"Target directory already exists: {new_path}")

        old_path.rename(new_path)

        return {
            "old_path": str(old_path),
            "new_path": str(new_path),
            "profile_name": new_name,
        }

    def command_profile_delete(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = Path(self.resolve_profile_home(payload))

        if not profile_home.exists():
            raise ValueError(f"Profile directory not found: {profile_home}")

        # Safety: never delete the root hermes_home itself.
        root = Path(self.config.hermes_home or "").expanduser()
        if profile_home.resolve() == root.resolve():
            raise ValueError("Refusing to delete the root hermes home directory")

        shutil.rmtree(profile_home)

        return {
            "profile_home": str(profile_home),
            "deleted": True,
        }

    def command_gateway_start(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        timeout = int(payload.get("timeoutSeconds") or 60)

        result = self._run_hermes_cli(profile_home, ["gateway", "start"], timeout)

        return {
            "profile_home": profile_home,
            "returncode": result["returncode"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
        }

    def command_gateway_stop(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        timeout = int(payload.get("timeoutSeconds") or 30)

        result = self._run_hermes_cli(profile_home, ["gateway", "stop"], timeout)

        return {
            "profile_home": profile_home,
            "returncode": result["returncode"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
        }

    def command_gateway_restart(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        timeout = int(payload.get("timeoutSeconds") or 60)

        result = self._run_hermes_cli(profile_home, ["gateway", "restart"], timeout)

        return {
            "profile_home": profile_home,
            "returncode": result["returncode"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
        }

    def command_config_patch(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = payload.get("content")
        if content is None:
            raise ValueError("config.patch requires 'content' payload field")
        content = str(content)

        profile_home = self.resolve_profile_home(payload)
        config_path = Path(profile_home) / "config.yaml"
        config_path.write_text(content, encoding="utf-8")

        return {
            "profile_home": profile_home,
            "config_path": str(config_path),
            "written": True,
            "size_bytes": config_path.stat().st_size,
        }

    def command_soul_update(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = payload.get("content")
        if content is None:
            raise ValueError("soul.update requires 'content' payload field")
        content = str(content)

        profile_home = self.resolve_profile_home(payload)
        soul_path = Path(profile_home) / "SOUL.md"
        soul_path.write_text(content, encoding="utf-8")

        return {
            "profile_home": profile_home,
            "soul_path": str(soul_path),
            "size_bytes": soul_path.stat().st_size,
        }

    def command_env_set(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = str(payload.get("key") or "").strip()
        if not key:
            raise ValueError("env.set requires 'key' payload field")
        value = str(payload.get("value") or "")

        profile_home = self.resolve_profile_home(payload)
        env_path = Path(profile_home) / ".env"

        lines = _read_env_lines(env_path)
        new_line = f"{key}={value}\n"

        updated = False
        for i, (existing_key, _val, _orig) in enumerate(lines):
            if existing_key == key:
                lines[i] = (key, value, new_line)
                updated = True
                break

        if not updated:
            lines.append((key, value, new_line))

        _write_env_lines(env_path, lines)

        return {
            "profile_home": profile_home,
            "env_path": str(env_path),
            "key": key,
            "set": True,
        }

    def command_env_delete(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = str(payload.get("key") or "").strip()
        if not key:
            raise ValueError("env.delete requires 'key' payload field")

        profile_home = self.resolve_profile_home(payload)
        env_path = Path(profile_home) / ".env"

        lines = _read_env_lines(env_path)
        new_lines = [(k, v, orig) for k, v, orig in lines if k != key]

        if len(new_lines) == len(lines):
            return {
                "profile_home": profile_home,
                "env_path": str(env_path),
                "key": key,
                "deleted": False,
                "reason": "key not found",
            }

        _write_env_lines(env_path, new_lines)

        return {
            "profile_home": profile_home,
            "env_path": str(env_path),
            "key": key,
            "deleted": True,
        }

    def command_logs_tail(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        limit = int(payload.get("limit") or 100)
        logs_dir = Path(profile_home) / "logs"

        if not logs_dir.exists() or not logs_dir.is_dir():
            return {
                "profile_home": profile_home,
                "logs_dir": str(logs_dir),
                "log_file": None,
                "lines_count": 0,
                "content": "",
            }

        # Pick the most recently modified log file.
        log_files = sorted(
            [p for p in logs_dir.iterdir() if p.is_file() and not p.name.startswith(".")],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        if not log_files:
            return {
                "profile_home": profile_home,
                "logs_dir": str(logs_dir),
                "log_file": None,
                "lines_count": 0,
                "content": "",
            }

        log_file = log_files[0]
        all_lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
        tail_lines = all_lines[-limit:]

        return {
            "profile_home": profile_home,
            "logs_dir": str(logs_dir),
            "log_file": str(log_file),
            "lines_count": len(tail_lines),
            "content": "\n".join(tail_lines),
        }

    # ── helpers ───────────────────────────────────────────────────────

    def resolve_profile_home(self, payload: dict[str, Any]) -> str:
        explicit_home = payload.get("profile_home")
        if explicit_home:
            return str(self._validate_profile_home(Path(str(explicit_home)).expanduser()))

        root = self._configured_hermes_home()
        profile_name = str(payload.get("profile_name") or "default").strip()

        if profile_name in {"", "default", "__default__"}:
            return str(root)

        profile_name = validate_profile_name(profile_name, "profile_name")
        return str(self._validate_profile_home(root / "profiles" / profile_name))

    def _configured_hermes_home(self) -> Path:
        hermes_home = str(self.config.hermes_home or os.environ.get("HERMES_HOME") or "").strip()
        if not hermes_home:
            raise ValueError("CommandRunner requires configured hermes_home")
        return Path(hermes_home).expanduser().resolve(strict=False)

    def _validate_profile_home(self, profile_home: Path) -> Path:
        root = self._configured_hermes_home()
        candidate = profile_home.expanduser().resolve(strict=False)

        if candidate == root:
            return candidate

        profiles_dir = root / "profiles"
        try:
            relative = candidate.relative_to(profiles_dir)
        except ValueError:
            raise ValueError(f"profile_home must be inside configured Hermes profiles directory: {candidate}") from None

        if len(relative.parts) != 1:
            raise ValueError(f"profile_home must refer to a direct profile directory: {candidate}")

        validate_profile_name(relative.parts[0], "profile_home")
        return candidate

    def _run_hermes_cli(
        self, profile_home: str, args: list[str], timeout: int = 120
    ) -> dict[str, Any]:
        """Run a hermes CLI command via subprocess in the given profile home."""
        env = os.environ.copy()
        env["HERMES_HOME"] = profile_home
        env["PYTHONIOENCODING"] = "utf-8"

        # Prefer 'hermes' console script; fall back to python -m hermes_cli.
        hermes_exe = shutil.which("hermes")
        if hermes_exe:
            cmd = [hermes_exe] + args
        else:
            cmd = [sys.executable, "-m", "hermes_cli"] + args

        result = subprocess.run(
            cmd,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout,
        )

        return {
            "returncode": result.returncode,
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
        }


# ── module-level helpers ──────────────────────────────────────────────


def success_result(result: Any, started_at: str) -> dict[str, Any]:
    return {
        "status": "success",
        "stdout": "",
        "stderr": "",
        "result": result,
        "started_at": started_at,
        "finished_at": now_iso(),
    }


def failed_result(error: str, started_at: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "stdout": "",
        "stderr": "",
        "error": error,
        "started_at": started_at,
        "finished_at": now_iso(),
    }


def derive_gateway_status(gateway: Any) -> str:
    if not isinstance(gateway, dict):
        return "unknown"

    runtime = gateway.get("runtime") or {}
    if isinstance(runtime, dict):
        state = runtime.get("gateway_state") or runtime.get("state") or runtime.get("status")
        if state:
            return str(state)

    if gateway.get("pid"):
        return "running"

    return "stopped"


# ── .env file helpers ─────────────────────────────────────────────────

_ENV_RE = re.compile(r'^\s*(?:export\s+)?(\w+)\s*=\s*(.*?)\s*$')


def validate_profile_name(value: Any, field_name: str) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValueError(f"{field_name} is required")

    if name in {".", ".."} or "/" in name or "\\" in name or Path(name).is_absolute():
        raise ValueError(f"{field_name} must be a single path segment")

    return name


def _read_env_lines(env_path: Path) -> list[tuple[str | None, str | None, str]]:
    """Parse a .env file into a list of (key, value, original_line) tuples.

    key and value are None for comment / blank lines.
    """
    lines: list[tuple[str | None, str | None, str]] = []
    if not env_path.exists():
        return lines

    with env_path.open("r", encoding="utf-8", errors="replace") as fh:
        for raw_line in fh:
            line = raw_line.rstrip("\n")
            if not line.strip():
                lines.append((None, None, raw_line))
                continue

            # Preserve leading whitespace.
            stripped = line.strip()
            if stripped.startswith("#"):
                lines.append((None, None, raw_line))
                continue

            m = _ENV_RE.match(line)
            if m:
                lines.append((m.group(1), m.group(2), raw_line))
            else:
                lines.append((None, None, raw_line))

    return lines


def _write_env_lines(
    env_path: Path, lines: list[tuple[str | None, str | None, str]]
) -> None:
    """Write parsed .env lines back to disk."""
    with env_path.open("w", encoding="utf-8") as fh:
        for _key, _value, orig in lines:
            fh.write(orig)
            if not orig.endswith("\n"):
                fh.write("\n")
