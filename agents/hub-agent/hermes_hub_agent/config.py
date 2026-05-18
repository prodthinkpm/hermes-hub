"""Configuration file generation and loading for Hermes Hub Agent."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any


def config_dir() -> Path:
    """Return the platform-standard config directory."""
    system = sys.platform
    if system == "win32":
        base = os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))
        return Path(base) / "hermes-hub-agent"
    elif system == "darwin":
        return Path.home() / "Library" / "Application Support" / "hermes-hub-agent"
    else:
        xdg_config = os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))
        return Path(xdg_config) / "hermes-hub-agent"


def config_path() -> Path:
    """Return the full path to the config file."""
    return config_dir() / "config.yaml"


DEFAULT_HUB_URL = "http://localhost:3000"
DEFAULT_NODE_ID = "local"
DEFAULT_NODE_NAME = "My Node"
DEFAULT_HERMES_HOME = "~/.hermes"
DEFAULT_HEARTBEAT_INTERVAL = 10
DEFAULT_TOKEN = ""


def generate_config_content(
    hub_url: str = DEFAULT_HUB_URL,
    node_id: str = DEFAULT_NODE_ID,
    node_name: str = DEFAULT_NODE_NAME,
    hermes_home: str = DEFAULT_HERMES_HOME,
    heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
    token: str = DEFAULT_TOKEN,
) -> str:
    """Generate YAML config file content."""
    lines = [
        f"hub_url: {hub_url}",
        f"node_id: {node_id}",
        f"node_name: {node_name}",
        f"hermes_home: {hermes_home}",
        f"heartbeat_interval: {heartbeat_interval}",
    ]
    if token:
        lines.append(f"token: {token}")
    return "\n".join(lines) + "\n"


def write_config(
    hub_url: str = DEFAULT_HUB_URL,
    node_id: str = DEFAULT_NODE_ID,
    node_name: str = DEFAULT_NODE_NAME,
    hermes_home: str = DEFAULT_HERMES_HOME,
    heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
    token: str = DEFAULT_TOKEN,
) -> Path:
    """Write the config file and return its path."""
    cdir = config_dir()
    cdir.mkdir(parents=True, exist_ok=True)
    cpath = config_path()
    content = generate_config_content(
        hub_url=hub_url,
        node_id=node_id,
        node_name=node_name,
        hermes_home=hermes_home,
        heartbeat_interval=heartbeat_interval,
        token=token,
    )
    cpath.write_text(content, encoding="utf-8")
    return cpath


def load_config(file_path: str | None = None) -> dict[str, Any]:
    """Load configuration from a YAML file.

    Args:
        file_path: Path to config file. If None, uses the platform-standard path.

    Returns:
        Dict of config values. Only keys with non-empty values are included.
    """
    cpath = Path(file_path) if file_path else config_path()
    if not cpath.exists():
        return {}

    result: dict[str, Any] = {}
    try:
        for line in cpath.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if ":" not in stripped:
                continue
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()
            if value.startswith(("'", '"')) and value.endswith(("'", '"')):
                value = value[1:-1]
            if not value:
                continue
            if key == "heartbeat_interval":
                try:
                    result[key] = int(value)
                except ValueError:
                    pass
            else:
                result[key] = value
    except OSError:
        pass
    return result
