"""Service management for Hermes Hub Agent.

Supports install/start/stop/uninstall/status across Linux (systemd user unit),
macOS (launchd), and Windows (Scheduled Task).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def _python_exe() -> str:
    return sys.executable


def _config_path() -> str:
    from hermes_hub_agent.config import config_path

    return str(config_path())


def _run(*args: str, check: bool = False) -> tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        p = subprocess.run(
            list(args),
            text=True,
            capture_output=True,
            timeout=30,
            shell=False,
        )
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except FileNotFoundError:
        return -1, "", f"Command not found: {args[0]}"
    except subprocess.TimeoutExpired:
        return -1, "", f"Command timed out: {' '.join(args)}"


# ---------------------------------------------------------------------------
# Linux — systemd user unit
# ---------------------------------------------------------------------------

_SYSTEMD_USER_DIR = Path.home() / ".config" / "systemd" / "user"
_SYSTEMD_UNIT_NAME = "hermes-hub-agent.service"
_SYSTEMD_UNIT_PATH = _SYSTEMD_USER_DIR / _SYSTEMD_UNIT_NAME

_SYSTEMD_UNIT_TEMPLATE = """\
[Unit]
Description=Hermes Hub Agent
After=network.target

[Service]
Type=simple
ExecStart={python_exe} -m hermes_hub_agent.main --config {config_path}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
"""


def _systemd_install() -> None:
    _SYSTEMD_USER_DIR.mkdir(parents=True, exist_ok=True)
    unit_content = _SYSTEMD_UNIT_TEMPLATE.format(
        python_exe=_python_exe(),
        config_path=_config_path(),
    )
    _SYSTEMD_UNIT_PATH.write_text(unit_content, encoding="utf-8")
    print(f"Unit file written to {_SYSTEMD_UNIT_PATH}")

    rc, out, err = _run("systemctl", "--user", "daemon-reload")
    if rc != 0:
        print(f"Warning: systemctl --user daemon-reload failed: {err or out}")
    else:
        print("systemd user daemon reloaded")

    rc, out, err = _run("systemctl", "--user", "enable", _SYSTEMD_UNIT_NAME)
    if rc != 0:
        print(f"Warning: systemctl --user enable failed: {err or out}")
    else:
        print(f"Service '{_SYSTEMD_UNIT_NAME}' enabled")


def _systemd_start() -> None:
    rc, out, err = _run("systemctl", "--user", "start", _SYSTEMD_UNIT_NAME)
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"Service '{_SYSTEMD_UNIT_NAME}' started")


def _systemd_stop() -> None:
    rc, out, err = _run("systemctl", "--user", "stop", _SYSTEMD_UNIT_NAME)
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"Service '{_SYSTEMD_UNIT_NAME}' stopped")


def _systemd_uninstall() -> None:
    if not _SYSTEMD_UNIT_PATH.exists():
        print("Service is not installed (unit file not found).")
        return

    _run("systemctl", "--user", "stop", _SYSTEMD_UNIT_NAME)
    _run("systemctl", "--user", "disable", _SYSTEMD_UNIT_NAME)
    try:
        _SYSTEMD_UNIT_PATH.unlink()
    except OSError as e:
        print(f"Warning: Could not remove unit file: {e}")
    _run("systemctl", "--user", "daemon-reload")
    print("Service uninstalled")


def _systemd_status() -> None:
    rc, out, err = _run("systemctl", "--user", "status", _SYSTEMD_UNIT_NAME)
    print(out or err or "Unable to determine service status")


# ---------------------------------------------------------------------------
# macOS — launchd
# ---------------------------------------------------------------------------

_LAUNCHD_DIR = Path.home() / "Library" / "LaunchAgents"
_LAUNCHD_LABEL = "com.hermes-hub.agent"
_LAUNCHD_PLIST_PATH = _LAUNCHD_DIR / f"{_LAUNCHD_LABEL}.plist"
_LAUNCHD_LOG_DIR = Path.home() / "Library" / "Logs" / "hermes-hub-agent"

_LAUNCHD_PLIST_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" \
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_exe}</string>
        <string>-m</string>
        <string>hermes_hub_agent.main</string>
        <string>--config</string>
        <string>{config_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{log_dir}/hermes-hub-agent.log</string>
    <key>StandardErrorPath</key>
    <string>{log_dir}/hermes-hub-agent.log</string>
</dict>
</plist>
"""


