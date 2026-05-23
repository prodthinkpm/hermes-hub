from __future__ import annotations

import json
import os
import platform
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import __version__
from .hermes_imports import default_hermes_home
from .hub_client import HubClient
from .scanner import scan_profiles


@dataclass
class AgentConfig:
    hub_url: str
    hub_token: str
    hermes_home: str
    node_id: str = ""
    hermes_binary: str = "hermes"
    poll_interval_seconds: int = 3
    heartbeat_interval_seconds: int = 10
    request_timeout_seconds: int = 10
    command_timeout_seconds: int = 300
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "AgentConfig":
        hostname = socket.gethostname()

        hub_url = (
            os.environ.get("HERMES_HUB_URL")
            or "http://127.0.0.1:3000"
        ).rstrip("/")

        hub_token = (
            os.environ.get("HERMES_HUB_TOKEN")
        )

        hermes_home = (
            os.environ.get("HERMES_HOME")
            or default_hermes_home()
        )

        tags_raw = os.environ.get("HERMES_NODE_TAGS") or ""
        tags = [item.strip() for item in tags_raw.split(",") if item.strip()]

        return cls(
            hub_url=hub_url,
            hub_token=hub_token,
            hermes_home=str(Path(hermes_home).expanduser()),
            hermes_binary=os.environ.get("HERMES_BINARY") or "hermes",
            poll_interval_seconds=int(os.environ.get("HERMES_HUB_POLL_INTERVAL", "3")),
            heartbeat_interval_seconds=int(os.environ.get("HERMES_HUB_HEARTBEAT_INTERVAL", "10")),
            request_timeout_seconds=int(os.environ.get("HERMES_HUB_REQUEST_TIMEOUT", "10")),
            command_timeout_seconds=int(os.environ.get("HERMES_HUB_COMMAND_TIMEOUT", "300")),
            tags=tags,
        )


def detect_hermes_version(config: AgentConfig) -> str | None:
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"

        result = subprocess.run(
            [config.hermes_binary, "--version"],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=5,
            env=env,
        )
        output = (result.stdout or result.stderr or "").strip()
        return output or None
    except Exception:
        return None


def get_basic_metrics(config: AgentConfig) -> dict[str, Any]:
    metrics: dict[str, Any] = {}

    try:
        import psutil

        metrics["cpu_percent"] = psutil.cpu_percent(interval=None)
        metrics["memory_percent"] = psutil.virtual_memory().percent

        usage = psutil.disk_usage(config.hermes_home if Path(config.hermes_home).exists() else str(Path.home()))
        metrics["disk_free_gb"] = round(usage.free / (1024 ** 3), 2)
        metrics["disk_total_gb"] = round(usage.total / (1024 ** 3), 2)
    except Exception as exc:
        metrics["error"] = str(exc)

    return metrics


def summarize_profiles(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "profiles_total": len(profiles),
        "gateway_running": sum(1 for item in profiles if item.get("gateway_status") == "running"),
        "profiles_error": sum(1 for item in profiles if not item.get("ok", True)),
    }


def build_register_payload(config: AgentConfig) -> dict[str, Any]:
    profiles = scan_profiles(config.hermes_home)

    return {
        "hostname": socket.gethostname(),
        "agent_version": __version__,
        "hermes_version": detect_hermes_version(config),
        "hermes_home": config.hermes_home,
        "runtime": {
            "os": platform.system().lower(),
            "arch": platform.machine(),
        },
        "capabilities": {
            "profiles": True,
            "setup": True,
            "gateway": True,
            "logs": True,
            "sessions": True,
            "skills": True,
            "cron": True,
            "soul": True,
            "config": True,
            "env": True,
            "write_actions": True,
        },
        "tags": config.tags,
        "profiles": profiles,
    }


def build_heartbeat_payload(config: AgentConfig) -> dict[str, Any]:
    profiles = scan_profiles(config.hermes_home)

    return {
        "status": "online",
        "node_id": config.node_id,
        "timestamp": int(time.time()),
        "metrics": get_basic_metrics(config),
        "summary": summarize_profiles(profiles),
        "profiles": profiles,
    }


def send_heartbeat(config: AgentConfig, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = payload if payload is not None else build_heartbeat_payload(config)
    with HubClient(config) as client:
        return client.send_heartbeat(config.node_id, body)


def heartbeat_loop(config: AgentConfig) -> None:
    while True:
        try:
            result = send_heartbeat(config)
            if not result.get("ok", True):
                print(f"[hub-agent] heartbeat failed: {result}", flush=True)
        except Exception as exc:
            print(f"[hub-agent] heartbeat exception: {exc}", flush=True)

        time.sleep(config.heartbeat_interval_seconds)
