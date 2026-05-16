# Hermes Hub — Alpha Release Checklist

> Pre-release verification checklist. All items must pass before Alpha tagging.

## Build & Type Safety

- [ ] `pnpm install` — no errors
- [ ] `pnpm build` — all 5 workspace packages build successfully
- [ ] `pnpm typecheck` — zero TypeScript errors across all packages
- [ ] Web bundle size < 600 KB (gzipped < 200 KB)

## CLI Startup

- [ ] `hermes-hub --version` prints version
- [ ] `hermes-hub doctor` runs environment checks
- [ ] `hermes-hub --mock --no-open` starts successfully
- [ ] `hermes-hub --demo --no-open` alias works
- [ ] `hermes-hub --port 9999` uses custom port
- [ ] `hermes-hub --host 0.0.0.0` prints security warning
- [ ] Server binds to 127.0.0.1 by default

## Core Features

- [ ] Profile scanning: `GET /api/profiles` returns profiles
- [ ] Runtime detection: `GET /api/runtime` returns CLI/home info
- [ ] Health check: `GET /api/profiles/:id/health` returns check results
- [ ] Config edit: view, validate, save config.yaml with backups
- [ ] SOUL edit: view, validate, save SOUL.md with backups
- [ ] Gateway: status/start/stop/restart works via API
- [ ] Logs: `GET /api/profiles/:id/logs` returns log lines
- [ ] Backup history: `GET /api/profiles/:id/backups`
- [ ] Backup restore: `POST /api/profiles/:id/backups/:id/restore`
- [ ] Create Profile wizard works via API
- [ ] Clone Profile works via API
- [ ] Import Profile works via API

## Web UI

- [ ] App Shell: Sidebar, Topbar, dark theme render correctly
- [ ] Profiles Page: header, summary cards, runtime card, table
- [ ] StatusChip colors: Config/SOUL/Runtime/Health displayed correctly
- [ ] Profile Detail: all sections visible (detail, health, MCP, skills, cron)
- [ ] Monaco Editor: YAML and Markdown editing functional
- [ ] Diff Preview: changes visible before save
- [ ] Backup History: view and restore backups
- [ ] Form editor: Model/Provider/Workspace fields editable
- [ ] SOUL templates: insert templates (append/replace)
- [ ] No console errors
- [ ] No MUI prop warnings

## Security

- [ ] Server binds 127.0.0.1 by default
- [ ] Redacted placeholder values blocked on save
- [ ] Backups created before every save
- [ ] Atomic writes prevent file corruption
- [ ] Rollback creates pre-restore backup
- [ ] No sensitive values in API responses
- [ ] No stack traces in error responses

## Documentation

- [ ] README reflects current feature set
- [ ] manual-test-checklist.md updated (74 items)
- [ ] Alpha release checklist (this file) complete
- [ ] Known limitations documented

## npm Package (Verify Only — Do Not Publish)

- [ ] `npm pack --dry-run` shows correct files
- [ ] Package includes web dist, server dist, CLI dist
- [ ] Package includes README, LICENSE
- [ ] `bin` field points to correct CLI entry

## Alpha Risks

1. Monaco Editor increases bundle size (~15 KB gzipped, lazy loaded)
2. MCP/Skills/Cron display depends on profile directory structure
3. Gateway commands depend on Hermes CLI availability
4. No real-time log streaming (planned for Beta)
5. Windows path handling may have edge cases
6. No authentication — trusted local networks only

## Rollback Plan

If Alpha shows critical issues:
1. Tag the last known-good commit as stable
2. Fix issues in a patch branch
3. Re-verify against this checklist before re-tagging

---

Date verified: __________  
Verifier: __________  
Version: __________