def _get_uid() -> str:
    return str(os.getuid() if hasattr(os, "getuid") else 501)


def _launchd_install() -> None:
    _LAUNCHD_DIR.mkdir(parents=True, exist_ok=True)
    _LAUNCHD_LOG_DIR.mkdir(parents=True, exist_ok=True)
    plist_content = _LAUNCHD_PLIST_TEMPLATE.format(
        label=_LAUNCHD_LABEL,
        python_exe=_python_exe(),
        config_path=_config_path(),
        log_dir=_LAUNCHD_LOG_DIR,
    )
    _LAUNCHD_PLIST_PATH.write_text(plist_content, encoding="utf-8")
    print(f"LaunchAgent plist written to {_LAUNCHD_PLIST_PATH}")

    uid = _get_uid()
    rc, out, err = _run("launchctl", "bootstrap", f"gui/{uid}", str(_LAUNCHD_PLIST_PATH))
    if rc != 0:
        # If already bootstrapped, try bootout first then bootstrap
        _run("launchctl", "bootout", f"gui/{uid}", str(_LAUNCHD_PLIST_PATH))
        rc2, out2, err2 = _run("launchctl", "bootstrap", f"gui/{uid}", str(_LAUNCHD_PLIST_PATH))
        if rc2 != 0:
            print(f"Warning: launchctl bootstrap failed: {err2 or out2}")
            return
    print("LaunchAgent loaded")


def _launchd_start() -> None:
    uid = _get_uid()
    rc, out, err = _run("launchctl", "kickstart", f"gui/{uid}/{_LAUNCHD_LABEL}")
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"LaunchAgent '{_LAUNCHD_LABEL}' started")


def _launchd_stop() -> None:
    uid = _get_uid()
    rc, out, err = _run("launchctl", "bootout", f"gui/{uid}/{_LAUNCHD_LABEL}")
    if rc != 0:
        # It's ok if it's not running
        if "not found" in (err or out).lower() or "could not find" in (err or out).lower():
            print("Service is not running.")
            return
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"LaunchAgent '{_LAUNCHD_LABEL}' stopped")


def _launchd_uninstall() -> None:
    if not _LAUNCHD_PLIST_PATH.exists():
        print("Service is not installed (plist not found).")
        return

    _launchd_stop()
    try:
        _LAUNCHD_PLIST_PATH.unlink()
    except OSError as e:
        print(f"Warning: Could not remove plist file: {e}")
    print("Service uninstalled")


def _launchd_status() -> None:
    uid = _get_uid()
    rc, out, err = _run("launchctl", "print", f"gui/{uid}/{_LAUNCHD_LABEL}")
    if rc != 0:
        print(err or "Service not found/not loaded")
    else:
        print(out)


# ---------------------------------------------------------------------------
# Windows — Scheduled Task (schtasks)
# ---------------------------------------------------------------------------

_WIN_TASK_NAME = "Hermes Hub Agent"


def _win_task_exists() -> bool:
    rc, out, err = _run(
        "schtasks", "/query", "/tn", _WIN_TASK_NAME, "/fo", "csv", "/nh"
    )
    return rc == 0


