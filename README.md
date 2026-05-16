# Hermes Hub

Multi-Agent Profile Hub for Hermes — a local visual management center for creating, configuring, and maintaining multiple Hermes Agent Profiles.

## Current Status

Hermes Hub has completed all planned phases through **P6 (Alpha readiness)**: MVP safe edit loop (PR1-PR8), hardening (PR9-PR11), Profile creation/cloning/import (PR12-PR14), Gateway/logs (PR15-PR17), UI Shell & Profiles refactoring (PR19), stability check (PR20), Health Check with suggestions (PR21-PR23), configuration experience enhancements (PR24-PR29), MCP/Skills/Cron read-only management (PR30-PR33), and Alpha release preparation (PR34-PR38).

Current implemented scope:

### Profile Management
- Start the local dashboard via `npx hermes-hub`
- Detect the Hermes CLI and HERMES_HOME on your machine
- Scan and list existing Hermes Profiles
- View Profile details with file status, config summary, and permissions
- Create a new Profile with a basic wizard
- Clone an existing Profile while skipping sensitive files by default
- Import an existing Profile directory for inspection

### Configuration & Editing
- **Monaco Editor** for `config.yaml` (YAML mode) and `SOUL.md` (Markdown mode) with dark theme
- **Form editor** for common config fields (Model, Provider, Workspace, Gateway)
- **Diff preview** before saving — see exactly what changed
- **Backup history** — browse timestamped backups, view contents, restore with one click
- **Rollback** from backup with pre-restore safety backup and YAML validation
- Every save automatically backs up — atomic writes prevent corruption
- Secret redaction detection blocks placeholder values in sensitive fields
- **SOUL templates** — 4 built-in templates (Coding, Research, Ops, Assistant) with append/replace

### Runtime & Operations
- Check Gateway status and trigger start / stop / restart through the Hermes CLI
- View recent Profile log lines
- **Health Check engine** — 8-dimension per-profile health checks (CLI, HOME, directory, config, SOUL, Gateway, logs, backup)
- **Health Summary** in Profile Detail with Run Check button
- **Fix suggestions** — short, actionable advice for each health issue

### UI & Shell
- **App Shell** with sidebar navigation (7 sections), top bar, dark developer-console theme
- **Profiles page** with summary cards (Total/Ready/Missing SOUL/Runtime Unknown/Last Scan)
- **Enhanced table** with Config/SOUL/Runtime/Health status chips
- **StatusChip** system with color-coded health semantics (success/warning/error/default)

### MCP / Skills / Cron (Read-Only)
- **MCP Servers** — parsed from config.yaml with status chips (configured/missing_command/disabled)
- **Skills** — scanned from profile directory with risk indicators (low/medium/high)
- **Cron Jobs** — listed from profile directory with enabled/disabled status

### CLI
- `hermes-hub --version` — print version
- `hermes-hub doctor` — environment checks (Node.js, Hermes CLI, HERMES_HOME, port)
- `hermes-hub --demo` / `--mock` — run with demo data

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
| `--demo` | `false` | Alias for `--mock`. Runs with demo data without touching a real Hermes home. |
| `--no-open` | `false` | Start the server without opening the browser. |

### CLI Commands

| Command | Description |
|---|---|
| `hermes-hub` | Start the server and open the dashboard |
| `hermes-hub doctor` | Run environment checks (Node.js, Hermes CLI, HERMES_HOME, port) |
| `hermes-hub --version` | Print the current version |

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
| PR19: UI Shell & Profiles page refactoring | Done |
| PR20: P3 stability check & doc sync | Done |
| PR21: Health Check rules engine | Done |
| PR22: Profile Health Summary UI | Done |
| PR23: Fix suggestions for health issues | Done |
| PR24: Save-before Diff UI | Done |
| PR25: Backup history browser | Done |
| PR26: Rollback from backup | Done |
| PR27: Monaco Editor integration | Done |
| PR28: Form config editor | Done |
| PR29: SOUL templates | Done |
| PR30: MCP server list & status | Done |
| PR31: MCP config editing (planned) | Planned |
| PR32: Skills list & risk indicators | Done |
| PR33: Cron job list | Done |
| PR34-PR38: npm/npx Alpha release prep | Done |

## Current Limitations

- **UI Shell:** Sidebar navigation items beyond Profiles (Dashboard, Gateway, Logs, Health, Templates, Settings) currently show placeholder pages.
- **Runtime status:** All profiles display "Unknown" for Runtime state in the table; the API does not yet report per-profile runtime/gateway process status.
- **Gateway commands** are lightweight wrappers around the Hermes CLI and should be validated against real multi-Profile Gateway behavior before wider use.
- **Logs viewer** reads recent lines from Profile log files; it does not provide WebSocket or live tail streaming.
- **MCP/Skills/Cron** are read-only displays; editing, connection testing, and lifecycle management are not yet implemented.
- **No MCP configuration editing** or connection testing yet (planned as PR31).
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
| Frontend | React + TypeScript + Material UI + Vite + Monaco Editor |
| Diff | Built-in LCS-based line diff |
| Code Editor | Monaco Editor (YAML + Markdown, lazy-loaded) |
| YAML | `yaml` package |
| Process | `execa` |

## License

MIT
