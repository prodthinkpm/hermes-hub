"""HTTP client for the Hermes Hub controller API."""

from __future__ import annotations

from typing import Any

import httpx


class HubClient:
    """Small synchronous wrapper around Hub Agent API calls."""

    def __init__(self, base_url: str, vkey: str = "", timeout: float = 10) -> None:
        self.base_url = base_url.rstrip("/")
        self.vkey = vkey.strip()
        headers: dict[str, str] = {
            "Accept": "application/json",
        }
        if self.vkey:
            headers["Authorization"] = f"Bearer {self.vkey}"
            headers["X-Hermes-Hub-Vkey"] = self.vkey
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers=headers,
            trust_env=False,
        )

    def close(self) -> None:
        self._client.close()

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = self._client.request(method, path, json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            raise RuntimeError(f"{exc.response.status_code} {exc.response.reason_phrase}: {body}") from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"Hub server unreachable: {exc}") from exc

        if not response.content:
            return {"ok": True}
        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Invalid JSON response from Hub: {response.text}") from exc
        return data if isinstance(data, dict) else {"ok": True, "data": data}

    def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        register_payload = dict(payload)
        if self.vkey and not register_payload.get("vkey"):
            register_payload["vkey"] = self.vkey
        return self._request("POST", "/api/hub-agents/register", register_payload)

    def heartbeat(self, node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/api/hub-agents/{node_id}/heartbeat", payload)

    def poll_commands(self, node_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/hub-agents/{node_id}/commands/poll")

    def command_started(self, node_id: str, command_id: str) -> dict[str, Any]:
        return self._request("POST", f"/api/hub-agents/{node_id}/commands/{command_id}/started", {})

    def command_result(self, node_id: str, command_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/api/hub-agents/{node_id}/commands/{command_id}/result", payload)
