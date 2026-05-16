# Hermes Hub

Multi-Agent Profile Hub for Hermes — a local visual management center for creating, configuring, and maintaining multiple Hermes Agent Profiles.

## Current Status

Hermes Hub is currently aligned with the **PRD v0.8 Post-MVP roadmap**. The codebase has completed the MVP safe edit loop, the PR9-PR11 hardening pass, P1 Profile creation/cloning/import, and P2 Gateway/logs basics.

Current implemented scope:

- Start the local dashboard via `npx hermes-hub`
- Detect the Hermes CLI and HERMES_HOME on your machine
- Scan and list existing Hermes Profiles
- View Profile details (file status, config summary, permissions)
- Open and edit `config.yaml` with YAML syntax validation
- Open and edit `SOUL.md` with content checks
- Every save automatically backs up the previous file
- Atomic writes — a failed save never corrupts the original file
- Secret redaction detection prevents accidentally overwriting real keys with placeholders
- Create a new Profile with a basic wizard
- Clone an existing Profile while skipping sensitive files by default
- Import an existing Profile directory for inspection
- Check Gateway status and trigger start / stop / restart through the Hermes CLI
- View recent Profile log lines without real-time streaming

The next planned stage is **P3: Doctor / Health Check**.

## Quick Start

### Published Package

```bash
npx hermes-hub
```

This is the intended end-user entry point once the package is published. It starts the local server and opens the dashboard in your browser at `http://127.0.0.1:8899`.

### Local Development From Source

```bash
pnpm install
pnpm build
pnpm --filter @hermes-hub/cli dev -- --no-open
```

This builds the web bundle and server packages, starts the local CLI entry point, and leaves the browser closed. Open the printed URL manually, usually `http://127.0.0.1:8899`.

Use a real Hermes home:

```bash
pnpm --filter @hermes-hub/cli dev -- --home ~/.hermes --no-open
```

Use demo data without touching a real Hermes home:

```bash
pnpm --filter @hermes-hub/cli dev -- --mock --no-open
```

After a full `pnpm build`, you can also run the compiled CLI directly:

```bash
node packages/cli/dist/index.js --mock --no-open
```

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
| `--mock` | `false` | Create and use a temporary mock HERMES_HOME for demos and local testing. |
| `--no-open` | `false` | Start the server without opening the browser. |

### Install Globally

```bash
npm install -g hermes-hub
hermes-hub
```

This is also intended for the published package flow.

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

## PRD v0.8 Roadmap Status

| Stage | Status |
|---|---|
| PR1-PR8: MVP safe edit loop | Done |
| PR9: README and manual checklist | Done |
| PR10: errors, empty states, loading states, save feedback | Done |
| PR11: mock HERMES_HOME | Done |
| PR12: Create Profile wizard | Done |
| PR13: Clone Profile | Done |
| PR14: Import Profile | Done |
| PR15: Gateway status | Done |
| PR16: Gateway start / stop / restart | Done |
| PR17: Basic Logs viewer | Done |
| PR18-PR20: Doctor / Health Check | Planned next |
| PR21-PR26: Diff, backup history, rollback, Monaco, form config, SOUL templates | Planned |
| PR27-PR30: MCP / Skills / Cron | Planned |
| PR31-PR35: npm/npx Alpha release | Planned |

## Current Limitations

- Gateway commands are lightweight wrappers around the Hermes CLI and should be validated against real multi-Profile Gateway behavior before wider use.
- Logs viewer reads recent lines from Profile log files; it does not provide WebSocket or live tail streaming.
- Import currently validates a directory as a Profile; persistent registry-style import behavior is not yet implemented.
- No Doctor / Health Center yet.
- No Skills, MCP, or Cron management yet.
- No template marketplace or advanced template system.
- No config version history UI, rollback UI, or Diff view yet.
- No Monaco editor yet; editors use textareas.
- No SQLite database; Profile state is scanned from files on demand.
- No multi-user, remote node, or team permission model.
- macOS / Linux are primary; Windows is best-effort.

## Manual Verification Checklist

See [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md) for a step-by-step verification walkthrough covering the full MVP loop.

## Development

```bash
pnpm install
pnpm build
pnpm --filter @hermes-hub/cli dev -- --no-open
```

Useful local commands:

```bash
pnpm --filter @hermes-hub/web dev
pnpm --filter @hermes-hub/web build
pnpm --filter @hermes-hub/server build
pnpm --filter @hermes-hub/cli dev -- --mock --no-open
```

### Package Structure

```
hermes-hub
├── packages
│   ├── cli        # CLI entry point (commander)
│   ├── server     # Fastify API server
│   ├── web        # Browser UI (React + Material UI)
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
| Frontend | React + TypeScript + Material UI + Vite |
| YAML | `yaml` package |
| Process | `execa` |

## License

MIT
