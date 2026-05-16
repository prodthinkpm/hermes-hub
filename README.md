# Hermes Hub

Multi-Agent Profile Hub for Hermes — a local visual management center for creating, configuring, and maintaining multiple Hermes Agent Profiles.

## MVP Status

This is the v0.1 MVP. It provides a **minimum safe edit loop** for existing Hermes Agent Profiles:

- Start the local dashboard via `npx hermes-hub`
- Detect the Hermes CLI and HERMES_HOME on your machine
- Scan and list existing Hermes Profiles
- View Profile details (file status, config summary, permissions)
- Open and edit `config.yaml` with YAML syntax validation
- Open and edit `SOUL.md` with content checks
- Every save automatically backs up the previous file
- Atomic writes — a failed save never corrupts the original file
- Secret redaction detection prevents accidentally overwriting real keys with placeholders

## Quick Start

```bash
npx hermes-hub
```

This starts the local server and opens the dashboard in your browser at `http://127.0.0.1:8899`.

### Prerequisites

- **Node.js >= 20**
- Hermes CLI installed (optional — the dashboard shows a clear message if it is missing)
- At least one Hermes Profile under `~/.hermes`

### CLI Options

| Option | Default | Description |
|---|---|---|
| `--port <port>` | `8899` | Port to bind the local server. If occupied, the next available port is used automatically. |
| `--host <host>` | `127.0.0.1` | Host to bind the server. Passing `0.0.0.0` prints a security warning. |
| `--home <path>` | auto-detected | Override the HERMES_HOME path used for Profile scanning. |
| `--no-open` | `false` | Start the server without opening the browser. |

### Install Globally (Alternative)

```bash
npm install -g hermes-hub
hermes-hub
```

## HERMES_HOME Detection

The dashboard detects HERMES_HOME in this order:

1. The `--home` CLI argument (if provided)
2. `hermes config home` output (if the Hermes CLI is available)
3. The `HERMES_HOME` environment variable
4. Fallback to `~/.hermes`

The chosen source is shown in the Runtime banner so you always know which directory is being scanned.

## Safety & Security

### Backups

Every save creates a timestamped backup under:

```
~/.hermes-hub/backups/<profileId>/<timestamp>/<filename>
```

A save is **blocked** if the backup cannot be created (e.g. disk full).

### Atomic Writes

Files are written to a temporary file first, synced, and then atomically renamed over the original. If the write fails at any point, the temporary file is cleaned up and the original is left untouched.

### Secret Redaction

The dashboard prevents accidentally saving redacted placeholder values (`********`, `REDACTED`, `••••••`, `<redacted>`) into sensitive YAML fields (`api_key`, `token`, `secret`, `password`, `auth`, `credential`, `key`).

The raw editor shows real file content and includes a security notice reminding you not to paste it into untrusted environments.

### Network Binding

By default the server listens **only** on `127.0.0.1`. Passing `--host 0.0.0.0` prints a warning in the terminal.

## MVP Features

| Feature | Status |
|---|---|
| `npx hermes-hub` local startup | Done |
| Hermes CLI detection | Done |
| HERMES_HOME detection (4 sources) | Done |
| Profile scanning (single home + profiles/* subdirectories) | Done |
| Profile list with file status | Done |
| Profile detail (config summary, permissions, timestamps) | Done |
| config.yaml view / edit / YAML validation | Done |
| SOUL.md view / edit / content check | Done |
| Save-with-backup (timestamped, per-profile) | Done |
| Atomic write (tmp + fsync + rename) | Done |
| Secret redaction placeholder detection | Done |
| Empty SOUL.md block | Done |
| Invalid YAML block | Done |
| Unified API error format | Done |

## Known Limitations

- No Profile creation wizard — you must already have Profiles under HERMES_HOME
- No Profile cloning or deletion
- No Gateway start / stop / restart
- No real-time log streaming
- No Health Center / Doctor integration
- No Skills, MCP, or Cron management
- No template system
- No config version history UI or rollback
- No Diff view
- No Monaco editor (plain textarea)
- No SQLite database (in-memory scan per request)
- No multi-user support
- No remote node management
- macOS / Linux primary; Windows best-effort

## Not Yet Supported

The following capabilities are planned for v0.2 and v0.3:

**v0.2:** Create Profile wizard, Profile clone, Gateway status & start/stop, Log viewer, Doctor integration

**v0.3:** Skills / MCP / Cron management, Template system, Config version history & rollback UI, Health Center

## Manual Verification Checklist

See [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md) for a step-by-step verification walkthrough covering the full MVP loop.

## Development

```bash
pnpm install
pnpm build
pnpm --filter @hermes-hub/cli dev -- --no-open
```

### Package Structure

```
hermes-hub
├── packages
│   ├── cli        # CLI entry point (commander)
│   ├── server     # Fastify API server
│   ├── web        # Browser UI (vanilla TypeScript DOM)
│   ├── core       # Runtime adapter & business logic
│   └── shared     # Shared types & API contracts
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Tech Stack

| Layer | Technology |
|---|---|
| CLI | Node.js + TypeScript + Commander |
| Server | Fastify |
| Frontend | TypeScript + vanilla DOM (no framework) |
| YAML | `yaml` package |
| Process | `execa` |

## License

MIT
