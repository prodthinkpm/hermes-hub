"""Runtime settings resolution for Hermes Hub Agent."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from hermes_hub_agent.config import load_config
from hermes_hub_agent.scanner import default_hermes_home


@dataclass(frozen=True)
class AgentSettings:
    hub_url: str
    vkey: str
    hermes_home: Path
    heartbeat_interval: int
    node_name: str

    @classmethod
    def from_args(cls, args: Any) -> "AgentSettings":
        config = load_config()

        def resolve_string(cli_value: str | None, env_name: str, config_key: str, default: str) -> str:
            return cli_value or os.environ.get(env_name) or str(config.get(config_key) or default)

        hub_url = resolve_string(args.hub_url, "HERMES_HUB_URL", "hub_url", "http://localhost:3000")
        vkey = resolve_string(args.vkey, "HERMES_HUB_VKEY", "vkey", "")
        heartbeat_interval = int(
            os.environ.get("HERMES_HUB_HEARTBEAT_INTERVAL")
            or config.get("heartbeat_interval")
            or 10
        )
        hermes_home = Path(
            os.environ.get("HERMES_HOME")
            or str(config.get("hermes_home") or default_hermes_home())
        ).expanduser()
        node_name = os.environ.get("HERMES_NODE_NAME") or socket.gethostname()
        return cls(
            hub_url=hub_url,
            vkey=vkey,
            hermes_home=hermes_home,
            heartbeat_interval=max(heartbeat_interval, 1),
            node_name=node_name,
        )
