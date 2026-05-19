"""Command queue dispatch for Hermes Hub Agent."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable

from hermes_hub_agent.client import HubClient
from hermes_hub_agent.files import (
    failed,
    handle_config_patch,
    handle_config_read,
    handle_env_delete,
    handle_env_set,
    handle_env_status,
    handle_logs_tail,
    handle_skills_list,
    handle_soul_read,
    handle_soul_update,
    target_profile_home,
    validate_profile_home,
)
from hermes_hub_agent.hermes import run_hermes


def _get_payload(command: dict[str, Any]) -> dict[str, Any]:
    p = command.get("payload")
    return p if isinstance(p, dict) else {}


def _get_profile_name(command: dict[str, Any]) -> str:
    value = _get_payload(command).get("profile_name")
    return value if isinstance(value, str) else ""


def _get_timeout(payload: dict[str, Any]) -> int:
    t = payload.get("timeoutSeconds", 300)
    return int(t) if isinstance(t, (int, float)) and t > 0 else 300


# ---- per-command handlers ----

def _handle_profile_scan(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], _target: Path, _timeout: int,
) -> dict[str, Any]:
    return {"ok": True, "stdout": "Profile scan completed.", "stderr": ""}


def _handle_profile_create(
    _command: dict[str, Any], hermes_home: Path,
    payload: dict[str, Any], _target: Path, timeout: int,
) -> dict[str, Any]:
    name = payload.get("profile_name")
    if not isinstance(name, str) or not name.strip():
        return failed("profile_name is required")
    args = ["profile", "create", name.strip()]
    if payload.get("clone_mode") == "clone":
        args.append("--clone")
    if payload.get("clone_mode") == "clone-all":
        args.append("--clone-all")
    clone_from = payload.get("clone_from")
    if isinstance(clone_from, str) and clone_from.strip():
        args.extend(["--clone-from", clone_from.strip()])
    if payload.get("no_alias") is True:
        args.append("--no-alias")
    return run_hermes(args, hermes_home, timeout=timeout)


def _handle_profile_rename(
    command: dict[str, Any], hermes_home: Path,
    payload: dict[str, Any], _target: Path, timeout: int,
) -> dict[str, Any]:
    old = _get_profile_name(command)
    new = payload.get("new_name")
    if not old:
        return failed("profile_name is required")
    if not isinstance(new, str) or not new.strip():
        return failed("new_name is required")
    return run_hermes(["profile", "rename", old, new.strip()], hermes_home, timeout=timeout)


def _handle_profile_delete(
    command: dict[str, Any], hermes_home: Path,
    _payload: dict[str, Any], _target: Path, timeout: int,
) -> dict[str, Any]:
    name = _get_profile_name(command)
    if not name:
        return failed("profile_name is required")
    return run_hermes(["profile", "delete", name, "--yes"], hermes_home, timeout=timeout)


def _handle_gateway_start(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, timeout: int,
) -> dict[str, Any]:
    return run_hermes(["gateway", "start"], target, timeout=timeout)


def _handle_gateway_stop(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, timeout: int,
) -> dict[str, Any]:
    return run_hermes(["gateway", "stop"], target, timeout=timeout)


def _handle_gateway_restart(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, timeout: int,
) -> dict[str, Any]:
    return run_hermes(["gateway", "restart"], target, timeout=timeout)


def _handle_doctor(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, timeout: int,
) -> dict[str, Any]:
    return run_hermes(["doctor"], target, timeout=timeout)


def _handle_setup(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, timeout: int,
) -> dict[str, Any]:
    section = payload.get("section", "all")
    if not isinstance(section, str):
        section = "all"
    args = ["setup"]
    if section != "all":
        args.append(section)
    return run_hermes(args, target, timeout=timeout)


def _handle_logs_tail(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_logs_tail(target, payload)


def _handle_config_read(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_config_read(target)


def _handle_config_patch(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_config_patch(target, payload)


def _handle_soul_read(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_soul_read(target)


def _handle_soul_update(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_soul_update(target, payload)


def _handle_skills_list(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_skills_list(target)


def _handle_env_status(
    _command: dict[str, Any], _hermes_home: Path,
    _payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_env_status(target)


def _handle_env_set(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_env_set(target, payload)


def _handle_env_delete(
    _command: dict[str, Any], _hermes_home: Path,
    payload: dict[str, Any], target: Path, _timeout: int,
) -> dict[str, Any]:
    return handle_env_delete(target, payload)


# ---- dispatch table ----

_CommandHandler = Callable[
    [dict[str, Any], Path, dict[str, Any], Path, int],
    dict[str, Any],
]

_DISPATCH: dict[str, _CommandHandler] = {
    "profile.scan":       _handle_profile_scan,
    "profile.create":     _handle_profile_create,
    "profile.rename":     _handle_profile_rename,
    "profile.delete":     _handle_profile_delete,
    "gateway.start":      _handle_gateway_start,
    "gateway.stop":       _handle_gateway_stop,
    "gateway.restart":    _handle_gateway_restart,
    "doctor.run":         _handle_doctor,
    "setup.run":          _handle_setup,
    "logs.tail":          _handle_logs_tail,
    "config.read":        _handle_config_read,
    "config.patch":       _handle_config_patch,
    "soul.read":          _handle_soul_read,
    "soul.update":        _handle_soul_update,
    "skills.list":        _handle_skills_list,
    "env.status":         _handle_env_status,
    "env.set":            _handle_env_set,
    "env.delete":         _handle_env_delete,
}


def execute_command(command: dict[str, Any], hermes_home: Path) -> dict[str, Any]:
    command_type = command.get("type")
    if not isinstance(command_type, str):
        return failed("command type must be a string")

    payload = _get_payload(command)
    timeout = _get_timeout(payload)

    # Validate explicit profile_home
    if "profile_home" in payload:
        raw = payload.get("profile_home")
        if not isinstance(raw, str) or not raw.strip():
            return failed("profile_home must be a non-empty string")
        ok, _, error = validate_profile_home(hermes_home, Path(raw))
        if not ok:
            return failed(error)

    ok, target_home, error = target_profile_home(hermes_home, payload)
    if not ok:
        return failed(error)

    handler = _DISPATCH.get(command_type)
    if handler is None:
        return failed(f"Unsupported command type: {command_type}")

    return handler(command, hermes_home, payload, target_home, timeout)


def poll_commands(client: HubClient, node_id: str, hermes_home: Path) -> bool:
    response = client.poll_commands(node_id)
    commands = response.get("commands")
    if not isinstance(commands, list):
        return False

    executed = False
    for command in commands:
        if not isinstance(command, dict):
            continue
        command_id = command.get("id")
        if not isinstance(command_id, str):
            continue

        executed = True
        started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        client.command_started(node_id, command_id)
        result = execute_command(command, hermes_home)
        finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        client.command_result(
            node_id,
            command_id,
            {
                "status": "success" if result.get("ok") else "failed",
                "stdout": result.get("stdout", ""),
                "stderr": result.get("stderr", ""),
                "error": "" if result.get("ok") else result.get("stderr", "Command failed"),
                "started_at": started_at,
                "finished_at": finished_at,
                "result": {
                    "returncode": result.get("returncode"),
                    "command": result.get("command"),
                },
            },
        )

    return executed
