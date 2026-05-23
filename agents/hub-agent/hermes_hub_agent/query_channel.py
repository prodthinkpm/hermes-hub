from __future__ import annotations

import json
import os
import select
import socket
import ssl
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlparse

from .heartbeat import AgentConfig


@dataclass
class QueryChannelConfig:
    url: str
    vkey: str
    node_id: str
    connect_timeout_seconds: float = 5.0
    reconnect_delay_seconds: float = 2.0


class QueryChannelClient:
    def __init__(
        self,
        config: AgentConfig,
        *,
        query_handler: Callable[[str, dict[str, Any], str | None], dict[str, Any]],
    ) -> None:
        self.config = QueryChannelConfig(
            url=(config.hub_url.rstrip("/") + "/ws/query-agent"),
            vkey=str(config.hub_token or "").strip(),
            node_id=str(config.node_id or "").strip(),
            connect_timeout_seconds=float(config.request_timeout_seconds or 10),
        )
        self.query_handler = query_handler
        self._closed = False
        self._socket: socket.socket | ssl.SSLSocket | None = None
        self._lock = threading.Lock()

    def close(self) -> None:
        self._closed = True
        with self._lock:
            if self._socket is not None:
                try:
                    self._socket.close()
                except OSError:
                    pass
                self._socket = None

    def loop(self) -> None:
        while not self._closed:
            if not self.config.node_id:
                time.sleep(self.config.reconnect_delay_seconds)
                continue
            try:
                self._run_session()
            except Exception as exc:
                print(f"[hub-agent] query channel exception: {exc}", flush=True)
            finally:
                with self._lock:
                    if self._socket is not None:
                        try:
                            self._socket.close()
                        except OSError:
                            pass
                        self._socket = None
            if not self._closed:
                time.sleep(self.config.reconnect_delay_seconds)

    def _run_session(self) -> None:
        parsed = urlparse(self.config.url)
        scheme = parsed.scheme.lower()
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if scheme == "wss" else 80)
        path = parsed.path or "/ws/query-agent"

        sock = socket.create_connection((host, port), timeout=self.config.connect_timeout_seconds)
        sock.settimeout(None)
        if scheme == "wss":
            context = ssl.create_default_context()
            sock = context.wrap_socket(sock, server_hostname=host)

        request_key = os.urandom(16)
        key = __import__("base64").b64encode(request_key).decode("ascii")
        headers = [
            f"GET {path} HTTP/1.1",
            f"Host: {host}:{port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
        ]
        if self.config.vkey:
            headers.append(f"Authorization: Bearer {self.config.vkey}")
            headers.append(f"X-Hermes-Hub-Vkey: {self.config.vkey}")
        headers.extend(["", ""])
        sock.sendall("\r\n".join(headers).encode("utf-8"))

        response = self._read_http_upgrade(sock)
        response_lines = response.splitlines()
        status_line = response_lines[0] if response_lines else ""
        if "101" not in status_line:
            raise RuntimeError(f"query channel upgrade failed: {status_line or 'empty response'}")

        with self._lock:
            self._socket = sock

        self._send_json({
            "kind": "query.hello",
            "node_id": self.config.node_id,
            "vkey": self.config.vkey,
            "protocol_version": 1,
        })

        while not self._closed:
            ready, _, _ = select.select([sock], [], [], 1.0)
            if not ready:
                continue
            frame = self._recv_frame(sock)
            if frame is None:
                raise RuntimeError("query channel closed by server")
            opcode, payload = frame
            if opcode == 0x8:
                raise RuntimeError("query channel closed by peer")
            if opcode == 0x9:
                self._send_frame(payload, opcode=0xA)
                continue
            if opcode != 0x1:
                continue
            self._handle_message(payload.decode("utf-8"))

    def _handle_message(self, payload: str) -> None:
        message = json.loads(payload)
        kind = message.get("kind")
        if kind == "query.ping":
            self._send_json({
                "kind": "query.pong",
                "sent_at": str(message.get("sent_at") or ""),
            })
            return
        if kind != "query.request":
            return

        request_id = str(message.get("request_id") or "")
        query_type = str(message.get("query_type") or "")
        if not request_id or not query_type:
            return
        payload_obj = message.get("payload")
        payload_data = payload_obj if isinstance(payload_obj, dict) else {}
        agent_id = message.get("agent_id")
        try:
            data = self.query_handler(query_type, payload_data, str(agent_id) if isinstance(agent_id, str) else None)
            self._send_json({
                "kind": "query.response",
                "request_id": request_id,
                "ok": True,
                "data": data,
            })
        except Exception as exc:
            self._send_json({
                "kind": "query.response",
                "request_id": request_id,
                "ok": False,
                "error": str(exc),
            })

    def _read_http_upgrade(self, sock: socket.socket | ssl.SSLSocket) -> str:
        chunks: list[bytes] = []
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            chunks.append(chunk)
            if b"\r\n\r\n" in b"".join(chunks):
                break
        return b"".join(chunks).decode("utf-8", errors="replace")

    def _send_json(self, payload: dict[str, Any]) -> None:
        self._send_frame(json.dumps(payload, ensure_ascii=False).encode("utf-8"), opcode=0x1)

    def _send_frame(self, payload: bytes, *, opcode: int) -> None:
        with self._lock:
            sock = self._socket
            if sock is None:
                raise RuntimeError("query channel socket is not connected")
            mask = os.urandom(4)
            length = len(payload)
            header = bytearray()
            header.append(0x80 | (opcode & 0x0F))
            if length < 126:
                header.append(0x80 | length)
            elif length < 65536:
                header.append(0x80 | 126)
                header.extend(length.to_bytes(2, "big"))
            else:
                header.append(0x80 | 127)
                header.extend(length.to_bytes(8, "big"))
            header.extend(mask)
            masked = bytearray(payload)
            for index in range(length):
                masked[index] ^= mask[index % 4]
            sock.sendall(bytes(header) + bytes(masked))

    def _recv_frame(self, sock: socket.socket | ssl.SSLSocket) -> tuple[int, bytes] | None:
        head = self._recv_exact(sock, 2)
        if not head:
            return None
        opcode = head[0] & 0x0F
        masked = (head[1] & 0x80) != 0
        length = head[1] & 0x7F
        if length == 126:
            extra = self._recv_exact(sock, 2)
            if extra is None:
                return None
            length = int.from_bytes(extra, "big")
        elif length == 127:
            extra = self._recv_exact(sock, 8)
            if extra is None:
                return None
            length = int.from_bytes(extra, "big")
        mask = self._recv_exact(sock, 4) if masked else None
        payload = self._recv_exact(sock, length)
        if payload is None:
            return None
        if mask is not None:
            unmasked = bytearray(payload)
            for index in range(length):
                unmasked[index] ^= mask[index % 4]
            payload = bytes(unmasked)
        return opcode, payload

    def _recv_exact(self, sock: socket.socket | ssl.SSLSocket, size: int) -> bytes | None:
        if size == 0:
            return b""
        chunks = bytearray()
        while len(chunks) < size:
            chunk = sock.recv(size - len(chunks))
            if not chunk:
                return None
            chunks.extend(chunk)
        return bytes(chunks)
