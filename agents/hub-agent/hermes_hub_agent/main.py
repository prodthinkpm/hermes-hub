from __future__ import annotations

import argparse
import os
import platform
import socket
import sys
import time
from pathlib import Path
from typing import Any

from hermes_hub_agent import __version__
from hermes_hub_agent.client import HubClient
from hermes_hub_agent.commands import poll_commands
from hermes_hub_agent.scanner import default_hermes_home, scan_profiles


def is_docker_runtime() -> bool:
    if os.path.exists("/.dockerenv"):
        return True
    try:
        return "docker" in Path("/proc/1/cgroup").read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def build_register_payload(node_id: str, node_name: str, hermes_home: Path) -> dict[str, Any]:
    tags = ["local"]
    if is_docker_runtime():
        tags.append("docker")
    return {
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


def build_heartbeat_payload(hermes_home: Path) -> dict[str, Any]:
    profiles = scan_profiles(hermes_home)
    return {
        "status": "online",
        "summary": {
            "profiles_total": len(profiles),
            "gateway_running": sum(1 for profile in profiles if profile.get("gateway_status") == "running"),
        },
        "profiles": profiles,
    }


def cmd_init(args: argparse.Namespace) -> None:
    """Generate a configuration file at the platform-standard path."""
    from hermes_hub_agent.config import (
        DEFAULT_HEARTBEAT_INTERVAL,
        DEFAULT_HERMES_HOME,
        DEFAULT_HUB_URL,
        DEFAULT_NODE_ID,
        DEFAULT_NODE_NAME,
        DEFAULT_VKEY,
        write_config,
    )

    hub_url = args.hub_url or DEFAULT_HUB_URL
    node_id = args.node_id or DEFAULT_NODE_ID
    node_name = args.node_name or DEFAULT_NODE_NAME
    hermes_home = args.hermes_home or DEFAULT_HERMES_HOME
    heartbeat_interval = args.interval or DEFAULT_HEARTBEAT_INTERVAL
    vkey = args.vkey or DEFAULT_VKEY

    config_file = write_config(
        hub_url=hub_url,
        node_id=node_id,
        node_name=node_name,
        hermes_home=hermes_home,
        heartbeat_interval=heartbeat_interval,
        vkey=vkey,
    )
    print(f"Configuration written to {config_file}")
    print(f"  hub_url: {hub_url}")
    print(f"  node_id: {node_id}")
    print(f"  node_name: {node_name}")
    print(f"  hermes_home: {hermes_home}")
    print(f"  heartbeat_interval: {heartbeat_interval}")
    if vkey:
        print(f"  vkey: {vkey}")


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


def cmd_run(args: argparse.Namespace) -> None:
    """Run the agent loop with config file support."""
    from hermes_hub_agent.config import load_config

    config = load_config(args.config) if args.config else load_config()

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
    vkey = _resolve(args.vkey, "HERMES_HUB_VKEY", "vkey", "")

    hermes_home = Path(hermes_home_str).expanduser()
    client = HubClient(hub_url, vkey=vkey)
    try:
        register_response = client.register(build_register_payload(node_id, node_name, hermes_home))
        registered_node_id = register_response.get("node_id")
        if isinstance(registered_node_id, str) and registered_node_id:
            node_id = registered_node_id
        client.heartbeat(node_id, build_heartbeat_payload(hermes_home))
        print(f"registered node '{node_id}' and scanned {hermes_home}")

        if args.once:
            return

        while True:
            time.sleep(max(interval, 1))
            client.heartbeat(node_id, build_heartbeat_payload(hermes_home))
            if poll_commands(client, node_id, hermes_home):
                client.heartbeat(node_id, build_heartbeat_payload(hermes_home))
    except RuntimeError as exc:
        message = str(exc)
        print(f"Hub Agent failed: {message}", file=sys.stderr)
        if "401 Unauthorized" in message:
            print(
                "Hint: verify the token was copied from this Hub's Nodes page, "
                "the Hub server was restarted with the latest build, and it is using the same hub.db.",
                file=sys.stderr,
            )
            print(
                "For per-node tokens, prefer the generated command that includes --node-id.",
                file=sys.stderr,
            )
        raise SystemExit(1) from None
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Hermes Hub Agent")
    parser.add_argument("--version", action="version", version=f"hermes-hub-agent {__version__}")

    subparsers = parser.add_subparsers(dest="command", title="commands")

    run_parser = subparsers.add_parser("run", help="Run the agent loop (default)")
    run_parser.add_argument("--hub-url", default=None, help="Hub server URL")
    run_parser.add_argument("--node-id", default=None, help="Node identifier")
    run_parser.add_argument("--node-name", default=None, help="Human-readable node name")
    run_parser.add_argument("--hermes-home", default=None, help="Path to Hermes home directory")
    run_parser.add_argument("--interval", type=int, default=None, help="Heartbeat interval in seconds")
    run_parser.add_argument("--once", action="store_true", help="Register and send one heartbeat, then exit")
    run_parser.add_argument("--config", default=None, help="Path to config file")
    run_parser.add_argument("--vkey", default=None, help="Verification key (vkey) for the hub server")

    init_parser = subparsers.add_parser("init", help="Generate a configuration file")
    init_parser.add_argument("--hub-url", default=None, help="Hub server URL for config")
    init_parser.add_argument("--node-id", default=None, help="Node identifier for config")
    init_parser.add_argument("--node-name", default=None, help="Human-readable node name for config")
    init_parser.add_argument("--hermes-home", default=None, help="Hermes home path for config")
    init_parser.add_argument("--interval", type=int, default=None, help="Heartbeat interval in seconds for config")
    init_parser.add_argument("--vkey", default=None, help="Verification key (vkey) for the hub server")

    service_parser = subparsers.add_parser("service", help="Manage the agent system service")
    service_subs = service_parser.add_subparsers(dest="service_action", title="actions")
    service_subs.add_parser("install", help="Install as system service")
    service_subs.add_parser("start", help="Start the service")
    service_subs.add_parser("stop", help="Stop the service")
    service_subs.add_parser("uninstall", help="Uninstall the service")
    service_subs.add_parser("status", help="Show service status")

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
