import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export interface WsConnection {
  req: IncomingMessage
  sendText(payload: string): void
  close(): void
}

export const wsClients = new Set<WsConnection>()

function wsAcceptKey(key: string): string {
  return createHash('sha1').update(key + WS_GUID).digest('base64')
}

export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  _head: Buffer,
  handlers?: {
    onText?: (connection: WsConnection, payload: string) => void
    onClose?: (connection: WsConnection) => void
  },
): WsConnection | null {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.destroy()
    return null
  }
  const accept = wsAcceptKey(key)
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  const connection: WsConnection = {
    req,
    sendText(payload: string) {
      socket.write(wsFrame(payload))
    },
    close() {
      try {
        socket.end()
      } catch {
        socket.destroy()
      }
    },
  }

  let buffer = Buffer.alloc(0)
  const cleanup = () => {
    handlers?.onClose?.(connection)
  }

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length > 0) {
      const parsed = parseClientFrame(buffer)
      if (!parsed) break
      buffer = buffer.subarray(parsed.bytesConsumed)
      if (parsed.opcode === 0x8) {
        connection.close()
        return
      }
      if (parsed.opcode === 0x9) {
        socket.write(wsFrame(parsed.payload, 0xA))
        continue
      }
      if (parsed.opcode === 0x1) {
        handlers?.onText?.(connection, parsed.payload.toString('utf-8'))
      }
    }
  })

  socket.on('close', cleanup)
  socket.on('end', cleanup)
  socket.on('error', () => {
    cleanup()
    socket.destroy()
  })
  return connection
}

export function wsBroadcast(data: string): void {
  for (const client of wsClients) {
    try {
      client.sendText(data)
    } catch {
      client.close()
    }
  }
}

function wsFrame(payload: string | Buffer, opcode = 0x1): Buffer {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8')
  const len = bytes.length
  let frame: Buffer
  let offset: number

  if (len < 126) {
    frame = Buffer.alloc(2 + len)
    frame[0] = 0x80 | opcode
    frame[1] = len
    offset = 2
  } else if (len < 65536) {
    frame = Buffer.alloc(4 + len)
    frame[0] = 0x80 | opcode
    frame[1] = 126
    frame.writeUInt16BE(len, 2)
    offset = 4
  } else {
    frame = Buffer.alloc(10 + len)
    frame[0] = 0x80 | opcode
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(len), 2)
    offset = 10
  }
  bytes.copy(frame, offset)
  return frame
}

function parseClientFrame(buffer: Buffer): { opcode: number; payload: Buffer; bytesConsumed: number } | null {
  if (buffer.length < 2) return null
  const first = buffer[0]
  const second = buffer[1]
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let length = second & 0x7f
  let offset = 2

  if (length === 126) {
    if (buffer.length < 4) return null
    length = buffer.readUInt16BE(2)
    offset = 4
  } else if (length === 127) {
    if (buffer.length < 10) return null
    const big = buffer.readBigUInt64BE(2)
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Unsupported websocket frame length')
    }
    length = Number(big)
    offset = 10
  }

  const maskLength = masked ? 4 : 0
  if (buffer.length < offset + maskLength + length) return null
  const mask = masked ? buffer.subarray(offset, offset + 4) : undefined
  offset += maskLength
  const payload = Buffer.from(buffer.subarray(offset, offset + length))
  if (mask) {
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4]
    }
  }
  return {
    opcode,
    payload,
    bytesConsumed: offset + length,
  }
}
