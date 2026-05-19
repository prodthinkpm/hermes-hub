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


def build_register_payload(node_name: str, hermes_home: Path) -> dict[str, Any]:
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
        DEFAULT_VKEY,
        write_config,
    )

    hub_url = args.hub_url or DEFAULT_HUB_URL
    hermes_home = args.hermes_home or DEFAULT_HERMES_HOME
    heartbeat_interval = args.interval or DEFAULT_HEARTBEAT_INTERVAL
    vkey = args.vkey or DEFAULT_VKEY

    config_file = write_config(
        hub_url=hub_url,
        hermes_home=hermes_home,
        heartbeat_interval=heartbeat_interval,
        vkey=vkey,
    )
    print(f"Configuration written to {config_file}")
    print(f"  hub_url: {hub_url}")
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

    config = load_config()

    def _or(val: str | None, env: str, cfg: str, default: str) -> str:
        return val or os.environ.get(env) or config.get(cfg) or default

    hub_url = _or(args.hub_url, "HERMES_HUB_URL", "hub_url", "http://localhost:3000")
    vkey = _or(args.vkey, "HERMES_HUB_VKEY", "vkey", "")
    interval = int(config.get("heartbeat_interval") or os.environ.get("HERMES_HUB_HEARTBEAT_INTERVAL") or 10)

    hermes_home = Path(os.environ.get("HERMES_HOME") or config.get("hermes_home") or str(default_hermes_home())).expanduser()
    client = HubClient(hub_url, vkey=vkey)
    try:
        register_response = client.register(build_register_payload(socket.gethostname(), hermes_home))
        node_id = register_response.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            raise RuntimeError("Server did not return a node_id")
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
                "Hint: verify the vkey was copied from this Hub's Nodes page, "
                "the Hub server was restarted with the latest build, and it is using the same hub.db.",
                file=sys.stderr,
            )
            print(
                "For per-node vkeys, use the generated command: hermes-hub-agent --hub-url=... --vkey=<vkey>",
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
    run_parser.add_argument("--vkey", default=None, help="Verification key (vkey) for the hub server")
    run_parser.add_argument("--once", action="store_true", help=argparse.SUPPRESS)

    init_parser = subparsers.add_parser("init", help="Generate a configuration file")
    init_parser.add_argument("--hub-url", default=None, help="Hub server URL for config")
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
