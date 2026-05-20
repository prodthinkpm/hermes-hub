from __future__ import annotations

from typing import Any

import httpx


class HubClient:
    """Synchronous wrapper around Hermes Hub Server API calls.

    It accepts either:
      - HubClient(config)
      - HubClient(base_url, vkey="...")
    """

    def __init__(self, config_or_base_url: Any, vkey: str = "", timeout: float | None = None) -> None:
        if isinstance(config_or_base_url, str):
            base_url = config_or_base_url
            token = vkey
            client_timeout = 10 if timeout is None else timeout
        else:
            config = config_or_base_url
            base_url = getattr(config, "hub_url")
            token = getattr(config, "hub_token", "") or getattr(config, "vkey", "")
            client_timeout = getattr(config, "request_timeout_seconds", None) or timeout or 10

        self.base_url = str(base_url).rstrip("/")
        self.vkey = str(token or "").strip()

        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        if self.vkey:
            headers["Authorization"] = f"Bearer {self.vkey}"
            headers["X-Hermes-Hub-Vkey"] = self.vkey

        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=client_timeout,
            headers=headers,
            trust_env=False,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HubClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            response = self._client.request(method, path, json=json, params=params)
            response.raise_for_status()

            if not response.content:
                return {"ok": True}

            data = response.json()
            if isinstance(data, dict):
                # If server does not include ok, treat successful HTTP as ok.
                data.setdefault("ok", True)
                return data

            return {"ok": True, "data": data}

        except httpx.HTTPStatusError as exc:
            try:
                body: Any = exc.response.json()
            except Exception:
                body = exc.response.text

            return {
                "ok": False,
                "error": f"HTTP {exc.response.status_code}",
                "status_code": exc.response.status_code,
                "body": body,
            }

        except Exception as exc:
            return {
                "ok": False,
                "error": str(exc),
            }

    def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("GET", path, params=params)

    def post(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("POST", path, json=payload or {})

    def put(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("PUT", path, json=payload or {})

    def patch(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("PATCH", path, json=payload or {})

    def delete(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("DELETE", path, json=payload or {})

    # ------------------------------------------------------------------
    # Hub Agent API
    # ------------------------------------------------------------------

    def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = dict(payload)
        if self.vkey and not body.get("vkey"):
            body["vkey"] = self.vkey
        return self.post("/api/hub-agents/register", body)

    def send_heartbeat(self, node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.post(f"/api/hub-agents/{node_id}/heartbeat", payload)

    def poll_commands(self, node_id: str) -> dict[str, Any]:
        return self.get(f"/api/hub-agents/{node_id}/commands/poll")

    def mark_command_started(self, node_id: str, command_id: str) -> dict[str, Any]:
        return self.post(f"/api/hub-agents/{node_id}/commands/{command_id}/started", {})

    def report_command_result(self, node_id: str, command_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.post(f"/api/hub-agents/{node_id}/commands/{command_id}/result", payload)

    def upload_logs(self, node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.post(f"/api/hub-agents/{node_id}/logs", payload)
