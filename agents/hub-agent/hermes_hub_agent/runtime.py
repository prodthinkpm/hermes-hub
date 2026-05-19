"""Hermes Hub Agent daemon runtime."""

from __future__ import annotations

import os
import platform
import socket
import sys
import time
from pathlib import Path
from typing import Any

from hermes_hub_agent import __version__
from hermes_hub_agent.client import HubClient
from hermes_hub_agent.commands import CommandService, create_default_command_service
from hermes_hub_agent.scanner import scan_profiles
from hermes_hub_agent.settings import AgentSettings


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
            "logs": True,
            "commands": True,
            "config": True,
            "soul": True,
            "env": True,
            "gateway": True,
            "setup": True,
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


class AgentRuntime:
    def __init__(
        self,
        settings: AgentSettings,
        client: HubClient | None = None,
        commands: CommandService | None = None,
    ) -> None:
        self.settings = settings
        self.client = client or HubClient(settings.hub_url, vkey=settings.vkey)
        self.commands = commands or create_default_command_service()
        self.node_id: str | None = None

    def close(self) -> None:
        self.client.close()

    def register(self) -> str:
        response = self.client.register(build_register_payload(self.settings.node_name, self.settings.hermes_home))
        node_id = response.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            raise RuntimeError("Server did not return a node_id")
        self.node_id = node_id
        return node_id

    def heartbeat(self) -> None:
        if not self.node_id:
            raise RuntimeError("Agent is not registered")
        self.client.heartbeat(self.node_id, build_heartbeat_payload(self.settings.hermes_home))

    def poll_once(self) -> bool:
        if not self.node_id:
            raise RuntimeError("Agent is not registered")
        return self.commands.poll_and_execute(self.client, self.node_id, self.settings.hermes_home)

    def run(self, once: bool = False) -> None:
        try:
            node_id = self.register()
            self.heartbeat()
            print(f"registered node '{node_id}' and scanned {self.settings.hermes_home}")
            if once:
                return
            while True:
                time.sleep(self.settings.heartbeat_interval)
                self.heartbeat()
                if self.poll_once():
                    self.heartbeat()
        except RuntimeError as exc:
            message = str(exc)
            print(f"Hub Agent failed: {message}", file=sys.stderr)
            raise SystemExit(1) from None
        finally:
            self.close()
