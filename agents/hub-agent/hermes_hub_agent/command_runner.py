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
from typing import Any, Callable

import yaml
from .heartbeat import AgentConfig
from .hermes_imports import prepare_hermes_imports
from .hub_client import HubClient
from .scanner import inspect_profile, scan_profiles


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


SETUP_STEP_ORDER = [
    "preflight.validate_profile_home",
    "fs.ensure_directory_structure",
    "config.write_yaml",
    "config.validate_yaml",
    "env.write_file",
    "env.validate_required_keys",
    "soul.write_file",
    "provider.validate",
    "terminal.validate",
    "gateway.validate",
    "tools.validate",
    "agent_behavior.validate_and_finalize",
]

TERMINAL_STATUSES = {"success", "failed", "timeout", "cancelled"}


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
            result = self.run_command(command, command_id=command_id, node_id=str(command.get("nodeId") or self.config.node_id))
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

    def run_command(
        self,
        command: dict[str, Any],
        command_id: str | None = None,
        node_id: str | None = None,
    ) -> dict[str, Any]:
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
                return self.run_setup_command(
                    payload,
                    started_at=started_at,
                    command_id=command_id,
                    node_id=node_id,
                )

            if command_type == "setup.catalog":
                return success_result(self.command_setup_catalog(payload), started_at)

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
                "stderr": sanitize_text(traceback.format_exc()),
                "error": str(exc),
                "started_at": started_at,
                "finished_at": now_iso(),
            }

    def run_query(
        self,
        query_type: str,
        payload: dict[str, Any] | None = None,
        _agent_id: str | None = None,
    ) -> dict[str, Any]:
        body = payload if isinstance(payload, dict) else {}

        if query_type == "profile.scan":
            return self.command_profile_scan(body)

        if query_type == "config.read":
            return self.command_config_read(body)

        if query_type == "env.status":
            return self.command_env_status(body)

        if query_type == "soul.read":
            return self.command_soul_read(body)

        if query_type == "gateway.status":
            return self.command_gateway_status(body)

        if query_type == "sessions.list":
            return self.command_sessions_list(body)

        if query_type == "skills.list":
            return self.command_skills_list(body)

        if query_type == "setup.catalog":
            return self.command_setup_catalog(body)

        raise ValueError(f"Unsupported query type: {query_type}")

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
        config_path_value = profile.get("config_path")
        config_path = Path(str(config_path_value)) if config_path_value else (Path(profile_home) / "config.yaml")
        config_content = ""
        if config_path.exists() and config_path.is_file():
            config_content = config_path.read_text(encoding="utf-8", errors="replace")

        return {
            "profile_home": profile_home,
            "config_path": str(config_path),
            "has_config": profile.get("has_config"),
            "config": config_content,
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

    def run_setup_command(
        self,
        payload: dict[str, Any],
        *,
        started_at: str,
        command_id: str | None,
        node_id: str | None,
    ) -> dict[str, Any]:
        def progress_report(update: dict[str, Any]) -> None:
            if not command_id or not node_id:
                return
            self.client.report_command_result(
                node_id,
                command_id,
                {
                    "status": "running",
                    "result": update,
                    "started_at": started_at,
                },
            )

        setup_result = self.command_setup_run(payload, report_progress=progress_report)
        finished_at = now_iso()

        if setup_result["status"] == "success":
            return {
                "status": "success",
                "stdout": "setup completed",
                "stderr": "",
                "result": setup_result,
                "started_at": started_at,
                "finished_at": finished_at,
            }

        error = setup_result.get("error") or {}
        return {
            "status": "failed",
            "stdout": "",
            "stderr": str(error.get("details_ref") or ""),
            "error": str(error.get("message") or "setup failed"),
            "result": setup_result,
            "started_at": started_at,
            "finished_at": finished_at,
        }

    def command_setup_run(
        self,
        payload: dict[str, Any],
        report_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        profile_home = self.resolve_profile_home(payload)
        mode = str(payload.get("mode") or "create_flow")
        resume_from_step = payload.get("resume_from_step")
        inputs = payload.get("inputs") if isinstance(payload.get("inputs"), dict) else {}

        if resume_from_step is not None and resume_from_step not in SETUP_STEP_ORDER:
            raise ValueError(f"Invalid resume_from_step: {resume_from_step}")

        resume_index = SETUP_STEP_ORDER.index(str(resume_from_step)) if resume_from_step in SETUP_STEP_ORDER else 0
        step_results: list[dict[str, Any]] = [{"step": step, "status": "pending"} for step in SETUP_STEP_ORDER]
        artifacts = {
            "config_written": False,
            "env_written": False,
            "soul_written": False,
        }

        context: dict[str, Any] = {
            "profile_home": profile_home,
            "mode": mode,
            "inputs": inputs,
            "config": None,
        }

        # Repair mode may resume from mid-pipeline; apply input overrides so retries are effective.
        if mode == "repair" and resume_index > 0:
            if resume_index > SETUP_STEP_ORDER.index("config.write_yaml"):
                self._setup_step_config_write_yaml(context)
            if resume_index > SETUP_STEP_ORDER.index("config.validate_yaml"):
                self._setup_step_config_validate_yaml(context)
            if resume_index > SETUP_STEP_ORDER.index("env.write_file"):
                self._setup_step_env_write_file(context)
            if resume_index > SETUP_STEP_ORDER.index("soul.write_file"):
                self._setup_step_soul_write_file(context)

        if report_progress:
            report_progress({
                "status": "running",
                "step_results": step_results,
                "artifacts": artifacts,
            })

        step_handlers: list[Callable[[dict[str, Any]], str]] = [
            self._setup_step_preflight_validate_profile_home,
            self._setup_step_fs_ensure_directory_structure,
            self._setup_step_config_write_yaml,
            self._setup_step_config_validate_yaml,
            self._setup_step_env_write_file,
            self._setup_step_env_validate_required_keys,
            self._setup_step_soul_write_file,
            self._setup_step_provider_validate,
            self._setup_step_terminal_validate,
            self._setup_step_gateway_validate,
            self._setup_step_tools_validate,
            self._setup_step_agent_behavior_validate_finalize,
        ]

        for index, step_name in enumerate(SETUP_STEP_ORDER):
            result_row = step_results[index]

            if index < resume_index:
                result_row.update({
                    "status": "skipped",
                    "summary": "Skipped by resume_from_step",
                })
                continue

            started = time.perf_counter()
            started_at = now_iso()
            result_row["status"] = "running"
            result_row["started_at"] = started_at
            if report_progress:
                report_progress({
                    "status": "running",
                    "step_results": step_results,
                    "artifacts": artifacts,
                })

            try:
                summary = step_handlers[index](context)
                ended_at = now_iso()
                result_row.update({
                    "status": "success",
                    "ended_at": ended_at,
                    "duration_ms": int((time.perf_counter() - started) * 1000),
                    "summary": summary,
                })

                if step_name == "config.write_yaml":
                    artifacts["config_written"] = True
                elif step_name == "env.write_file":
                    artifacts["env_written"] = True
                elif step_name == "soul.write_file":
                    artifacts["soul_written"] = True

                if report_progress:
                    report_progress({
                        "status": "running",
                        "step_results": step_results,
                        "artifacts": artifacts,
                    })
            except Exception as exc:
                stderr_ref = sanitize_text(traceback.format_exc())[:600]
                ended_at = now_iso()
                result_row.update({
                    "status": "failed",
                    "ended_at": ended_at,
                    "duration_ms": int((time.perf_counter() - started) * 1000),
                    "summary": str(exc),
                    "error_code": f"setup.{step_name}.failed",
                    "stderr_ref": stderr_ref,
                })
                failed = {
                    "status": "failed",
                    "step_results": step_results,
                    "artifacts": artifacts,
                    "error": {
                        "code": f"setup.{step_name}.failed",
                        "message": str(exc),
                        "hint": "Fix the failed step input and retry from failed step.",
                        "retriable": True,
                        "details_ref": stderr_ref,
                    },
                }
                if report_progress:
                    report_progress(failed)
                return failed

        success = {
            "status": "success",
            "step_results": step_results,
            "artifacts": artifacts,
        }
        if report_progress:
            report_progress(success)
        return success

    def command_setup_catalog(self, payload: dict[str, Any]) -> dict[str, Any]:
        _ = payload
        return {
            "providers": _load_setup_catalog(self.config.hermes_home),
            "generated_at": now_iso(),
            "source": "hermes-agent",
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
        clone_from_profile_home = payload.get("clone_from_profile_home")
        clone_from = payload.get("clone_from")
        source_dir: Path | None = None
        if isinstance(clone_from_profile_home, str) and clone_from_profile_home.strip():
            source_dir = self._validate_profile_home(Path(clone_from_profile_home.strip()))
        elif clone_from:
            clone_from = validate_profile_name(clone_from, "clone_from")
            source_dir = (
                self._validate_profile_home(root / "profiles" / clone_from)
                if clone_from != "default"
                else root
            )

        if source_dir is not None:
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

    def _setup_step_preflight_validate_profile_home(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        if not profile_home.exists():
            profile_home.mkdir(parents=True, exist_ok=True)
        self._validate_profile_home(profile_home)
        return "profile_home validated"

    def _setup_step_fs_ensure_directory_structure(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        created: list[str] = []
        for name in ("logs", "skills", "cron", "tmp", "gateway", "terminal"):
            target = profile_home / name
            if not target.exists():
                created.append(name)
            target.mkdir(parents=True, exist_ok=True)
        return f"directories ready ({', '.join(created) if created else 'no changes'})"

    def _setup_step_config_write_yaml(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        config_path = profile_home / "config.yaml"
        inputs = context.get("inputs") if isinstance(context.get("inputs"), dict) else {}

        raw_override = inputs.get("config_yaml")
        if isinstance(raw_override, str) and raw_override.strip():
            config_path.write_text(raw_override, encoding="utf-8")
            loaded = yaml.safe_load(raw_override) or {}
            context["config"] = loaded if isinstance(loaded, dict) else {}
            return "config.yaml written from raw override"

        existing: dict[str, Any] = {}
        if config_path.exists():
            loaded_existing = yaml.safe_load(config_path.read_text(encoding="utf-8", errors="replace")) or {}
            if isinstance(loaded_existing, dict):
                existing = loaded_existing

        provider = inputs.get("provider")
        model_input = inputs.get("model") if isinstance(inputs.get("model"), dict) else {}
        terminal = inputs.get("terminal") if isinstance(inputs.get("terminal"), dict) else {}
        gateway = inputs.get("gateway") if isinstance(inputs.get("gateway"), dict) else {}
        tools = inputs.get("tools") if isinstance(inputs.get("tools"), dict) else {}
        behavior = inputs.get("agent_behavior") if isinstance(inputs.get("agent_behavior"), dict) else {}

        model = existing.get("model")
        if not isinstance(model, dict):
            model = {}
        if isinstance(provider, str) and provider.strip():
            model["provider"] = provider.strip()
        model_default = model_input.get("default")
        if isinstance(model_default, str) and model_default.strip():
            model["default"] = model_default.strip()
        model_base_url = model_input.get("base_url")
        if isinstance(model_base_url, str):
            if model_base_url.strip():
                model["base_url"] = model_base_url.strip()
            elif "base_url" in model:
                model.pop("base_url", None)
        existing["model"] = model

        terminal_conf = existing.get("terminal")
        if not isinstance(terminal_conf, dict):
            terminal_conf = {}
        terminal_cwd = terminal.get("cwd")
        if isinstance(terminal_cwd, str) and terminal_cwd.strip():
            terminal_conf["cwd"] = terminal_cwd.strip()
        else:
            terminal_conf.setdefault("cwd", ".")
        existing["terminal"] = terminal_conf

        gateway_conf = existing.get("gateway")
        if not isinstance(gateway_conf, dict):
            gateway_conf = {}
        gateway_endpoint = gateway.get("endpoint")
        if isinstance(gateway_endpoint, str) and gateway_endpoint.strip():
            gateway_conf["endpoint"] = gateway_endpoint.strip()
        gateway_platforms = gateway.get("platforms")
        if isinstance(gateway_platforms, list):
            gateway_conf["platforms"] = [str(item).strip() for item in gateway_platforms if str(item).strip()]
        existing["gateway"] = gateway_conf

        tools_conf = existing.get("tools")
        if not isinstance(tools_conf, dict):
            tools_conf = {}
        allow_tools = tools.get("allow")
        if isinstance(allow_tools, list):
            tools_conf["allow"] = [str(item).strip() for item in allow_tools if str(item).strip()]
        existing["tools"] = tools_conf

        agent_conf = existing.get("agent")
        if not isinstance(agent_conf, dict):
            agent_conf = {}
        agent_behavior = agent_conf.get("behavior")
        if not isinstance(agent_behavior, dict):
            agent_behavior = {}
        for key in ("reasoning_effort", "approvals_mode", "message"):
            value = behavior.get(key)
            if isinstance(value, str) and value.strip():
                agent_behavior[key] = value.strip()
        agent_conf["behavior"] = agent_behavior
        existing["agent"] = agent_conf

        config_path.write_text(
            yaml.safe_dump(existing, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        context["config"] = existing
        return "config.yaml written"

    def _setup_step_config_validate_yaml(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        config_path = profile_home / "config.yaml"
        loaded = yaml.safe_load(config_path.read_text(encoding="utf-8", errors="replace")) or {}
        if not isinstance(loaded, dict):
            raise ValueError("config.yaml must be a mapping object")
        context["config"] = loaded
        return "config.yaml validated"

    def _setup_step_env_write_file(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        env_path = profile_home / ".env"
        inputs = context.get("inputs") if isinstance(context.get("inputs"), dict) else {}
        env_values = inputs.get("env") if isinstance(inputs.get("env"), dict) else {}

        lines = _read_env_lines(env_path)
        merged: dict[str, str] = {}
        for key, value, _orig in lines:
            if key and value is not None:
                merged[key] = value
        for key, value in env_values.items():
            if isinstance(key, str) and key.strip():
                merged[key.strip()] = str(value)
        with env_path.open("w", encoding="utf-8") as fh:
            for key in sorted(merged.keys()):
                fh.write(f"{key}={merged[key]}\n")
        return f".env written ({len(merged)} keys)"

    def _setup_step_env_validate_required_keys(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        env_path = profile_home / ".env"
        env_lines = _read_env_lines(env_path)
        env_keys = {key for key, value, _orig in env_lines if key and value is not None and value != ""}
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        provider = _extract_provider_from_config(config)
        if not provider:
            return "provider not set; env required key check skipped"
        provider_meta = _provider_setup_metadata(provider, hermes_home=str(self.config.hermes_home))
        required_keys = provider_meta.get("required_env_keys", []) if isinstance(provider_meta, dict) else []
        if required_keys:
            for required_key in required_keys:
                if required_key not in env_keys:
                    raise ValueError(f"Missing required env key for provider '{provider}': {required_key}")
        return f"env validated ({len(env_keys)} keys, provider={provider})"

    def _setup_step_soul_write_file(self, context: dict[str, Any]) -> str:
        profile_home = Path(str(context["profile_home"]))
        soul_path = profile_home / "SOUL.md"
        inputs = context.get("inputs") if isinstance(context.get("inputs"), dict) else {}
        soul_override = inputs.get("soul_md")
        if isinstance(soul_override, str):
            soul_path.write_text(soul_override, encoding="utf-8")
            return "SOUL.md written from payload"
        if soul_path.exists():
            return "SOUL.md kept existing"
        soul_path.write_text("# SOUL\n\nDescribe this profile's behavior.\n", encoding="utf-8")
        return "SOUL.md initialized"

    def _setup_step_provider_validate(self, context: dict[str, Any]) -> str:
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        provider = _extract_provider_from_config(config)
        if not provider:
            raise ValueError("Provider is required in config.yaml (model.provider)")
        return f"provider validated ({provider})"

    def _setup_step_terminal_validate(self, context: dict[str, Any]) -> str:
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        terminal = config.get("terminal") if isinstance(config.get("terminal"), dict) else {}
        cwd_value = terminal.get("cwd") if isinstance(terminal, dict) else "."
        if not isinstance(cwd_value, str) or not cwd_value.strip():
            raise ValueError("terminal.cwd must be a non-empty string")
        profile_home = Path(str(context["profile_home"]))
        cwd_path = Path(cwd_value)
        target = cwd_path if cwd_path.is_absolute() else profile_home / cwd_path
        target.mkdir(parents=True, exist_ok=True)
        return f"terminal cwd validated ({target})"

    def _setup_step_gateway_validate(self, context: dict[str, Any]) -> str:
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        gateway = config.get("gateway") if isinstance(config.get("gateway"), dict) else {}
        endpoint = gateway.get("endpoint") if isinstance(gateway, dict) else None
        if endpoint is not None and not isinstance(endpoint, str):
            raise ValueError("gateway.endpoint must be a string")
        platforms = gateway.get("platforms") if isinstance(gateway, dict) else None
        if platforms is not None and not isinstance(platforms, list):
            raise ValueError("gateway.platforms must be an array")
        if isinstance(platforms, list):
            for item in platforms:
                if not isinstance(item, str):
                    raise ValueError("gateway.platforms entries must be strings")
        return f"gateway validated ({endpoint if endpoint else 'default'}; {len(platforms) if isinstance(platforms, list) else 0} platforms)"

    def _setup_step_tools_validate(self, context: dict[str, Any]) -> str:
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        tools = config.get("tools") if isinstance(config.get("tools"), dict) else {}
        allow = tools.get("allow") if isinstance(tools, dict) else None
        if allow is not None and not isinstance(allow, list):
            raise ValueError("tools.allow must be an array")
        if isinstance(allow, list):
            for item in allow:
                if not isinstance(item, str):
                    raise ValueError("tools.allow entries must be strings")
        return f"tools validated ({len(allow) if isinstance(allow, list) else 0} items)"

    def _setup_step_agent_behavior_validate_finalize(self, context: dict[str, Any]) -> str:
        config = context.get("config") if isinstance(context.get("config"), dict) else {}
        agent = config.get("agent") if isinstance(config.get("agent"), dict) else {}
        behavior = agent.get("behavior") if isinstance(agent, dict) else {}
        if behavior is not None and not isinstance(behavior, dict):
            raise ValueError("agent.behavior must be a mapping object")
        profile_home = Path(str(context["profile_home"]))
        for required in ("config.yaml", ".env", "SOUL.md"):
            if not (profile_home / required).exists():
                raise ValueError(f"Missing required setup file: {required}")
        return "agent behavior validated; setup finalized"

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
def _provider_setup_metadata(provider_id: str, *, hermes_home: str | None = None) -> dict[str, Any]:
    prepare_hermes_imports(hermes_home)

    provider_key = str(provider_id or "").strip()
    if not provider_key:
        return {
            "id": "",
            "label": "",
            "auth_type": "api_key",
            "required_env_keys": [],
            "optional_env_keys": [],
            "base_url": "",
            "base_url_env_var": "",
            "models": [],
        }

    required_env_keys: list[str] = []
    optional_env_keys: list[str] = []
    auth_type = "api_key"
    label = provider_key
    base_url = ""
    base_url_env_var = ""
    models: list[str] = []

    try:
        from hermes_cli.auth import PROVIDER_REGISTRY  # type: ignore[import-not-found]

        reg = PROVIDER_REGISTRY.get(provider_key)
        if reg is not None:
            label = str(getattr(reg, "name", "") or label)
            auth_type = str(getattr(reg, "auth_type", "") or auth_type)
            base_url = str(getattr(reg, "inference_base_url", "") or base_url)
            base_url_env_var = str(getattr(reg, "base_url_env_var", "") or base_url_env_var)
            env_vars = [str(item).strip() for item in getattr(reg, "api_key_env_vars", ()) if str(item).strip()]
            if auth_type == "api_key":
                required_env_keys = env_vars
            else:
                optional_env_keys = env_vars
    except Exception:
        pass

    try:
        from hermes_cli.providers import get_provider  # type: ignore[import-not-found]

        pdef = get_provider(provider_key)
        if pdef is not None and str(getattr(pdef, "id", "") or "") == provider_key:
            label = str(getattr(pdef, "name", "") or label)
            auth_type = str(getattr(pdef, "auth_type", "") or auth_type)
            base_url = str(getattr(pdef, "base_url", "") or base_url)
            base_url_env_var = str(getattr(pdef, "base_url_env_var", "") or base_url_env_var)
            env_vars = [str(item).strip() for item in getattr(pdef, "api_key_env_vars", ()) if str(item).strip()]
            if auth_type == "api_key":
                if not required_env_keys:
                    required_env_keys = env_vars
                else:
                    required_env_keys = list(dict.fromkeys(required_env_keys + env_vars))
            elif not optional_env_keys:
                optional_env_keys = env_vars
    except Exception:
        pass

    try:
        from agent.models_dev import get_provider_info  # type: ignore[import-not-found]

        pinfo = get_provider_info(provider_key)
        if pinfo is not None:
            label = str(getattr(pinfo, "name", "") or label)
            base_url = str(getattr(pinfo, "api", "") or base_url)
            if not required_env_keys and auth_type == "api_key":
                required_env_keys = [str(item).strip() for item in getattr(pinfo, "env", ()) if str(item).strip()]
    except Exception:
        pass

    try:
        from hermes_cli.models import _PROVIDER_MODELS  # type: ignore[import-not-found]

        models = [str(item).strip() for item in _PROVIDER_MODELS.get(provider_key, []) if str(item).strip()]
    except Exception:
        models = []

    return {
        "id": provider_key,
        "label": label,
        "auth_type": auth_type,
        "required_env_keys": required_env_keys,
        "optional_env_keys": optional_env_keys,
        "base_url": base_url,
        "base_url_env_var": base_url_env_var,
        "models": models,
    }


def _load_setup_catalog(hermes_home: str | None = None) -> list[dict[str, Any]]:
    prepare_hermes_imports(hermes_home)

    provider_ids: list[str] = []

    try:
        from hermes_cli.models import _PROVIDER_MODELS  # type: ignore[import-not-found]

        provider_ids.extend(str(item).strip() for item in _PROVIDER_MODELS.keys() if str(item).strip())
    except Exception:
        pass

    try:
        from hermes_cli.auth import PROVIDER_REGISTRY  # type: ignore[import-not-found]

        for key, value in PROVIDER_REGISTRY.items():
            canonical = str(getattr(value, "id", "") or "").strip()
            key_name = str(key or "").strip()
            if canonical and key_name == canonical:
                provider_ids.append(key_name)
    except Exception:
        pass

    seen: set[str] = set()
    ordered_ids: list[str] = []
    for provider_id in provider_ids:
        if provider_id in seen:
            continue
        seen.add(provider_id)
        ordered_ids.append(provider_id)

    catalog = [_provider_setup_metadata(provider_id, hermes_home=hermes_home) for provider_id in ordered_ids]
    catalog.sort(key=lambda item: str(item.get("label") or item.get("id") or "").lower())
    return catalog


def success_result(result: Any, started_at: str) -> dict[str, Any]:
    if isinstance(result, dict) and isinstance(result.get("returncode"), int) and result["returncode"] != 0:
        return {
            "status": "failed",
            "stdout": sanitize_text(str(result.get("stdout") or "")),
            "stderr": sanitize_text(str(result.get("stderr") or "")),
            "error": f"Command exited with returncode {result['returncode']}",
            "result": result,
            "started_at": started_at,
            "finished_at": now_iso(),
        }
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


def _extract_provider_from_config(config: dict[str, Any]) -> str | None:
    model = config.get("model")
    if isinstance(model, dict):
        value = model.get("provider")
        if isinstance(value, str) and value.strip():
            return value.strip()
    provider = config.get("provider")
    if isinstance(provider, str) and provider.strip():
        return provider.strip()
    return None


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
_SECRET_REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'((?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?TOKEN)\s*[=:]\s*)\S+', re.IGNORECASE), r"\1***REDACTED***"),
    (re.compile(r"sk-[a-zA-Z0-9_-]{20,}"), "***REDACTED***"),
    (re.compile(r"Bearer\s+[a-zA-Z0-9\-_.]+", re.IGNORECASE), "Bearer ***REDACTED***"),
]


def sanitize_text(value: str) -> str:
    sanitized = value
    for pattern, replacement in _SECRET_REDACTIONS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


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
