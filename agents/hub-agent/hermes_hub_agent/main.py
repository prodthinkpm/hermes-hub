from __future__ import annotations

import argparse
import sys

from hermes_hub_agent import __version__
from hermes_hub_agent.runtime import AgentRuntime
from hermes_hub_agent.settings import AgentSettings


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
    """Run the agent runtime with config file and environment support."""
    settings = AgentSettings.from_args(args)
    runtime = AgentRuntime(settings)
    runtime.run(once=args.once)


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
