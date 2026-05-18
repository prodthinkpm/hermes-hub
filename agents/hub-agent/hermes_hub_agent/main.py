from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from hermes_hub_agent import __version__


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


def post_json(base_url: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {"ok": True}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {raw}") from exc
    except URLError as exc:
        raise RuntimeError(f"Hub server unreachable: {exc.reason}") from exc


def get_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    request = Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {"ok": True}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {raw}") from exc
    except URLError as exc:
        raise RuntimeError(f"Hub server unreachable: {exc.reason}") from exc


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
    # timeout: 命令超时秒数，默认 300，由 command payload 中的 timeoutSeconds 控制
    env = os.environ.copy()
    env["HERMES_HOME"] = str(hermes_home)
    last_error = ""
    for command in hermes_candidates():
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
        "stderr": f"Hermes CLI not found. Tried: {', '.join(hermes_candidates())}. {last_error}",
        "returncode": None,
        "command": hermes_candidates()[0] if hermes_candidates() else "hermes",
    }


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
    if gateway_state_path.exists():
        try:
            gateway_state = json.loads(gateway_state_path.read_text(encoding="utf-8"))
            raw_state = str(gateway_state.get("gateway_state", "")).lower()
            gateway_status = "running" if raw_state == "running" else raw_state or "unknown"
        except (OSError, json.JSONDecodeError):
            gateway_status = "unknown"

    return {
        "profile_name": profile_name,
        "profile_home": str(profile_home),
        "provider": provider,
        "model": model,
        "terminal_cwd": read_yaml_scalar(config_path, "cwd"),
        "setup_status": setup_status,
        "gateway_status": gateway_status,
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


def register(base_url: str, node_id: str, node_name: str, hermes_home: Path, token: str = "") -> None:
    # Docker auto-detection
    tags = ["local"]
    if os.path.exists("/.dockerenv"):
        tags.append("docker")
    else:
        try:
            with open("/proc/1/cgroup", "r") as f:
                if "docker" in f.read():
                    tags.append("docker")
        except OSError:
            pass

    payload: dict[str, Any] = {
        "node_id": node_id,
        "name": node_name,
        "hostname": socket.gethostname(),
        "agent_version": __version__,
        "hermes_home": str(hermes_home),
        "runtime": {
            "os": platform.system().lower(),
            "arch": platform.machine(),
        },
        "capabilities": {
            "profiles": True,
            "heartbeat": True,
            "logs": False,
            "commands": True,
        },
        "tags": tags,
    }
    if token:
        payload["token"] = token
    post_json(base_url, "/api/hub-agents/register", payload)


def heartbeat(base_url: str, node_id: str, hermes_home: Path) -> None:
    profiles = scan_profiles(hermes_home)
    payload = {
        "status": "online",
        "summary": {
            "profiles_total": len(profiles),
            "gateway_running": sum(1 for profile in profiles if profile.get("gateway_status") == "running"),
        },
        "profiles": profiles,
    }
    post_json(base_url, f"/api/hub-agents/{node_id}/heartbeat", payload)


def command_profile_name(command: dict[str, Any]) -> str:
    payload = command.get("payload") if isinstance(command.get("payload"), dict) else {}
    value = payload.get("profile_name")
    return value if isinstance(value, str) else ""


def execute_command(command: dict[str, Any], hermes_home: Path) -> dict[str, Any]:
    command_type = command.get("type")
    payload = command.get("payload") if isinstance(command.get("payload"), dict) else {}
    # 从 command payload 读取超时配置，默认 300 秒
    timeout = payload.get("timeoutSeconds", 300)
    if not isinstance(timeout, (int, float)) or timeout <= 0:
        timeout = 300

    # gateway/setup/doctor 操作的是特定 profile，使用 payload 中的 profile_home；
    # profile.create 操作的是 root hermes_home（在根下创建 profile 目录）
    target_home_str = payload.get("profile_home")
    target_home = Path(target_home_str) if isinstance(target_home_str, str) and target_home_str else hermes_home

    if command_type == "profile.scan":
        return {"ok": True, "stdout": "Profile scan completed.", "stderr": ""}

    if command_type == "profile.create":
        profile_name = payload.get("profile_name")
        if not isinstance(profile_name, str) or not profile_name.strip():
            return {"ok": False, "stdout": "", "stderr": "profile_name is required"}
        args = ["profile", "create", profile_name.strip()]
        clone_mode = payload.get("clone_mode")
        clone_from = payload.get("clone_from")
        if clone_mode == "clone":
            args.append("--clone")
        if clone_mode == "clone-all":
            args.append("--clone-all")
        if isinstance(clone_from, str) and clone_from.strip():
            args.extend(["--clone-from", clone_from.strip()])
        if payload.get("no_alias") is True:
            args.append("--no-alias")
        return run_hermes(args, hermes_home, timeout=int(timeout))

    if command_type == "profile.rename":
        profile_name = command_profile_name(command)
        next_name = payload.get("new_name")
        if not profile_name:
            return {"ok": False, "stdout": "", "stderr": "profile_name is required"}
        if not isinstance(next_name, str) or not next_name.strip():
            return {"ok": False, "stdout": "", "stderr": "new_name is required"}
        return run_hermes(["profile", "rename", profile_name, next_name.strip()], hermes_home, timeout=int(timeout))

    if command_type == "profile.delete":
        profile_name = command_profile_name(command)
        if not profile_name:
            return {"ok": False, "stdout": "", "stderr": "profile_name is required"}
        return run_hermes(["profile", "delete", profile_name, "--yes"], hermes_home, timeout=int(timeout))

    # Gateway 控制命令
    if command_type == "gateway.start":
        return run_hermes(["gateway", "start"], target_home, timeout=int(timeout))

    if command_type == "gateway.stop":
        return run_hermes(["gateway", "stop"], target_home, timeout=int(timeout))

    if command_type == "gateway.restart":
        return run_hermes(["gateway", "restart"], target_home, timeout=int(timeout))

    # Doctor 检查
    if command_type == "doctor.run":
        return run_hermes(["doctor"], target_home, timeout=int(timeout))

    # Setup 运行（支持 section 参数：model/terminal/gateway/tools/agent/all）
    if command_type == "setup.run":
        section = payload.get("section", "all")
        if not isinstance(section, str):
            section = "all"
        args = ["setup"]
        if section != "all":
            args.append(section)
        return run_hermes(args, target_home, timeout=int(timeout))

    # 日志尾部读取（默认返回最后 100 行）
    if command_type == "logs.tail":
        lines = payload.get("lines", 100)
        if not isinstance(lines, int) or lines <= 0:
            lines = 100
        log_file = target_home / "logs" / "hermes.log"
        if log_file.exists():
            try:
                content = "\n".join(deque(log_file.read_text(encoding="utf-8", errors="replace").splitlines(), maxlen=lines))
            except OSError:
                content = "(log file read error)"
        else:
            content = "(no log file)"
        return {"ok": True, "stdout": truncate_output(content), "stderr": ""}

    # Config 读写（Phase 6）
    if command_type == "config.read":
        config_path = target_home / "config.yaml"
        if config_path.exists():
            try:
                content = config_path.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                return {"ok": False, "stdout": "", "stderr": f"Failed to read config.yaml: {e}"}
            return {"ok": True, "stdout": truncate_output(content), "stderr": ""}
        return {"ok": False, "stdout": "", "stderr": "config.yaml not found"}

    if command_type == "config.patch":
        content = payload.get("content", "")
        if not isinstance(content, str):
            return {"ok": False, "stdout": "", "stderr": "content is required"}
        config_path = target_home / "config.yaml"
        # 写入前备份
        if config_path.exists():
            try:
                import shutil
                shutil.copy2(config_path, config_path.with_suffix(".yaml.bak"))
            except OSError as e:
                return {"ok": False, "stdout": "", "stderr": f"Failed to backup config.yaml: {e}"}
        try:
            config_path.write_text(content, encoding="utf-8")
        except OSError as e:
            return {"ok": False, "stdout": "", "stderr": f"Failed to write config.yaml: {e}"}
        return {"ok": True, "stdout": "config.yaml updated", "stderr": ""}

    # SOUL 读写（Phase 6）
    if command_type == "soul.read":
        soul_path = target_home / "SOUL.md"
        if soul_path.exists():
            try:
                content = soul_path.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                return {"ok": False, "stdout": "", "stderr": f"Failed to read SOUL.md: {e}"}
            return {"ok": True, "stdout": truncate_output(content), "stderr": ""}
        return {"ok": True, "stdout": "", "stderr": ""}

    if command_type == "soul.update":
        content = payload.get("content", "")
        if not isinstance(content, str):
            return {"ok": False, "stdout": "", "stderr": "content is required"}
        soul_path = target_home / "SOUL.md"
        if soul_path.exists():
            try:
                import shutil
                shutil.copy2(soul_path, soul_path.with_suffix(".md.bak"))
            except OSError as e:
                return {"ok": False, "stdout": "", "stderr": f"Failed to backup SOUL.md: {e}"}
        try:
            soul_path.write_text(content, encoding="utf-8")
        except OSError as e:
            return {"ok": False, "stdout": "", "stderr": f"Failed to write SOUL.md: {e}"}
        return {"ok": True, "stdout": "SOUL.md updated", "stderr": ""}

    # Skills 列表（Phase 6）
    if command_type == "skills.list":
        skills_dir = target_home / "skills"
        if skills_dir.is_dir():
            try:
                names = [p.stem for p in skills_dir.glob("*.md") if p.is_file()]
            except OSError:
                names = []
        else:
            names = []
        return {"ok": True, "stdout": json.dumps(names), "stderr": ""}

    # Env 管理（Phase 6）—— 只返回 key，不返回 value
    if command_type == "env.status":
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

    if command_type == "env.set":
        key = payload.get("key")
        value = payload.get("value")
        if not isinstance(key, str) or not key.strip():
            return {"ok": False, "stdout": "", "stderr": "key is required"}
        if not isinstance(value, str):
            return {"ok": False, "stdout": "", "stderr": "value is required"}
        env_path = target_home / ".env"
        env_lines: list[str] = []
        found = False
        if env_path.exists():
            try:
                env_lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError as e:
                return {"ok": False, "stdout": "", "stderr": f"Failed to read .env: {e}"}
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
            env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
        except OSError as e:
            return {"ok": False, "stdout": "", "stderr": f"Failed to write .env: {e}"}
        return {"ok": True, "stdout": f"env {key} set", "stderr": ""}

    if command_type == "env.delete":
        key = payload.get("key")
        if not isinstance(key, str) or not key.strip():
            return {"ok": False, "stdout": "", "stderr": "key is required"}
        env_path = target_home / ".env"
        if not env_path.exists():
            return {"ok": True, "stdout": ".env not found, nothing to delete", "stderr": ""}
        try:
            env_lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError as e:
            return {"ok": False, "stdout": "", "stderr": f"Failed to read .env: {e}"}
        out_lines: list[str] = []
        for line in env_lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                line_key = stripped.split("=", 1)[0].strip()
                if line_key == key:
                    continue
            out_lines.append(line)
        try:
            env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
        except OSError as e:
            return {"ok": False, "stdout": "", "stderr": f"Failed to write .env: {e}"}
        return {"ok": True, "stdout": f"env {key} deleted", "stderr": ""}

    return {"ok": False, "stdout": "", "stderr": f"Unsupported command type: {command_type}"}


def poll_commands(base_url: str, node_id: str, hermes_home: Path) -> bool:
    response = get_json(base_url, f"/api/hub-agents/{node_id}/commands/poll")
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
        post_json(base_url, f"/api/hub-agents/{node_id}/commands/{command_id}/started", {})
        result = execute_command(command, hermes_home)
        finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        post_json(
            base_url,
            f"/api/hub-agents/{node_id}/commands/{command_id}/result",
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
        heartbeat(base_url, node_id, hermes_home)

    return executed


# ---------------------------------------------------------------------------
# Subcommand: init
# ---------------------------------------------------------------------------


def cmd_init(args: argparse.Namespace) -> None:
    """Generate a configuration file at the platform-standard path."""
    from hermes_hub_agent.config import (
        DEFAULT_HEARTBEAT_INTERVAL,
        DEFAULT_HERMES_HOME,
        DEFAULT_HUB_URL,
        DEFAULT_NODE_ID,
        DEFAULT_NODE_NAME,
        DEFAULT_TOKEN,
        config_path,
        write_config,
    )

    hub_url = args.hub_url or DEFAULT_HUB_URL
    node_id = args.node_id or DEFAULT_NODE_ID
    node_name = args.node_name or DEFAULT_NODE_NAME
    hermes_home = args.hermes_home or DEFAULT_HERMES_HOME
    heartbeat_interval = args.interval or DEFAULT_HEARTBEAT_INTERVAL
    token = args.token or DEFAULT_TOKEN

    cpath = write_config(
        hub_url=hub_url,
        node_id=node_id,
        node_name=node_name,
        hermes_home=hermes_home,
        heartbeat_interval=heartbeat_interval,
        token=token,
    )
    print(f"Configuration written to {cpath}")
    print(f"  hub_url: {hub_url}")
    print(f"  node_id: {node_id}")
    print(f"  node_name: {node_name}")
    print(f"  hermes_home: {hermes_home}")
    print(f"  heartbeat_interval: {heartbeat_interval}")
    if token:
        print(f"  token: {token}")


# ---------------------------------------------------------------------------
# Subcommand: service
# ---------------------------------------------------------------------------


def cmd_service(args: argparse.Namespace) -> None:
    """Manage the agent system service."""
    from hermes_hub_agent.service import (
        install_service,
        start_service,
        status_service,
        stop_service,
        uninstall_service,
    )

    action = args.service_action
    if action == "install":
        install_service()
    elif action == "start":
        start_service()
    elif action == "stop":
        stop_service()
    elif action == "uninstall":
        uninstall_service()
    elif action == "status":
        status_service()
    else:
        print(f"Unknown service action: {action}. Use install/start/stop/uninstall/status.")
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# Subcommand: run (default)
# ---------------------------------------------------------------------------


def cmd_run(args: argparse.Namespace) -> None:
    """Run the agent loop with config file support."""
    from hermes_hub_agent.config import load_config

    # Load config from file (platform-standard path, or explicit --config)
    config = load_config(args.config) if args.config else load_config()

    # Resolve values with priority: CLI arg > env var > config file > default
    def _resolve(cli_val: Any, env_key: str, config_key: str, default: Any) -> Any:
        if cli_val is not None:
            return cli_val
        env_val = os.environ.get(env_key)
        if env_val is not None:
            return env_val
        val = config.get(config_key)
        if val is not None:
            return val
        return default

    hub_url = _resolve(args.hub_url, "HERMES_HUB_URL", "hub_url", "http://localhost:3000")
    node_id = _resolve(args.node_id, "HERMES_NODE_ID", "node_id", "local")
    node_name = _resolve(args.node_name, "HERMES_NODE_NAME", "node_name", "local")
    hermes_home_str = _resolve(args.hermes_home, "HERMES_HOME", "hermes_home", str(default_hermes_home()))
    interval = int(_resolve(args.interval, "HERMES_HUB_HEARTBEAT_INTERVAL", "heartbeat_interval", 10))
    token = _resolve(args.token, "HERMES_HUB_TOKEN", "token", "")
    once = args.once

    hermes_home = Path(hermes_home_str).expanduser()
    register(hub_url, node_id, node_name, hermes_home, token=token)
    heartbeat(hub_url, node_id, hermes_home)
    print(f"registered node '{node_id}' and scanned {hermes_home}")

    if once:
        return

    while True:
        time.sleep(max(interval, 1))
        heartbeat(hub_url, node_id, hermes_home)
        poll_commands(hub_url, node_id, hermes_home)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Hermes Hub Agent")
    parser.add_argument(
        "--version", action="version", version=f"hermes-hub-agent {__version__}"
    )

    subparsers = parser.add_subparsers(dest="command", title="commands")

    # ---- run (default) ----
    run_parser = subparsers.add_parser("run", help="Run the agent loop (default)")
    run_parser.add_argument("--hub-url", default=None, help="Hub server URL")
    run_parser.add_argument("--node-id", default=None, help="Node identifier")
    run_parser.add_argument("--node-name", default=None, help="Human-readable node name")
    run_parser.add_argument("--hermes-home", default=None, help="Path to Hermes home directory")
    run_parser.add_argument("--interval", type=int, default=None, help="Heartbeat interval in seconds")
    run_parser.add_argument("--once", action="store_true", help="Register and send one heartbeat, then exit")
    run_parser.add_argument("--config", default=None, help="Path to config file")
    run_parser.add_argument("--token", default=None, help="Registration token for the hub server")

    # ---- init ----
    init_parser = subparsers.add_parser("init", help="Generate a configuration file")
    init_parser.add_argument("--hub-url", default=None, help="Hub server URL for config")
    init_parser.add_argument("--node-id", default=None, help="Node identifier for config")
    init_parser.add_argument("--node-name", default=None, help="Human-readable node name for config")
    init_parser.add_argument("--hermes-home", default=None, help="Hermes home path for config")
    init_parser.add_argument(
        "--interval", type=int, default=None,
        help="Heartbeat interval in seconds for config",
    )
    init_parser.add_argument("--token", default=None, help="Registration token for the hub server")

    # ---- service ----
    service_parser = subparsers.add_parser("service", help="Manage the agent system service")
    service_subs = service_parser.add_subparsers(dest="service_action", title="actions")
    service_subs.add_parser("install", help="Install as system service")
    service_subs.add_parser("start", help="Start the service")
    service_subs.add_parser("stop", help="Stop the service")
    service_subs.add_parser("uninstall", help="Uninstall the service")
    service_subs.add_parser("status", help="Show service status")

    # Backward compatibility: treat no subcommand as "run"
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help", "--version"):
        pass
    elif len(sys.argv) == 1 or sys.argv[1] not in ("run", "init", "service"):
        sys.argv.insert(1, "run")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init(args)
    elif args.command == "service":
        cmd_service(args)
    else:
        cmd_run(args)


if __name__ == "__main__":
    main()
