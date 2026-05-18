#!/usr/bin/env node
import { startServer } from './server.js'
import { exec } from 'node:child_process'

function parseArgs(): { port: number; apiUrl: string; open: boolean } {
  const args = process.argv.slice(2)
  let port = 3000
  let apiUrl = process.env.HERMES_API_URL || ''
  let open = true

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        if (args[i + 1]) {
          port = parseInt(args[++i], 10)
          if (isNaN(port) || port < 1 || port > 65535) {
            console.error(`Invalid port: ${args[i]}`)
            process.exit(1)
          }
        }
        break
      case '--api':
      case '-a':
        if (args[i + 1]) {
          apiUrl = args[++i]
        }
        break
      case '--no-open':
        open = false
        break
      case '--help':
      case '-h':
        console.log(`Hermes Hub CLI

Usage: npx hermes-hub [options]

Options:
  --port, -p <port>   Port to listen on (default: 3000)
  --api, -a <url>     Backend API URL (default: HERMES_API_URL env var)
  --no-open           Don't open browser on start
  --help, -h          Show this help
`)
        process.exit(0)
        break
    }
  }

  return { port, apiUrl, open }
}

const opts = parseArgs()
startServer(opts)

if (opts.open) {
  const url = `http://localhost:${opts.port}`
  const platform = process.platform
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`

  exec(cmd, () => {
    // ignore errors — browser may not be installed
  })
}
