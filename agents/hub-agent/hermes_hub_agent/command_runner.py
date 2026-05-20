"""Command execution service for Hermes Hub Agent.

This module preserves the old public API (`execute_command` and
`poll_commands`) while moving command execution behind explicit domain objects,
context resolution, a registry, and a service facade.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from hermes_hub_agent.client import HubClient
from hermes_hub_agent.domain import (
    CommandContext,
    CommandEnvelope,
    CommandExecutionResult,
    CommandValidationError,
    utc_now_iso,
)
from hermes_hub_agent.files import (
    handle_config_patch as file_config_patch,
    handle_config_read as file_config_read,
    handle_env_delete as file_env_delete,
    handle_env_set as file_env_set,
    handle_env_status as file_env_status,
    handle_logs_tail as file_logs_tail,
    handle_skills_list as file_skills_list,
    handle_soul_read as file_soul_read,
    handle_soul_update as file_soul_update,
    target_profile_home,
    validate_profile_home,
)
from hermes_hub_agent.hermes import run_hermes
from hermes_hub_agent.security import redact_text

CommandHandler = Callable[[CommandEnvelope, CommandContext], CommandExecutionResult]


def _from_mapping(value: dict[str, Any]) -> CommandExecutionResult:
    return CommandExecutionResult.from_mapping(value)


def _profile_name(command: CommandEnvelope) -> str | None:
    return command.profile_name.strip() or None


class CommandRegistry:
    """Registry of white-listed Hub command handlers."""

    def __init__(self) -> None:
        self._handlers: dict[str, CommandHandler] = {}

    def register(self, command_type: str, handler: CommandHandler) -> None:
        self._handlers[command_type] = handler

    def get(self, command_type: str) -> CommandHandler | None:
        return self._handlers.get(command_type)


class CommandExecutor:
    """Validate, resolve and execute one Hub command."""

    def __init__(self, registry: CommandRegistry) -> None:
        self.registry = registry

    def execute(self, raw_command: dict[str, Any], hermes_home: Path) -> CommandExecutionResult:
        try:
            command = CommandEnvelope.from_raw(raw_command)
        except CommandValidationError as exc:
            return CommandExecutionResult.failed(str(exc))

        if "profile_home" in command.payload:
            raw_profile_home = command.payload.get("profile_home")
            if not isinstance(raw_profile_home, str) or not raw_profile_home.strip():
                return CommandExecutionResult.failed("profile_home must be a non-empty string")
            ok, _, error = validate_profile_home(hermes_home, Path(raw_profile_home))
            if not ok:
                return CommandExecutionResult.failed(error)

        ok, target_home, error = target_profile_home(hermes_home, command.payload)
        if not ok:
            return CommandExecutionResult.failed(error)

        handler = self.registry.get(command.type)
        if handler is None:
            return CommandExecutionResult.failed(f"Unsupported command type: {command.type}")

        context = CommandContext(
            hermes_home=hermes_home,
            target_home=target_home,
            timeout_seconds=command.timeout_seconds,
        )
        return handler(command, context)


# ---- command handlers -----------------------------------------------------


def handle_profile_scan(_command: CommandEnvelope, _context: CommandContext) -> CommandExecutionResult:
    return CommandExecutionResult(ok=True, stdout="Profile scan completed.")


def handle_profile_create(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    name = command.payload.get("profile_name")
    if not isinstance(name, str) or not name.strip():
        return CommandExecutionResult.failed("profile_name is required")

    args = ["profile", "create", name.strip()]
    clone_mode = command.payload.get("clone_mode")
    if clone_mode == "clone":
        args.append("--clone")
    elif clone_mode == "clone-all":
        args.append("--clone-all")

    clone_from = command.payload.get("clone_from")
    if isinstance(clone_from, str) and clone_from.strip():
        args.extend(["--clone-from", clone_from.strip()])
    if command.payload.get("no_alias") is True:
        args.append("--no-alias")

    return _from_mapping(run_hermes(args, context.hermes_home, timeout=context.timeout_seconds))


def handle_profile_rename(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    old_name = _profile_name(command)
    new_name = command.payload.get("new_name")
    if not old_name:
        return CommandExecutionResult.failed("profile_name is required")
    if not isinstance(new_name, str) or not new_name.strip():
        return CommandExecutionResult.failed("new_name is required")
    return _from_mapping(
        run_hermes(["profile", "rename", old_name, new_name.strip()], context.hermes_home, timeout=context.timeout_seconds)
    )


def handle_profile_delete(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    name = _profile_name(command)
    if not name:
        return CommandExecutionResult.failed("profile_name is required")
    return _from_mapping(run_hermes(["profile", "delete", name, "--yes"], context.hermes_home, timeout=context.timeout_seconds))


def handle_gateway_start(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(run_hermes(["gateway", "start"], context.target_home, timeout=context.timeout_seconds))


def handle_gateway_stop(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(run_hermes(["gateway", "stop"], context.target_home, timeout=context.timeout_seconds))


def handle_gateway_restart(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(run_hermes(["gateway", "restart"], context.target_home, timeout=context.timeout_seconds))


def handle_doctor(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(run_hermes(["doctor"], context.target_home, timeout=context.timeout_seconds))


def handle_setup(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    section = command.payload.get("section", "all")
    if not isinstance(section, str):
        section = "all"

    args = ["setup"]
    mode = command.payload.get("mode")
    if mode == "quick":
        args.append("--quick")
    elif mode in {"non_interactive", "non-interactive"}:
        args.append("--non-interactive")
    if section != "all":
        args.append(section)
    return _from_mapping(run_hermes(args, context.target_home, timeout=context.timeout_seconds))


def handle_logs_tail(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_logs_tail(context.target_home, command.payload))


def handle_config_read(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_config_read(context.target_home))


def handle_config_patch(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_config_patch(context.target_home, command.payload))


def handle_soul_read(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_soul_read(context.target_home))


def handle_soul_update(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_soul_update(context.target_home, command.payload))


def handle_skills_list(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_skills_list(context.target_home))


def handle_env_status(_command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_env_status(context.target_home))


def handle_env_set(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    result = _from_mapping(file_env_set(context.target_home, command.payload))
    result.stdout = redact_text(result.stdout)
    result.stderr = redact_text(result.stderr)
    return result


def handle_env_delete(command: CommandEnvelope, context: CommandContext) -> CommandExecutionResult:
    return _from_mapping(file_env_delete(context.target_home, command.payload))


def create_default_registry() -> CommandRegistry:
    registry = CommandRegistry()
    registry.register("profile.scan", handle_profile_scan)
    registry.register("profile.create", handle_profile_create)
    registry.register("profile.rename", handle_profile_rename)
    registry.register("profile.delete", handle_profile_delete)
    registry.register("gateway.start", handle_gateway_start)
    registry.register("gateway.stop", handle_gateway_stop)
    registry.register("gateway.restart", handle_gateway_restart)
    registry.register("doctor.run", handle_doctor)
    registry.register("setup.run", handle_setup)
    registry.register("logs.tail", handle_logs_tail)
    registry.register("config.read", handle_config_read)
    registry.register("config.patch", handle_config_patch)
    registry.register("soul.read", handle_soul_read)
    registry.register("soul.update", handle_soul_update)
    registry.register("skills.list", handle_skills_list)
    registry.register("env.status", handle_env_status)
    registry.register("env.set", handle_env_set)
    registry.register("env.delete", handle_env_delete)
    return registry


class CommandService:
    def __init__(self, executor: CommandExecutor | None = None) -> None:
        self.executor = executor or CommandExecutor(create_default_registry())

    def execute(self, command: dict[str, Any], hermes_home: Path) -> CommandExecutionResult:
        return self.executor.execute(command, hermes_home)

    def poll_and_execute(self, client: HubClient, node_id: str, hermes_home: Path) -> bool:
        response = client.poll_commands(node_id)
        commands = response.get("commands")
        if not isinstance(commands, list):
            return False

        executed = False
        for raw_command in commands:
            if not isinstance(raw_command, dict):
                continue
            command_id = raw_command.get("id")
            if not isinstance(command_id, str) or not command_id:
                continue

            executed = True
            started_at = utc_now_iso()
            client.command_started(node_id, command_id)
            result = self.execute(raw_command, hermes_home)
            finished_at = utc_now_iso()

            client.command_result(
                node_id,
                command_id,
                {
                    "status": "success" if result.ok else "failed",
                    "stdout": redact_text(result.stdout),
                    "stderr": redact_text(result.stderr),
                    "error": "" if result.ok else redact_text(result.stderr or "Command failed"),
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "result": {
                        "returncode": result.returncode,
                        "command": result.command,
                    },
                },
            )
        return executed


def create_default_command_service() -> CommandService:
    return CommandService()


# ---- Backwards-compatible module functions --------------------------------

_DEFAULT_SERVICE = create_default_command_service()


def execute_command(command: dict[str, Any], hermes_home: Path) -> dict[str, Any]:
    return _DEFAULT_SERVICE.execute(command, hermes_home).to_mapping()


def poll_commands(client: HubClient, node_id: str, hermes_home: Path) -> bool:
    return _DEFAULT_SERVICE.poll_and_execute(client, node_id, hermes_home)