def _win_install() -> None:
    # Build the command line: python.exe -m hermes_hub_agent.main --config <path> --once
    cmd = f"{_python_exe()} -m hermes_hub_agent.main --config {_config_path()} --once"
    install_cmd = [
        "schtasks",
        "/create",
        "/tn",
        _WIN_TASK_NAME,
        "/tr",
        cmd,
        "/sc",
        "minute",
        "/mo",
        "10",
        "/f",
    ]
    rc, out, err = _run(*install_cmd)
    if rc != 0:
        print(f"Error creating scheduled task: {err or out}")
        raise SystemExit(1)
    print(f"Scheduled task '{_WIN_TASK_NAME}' created (runs every 10 minutes)")


def _win_start() -> None:
    if not _win_task_exists():
        print("Scheduled task is not installed. Run 'hermes-hub-agent service install' first.")
        raise SystemExit(1)
    rc, out, err = _run("schtasks", "/run", "/tn", _WIN_TASK_NAME)
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"Scheduled task '{_WIN_TASK_NAME}' started")


def _win_stop() -> None:
    if not _win_task_exists():
        print("Scheduled task is not installed.")
        return
    rc, out, err = _run("schtasks", "/end", "/tn", _WIN_TASK_NAME)
    if rc != 0:
        # It's ok if no instance is running
        if "no running instance" in (err or out).lower():
            print("No running instance of the task.")
            return
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"Scheduled task '{_WIN_TASK_NAME}' stopped")


def _win_uninstall() -> None:
    if not _win_task_exists():
        print("Scheduled task is not installed.")
        return
    rc, out, err = _run("schtasks", "/delete", "/tn", _WIN_TASK_NAME, "/f")
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    print(f"Scheduled task '{_WIN_TASK_NAME}' deleted")


def _win_status() -> None:
    if not _win_task_exists():
        print("Scheduled task is not installed.")
        return
    rc, out, err = _run("schtasks", "/query", "/tn", _WIN_TASK_NAME, "/fo", "list", "/v")
    if rc != 0:
        print(f"Error: {err or out}")
        raise SystemExit(1)
    # Print relevant lines
    for line in (out or "").splitlines():
        line_lower = line.lower()
        if any(
            kw in line_lower
            for kw in ("taskname", "status", "schedule", "next run", "last run")
        ):
            print(line)


# ---------------------------------------------------------------------------
# Public API — platform dispatch
# ---------------------------------------------------------------------------


def _is_linux() -> bool:
    return sys.platform == "linux"


def _is_macos() -> bool:
    return sys.platform == "darwin"


def _is_windows() -> bool:
    return sys.platform == "win32"


def install_service(config_file: str | None = None) -> None:
    """Install the agent as a system service."""
    if config_file:
        # Override config path used in service templates
        global _config_path
        _config_path = lambda: config_file  # type: ignore[assignment]

    if _is_linux():
        _systemd_install()
    elif _is_macos():
        _launchd_install()
    elif _is_windows():
        _win_install()
    else:
        print(f"Unsupported platform: {sys.platform}")
        raise SystemExit(1)


def start_service() -> None:
    """Start the agent service."""
    if _is_linux():
        _systemd_start()
    elif _is_macos():
        _launchd_start()
    elif _is_windows():
        _win_start()
    else:
        print(f"Unsupported platform: {sys.platform}")
        raise SystemExit(1)


def stop_service() -> None:
    """Stop the agent service."""
    if _is_linux():
        _systemd_stop()
    elif _is_macos():
        _launchd_stop()
    elif _is_windows():
        _win_stop()
    else:
        print(f"Unsupported platform: {sys.platform}")
        raise SystemExit(1)


def uninstall_service() -> None:
    """Uninstall the agent service."""
    if _is_linux():
        _systemd_uninstall()
    elif _is_macos():
        _launchd_uninstall()
    elif _is_windows():
        _win_uninstall()
    else:
        print(f"Unsupported platform: {sys.platform}")
        raise SystemExit(1)


def status_service() -> None:
    """Show the agent service status."""
    if _is_linux():
        _systemd_status()
    elif _is_macos():
        _launchd_status()
    elif _is_windows():
        _win_status()
    else:
        print(f"Unsupported platform: {sys.platform}")
        raise SystemExit(1)
