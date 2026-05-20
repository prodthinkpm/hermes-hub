from __future__ import annotations

import argparse
import json
import sys
import threading
from typing import Any

from .command_runner import CommandRunner
from .heartbeat import AgentConfig, build_heartbeat_payload, build_register_payload, heartbeat_loop
from .hub_client import HubClient
from .scanner import scan_profiles


def print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def _make_config(args: argparse.Namespace) -> AgentConfig:
    config = AgentConfig.from_env()
    if args.hub_url:
        config.hub_url = args.hub_url
    if args.vkey:
        config.hub_token = args.vkey
    return config


def cmd_scan(args: argparse.Namespace) -> None:
    config = _make_config(args)
    print_json({"ok": True, "profiles": scan_profiles(config.hermes_home)})


def cmd_heartbeat_once(args: argparse.Namespace) -> None:
    config = _make_config(args)
    print_json(build_heartbeat_payload(config))


def cmd_register(args: argparse.Namespace) -> None:
    config = _make_config(args)

    if args.dry_run:
        print_json(build_register_payload(config))
        return

    client = HubClient(config)
    try:
        response = client.register(build_register_payload(config))
        print_json(response)
        if isinstance(response.get("node_id"), str):
            print(f"[hub-agent] registered as node_id={response['node_id']}")
    finally:
        client.close()


def cmd_daemon(args: argparse.Namespace) -> None:
    config = _make_config(args)

    if not args.no_register:
        client = HubClient(config)
        try:
            response = client.register(build_register_payload(config))
            print_json(response)
            # 捕获 server 返回的 node_id，用于后续心跳和命令轮询
            node_id = response.get("node_id")
            if isinstance(node_id, str) and node_id:
                config.node_id = node_id
                print(f"[hub-agent] registered as node_id={node_id}")
        finally:
            client.close()

    command_runner = CommandRunner(config)

    command_thread = threading.Thread(
        target=command_runner.loop,
        name="command-runner",
        daemon=True,
    )
    command_thread.start()

    try:
        heartbeat_loop(config)
    finally:
        command_runner.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hermes-hub-agent")
    parser.add_argument("--hub-url", default=None, help="Hub server URL")
    parser.add_argument("--vkey", default=None, help="Verification key from Hub Nodes page")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="Scan local Hermes profiles and print snapshots")
    scan.set_defaults(func=cmd_scan)

    hb = sub.add_parser("heartbeat-once", help="Build a heartbeat payload and print it")
    hb.set_defaults(func=cmd_heartbeat_once)

    register = sub.add_parser("register", help="Register this node with Hermes Hub")
    register.add_argument("--dry-run", action="store_true", help="Only print registration payload")
    register.set_defaults(func=cmd_register)

    daemon = sub.add_parser("daemon", help="Run heartbeat and command polling loops")
    daemon.add_argument("--no-register", action="store_true", help="Skip initial register request")
    daemon.set_defaults(func=cmd_daemon)

    return parser


def main() -> None:
    parser = build_parser()

    # Default to daemon if no subcommand given
    subcommands = {"scan", "heartbeat-once", "register", "daemon", "-h", "--help"}
    if not subcommands.intersection(sys.argv[1:]):
        sys.argv.append("daemon")

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
