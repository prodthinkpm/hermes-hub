// WebSocket upgrade handler — zero deps, pure node:crypto.

import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export const wsClients = new Set<Duplex>()

function wsAcceptKey(key: string): string {
  return createHash('sha1').update(key + WS_GUID).digest('base64')
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.destroy()
    return
  }
  const accept = wsAcceptKey(key)
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  )
  wsClients.add(socket)

  socket.on('close', () => wsClients.delete(socket))
  socket.on('error', () => { wsClients.delete(socket); socket.destroy() })
}

export function wsBroadcast(data: string): void {
  const frame = wsFrame(data)
  for (const socket of wsClients) {
    try { socket.write(frame) } catch { /* client gone */ }
  }
}

function wsFrame(payload: string): Buffer {
  const bytes = Buffer.from(payload, 'utf-8')
  const len = bytes.length
  let frame: Buffer
  let offset: number

  if (len < 126) {
    frame = Buffer.alloc(2 + len)
    frame[0] = 0x81       // FIN + text opcode
    frame[1] = len        // no mask (server → client)
    offset = 2
  } else if (len < 65536) {
    frame = Buffer.alloc(4 + len)
    frame[0] = 0x81
    frame[1] = 126
    frame.writeUInt16BE(len, 2)
    offset = 4
  } else {
    frame = Buffer.alloc(10 + len)
    frame[0] = 0x81
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(len), 2)
    offset = 10
  }
  bytes.copy(frame, offset)
  return frame
}
