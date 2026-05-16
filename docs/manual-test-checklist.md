# Hermes Hub MVP — Manual Test Checklist

> Run through this checklist before tagging an MVP release. Each item is a single verification step.

## Prerequisites

- [ ] Node.js >= 20 is installed (`node --version`)
- [ ] At least one Hermes Profile exists under `~/.hermes` (or set `HERMES_HOME`)
- [ ] Port 8899 is free, or you are prepared to see auto-port-selection

---

## 1. CLI Startup

- [ ] **`npx hermes-hub` starts the server**
  ```bash
  pnpm --filter @hermes-hub/cli dev -- --no-open
  ```
  Expected: terminal prints `Hermes Hub is running at http://127.0.0.1:8899`

- [ ] **Default bind is 127.0.0.1**
  Expected: the URL printed starts with `http://127.0.0.1`

- [ ] **`--no-open` does not open the browser**
  Expected: no browser window opens automatically

- [ ] **`--host 0.0.0.0` prints a security warning**
  ```bash
  node packages/cli/dist/index.js --host 0.0.0.0 --no-open
  ```
  Expected: terminal shows "Security warning: binding Hermes Hub to 0.0.0.0 may expose it..."

- [ ] **Port conflict auto-selects next port**
  - Start one instance on 8899
  - Start another with `--port 8899`
  Expected: second instance starts on 8900 (or next available)

---

## 2. API — Core Health

- [ ] **`GET /health` returns ok**
  ```bash
  curl http://127.0.0.1:8899/health
  ```
  Expected: `{"ok":true,"data":{"name":"hermes-hub","version":"...","timestamp":"..."}}`

---

## 3. API — Runtime Detection

- [ ] **`GET /api/runtime` returns runtime info**
  ```bash
  curl http://127.0.0.1:8899/api/runtime
  ```
  Expected: `ok: true`, `hermesCli.found` is boolean, `hermesHome.found` is boolean, `hermesHome.path` is a real path, `hermesHome.source` is one of `cli-arg` / `hermes-config-home` / `env` / `fallback`

- [ ] **`POST /api/runtime/rescan` re-detects**
  ```bash
  curl -X POST http://127.0.0.1:8899/api/runtime/rescan
  ```
  Expected: returns fresh `checkedAt` timestamp

- [ ] **Missing Hermes CLI does not crash**
  Expected: if Hermes CLI is not installed, `hermesCli.found: false` with error code `HERMES_CLI_NOT_FOUND`

---

## 4. API — Profile Scanning

- [ ] **`GET /api/profiles` returns profiles**
  ```bash
  curl http://127.0.0.1:8899/api/profiles
  ```
  Expected: `ok: true`, `profiles` array has at least 1 entry, each entry has `id`, `name`, `hermesHome`, `config`, `soul`, `status`

- [ ] **Empty HERMES_HOME returns empty list with no crash**
  Expected: if no profiles exist, `profiles: []` with no 500

- [ ] **`sourceHermesHome` matches the detected home**
  Expected: the field matches the path from `/api/runtime`

---

## 5. API — Profile Detail

- [ ] **`GET /api/profiles/:id` returns detail**
  ```bash
  curl http://127.0.0.1:8899/api/profiles/<id>
  ```
  Expected: `config.parseStatus` is `ok` / `error` / `empty`, `config.summary` has `model`/`provider`/`workspace` (may be empty), `soul.empty` is boolean

- [ ] **Non-existent profile returns 404**
  ```bash
  curl http://127.0.0.1:8899/api/profiles/nonexistent
  ```
  Expected: `ok: false`, `error.code: "PROFILE_NOT_FOUND"`, suggestion is present

---

## 6. API — Config Edit

- [ ] **`GET /api/profiles/:id/config` returns full file**
  ```bash
  curl http://127.0.0.1:8899/api/profiles/<id>/config
  ```
  Expected: `type: "config"`, `content` is a non-empty string, `status` has `readable`/`writable`

- [ ] **`POST .../config/validate` — valid YAML passes**
  ```bash
  curl -X POST http://127.0.0.1:8899/api/profiles/<id>/config/validate \
    -H "content-type: application/json" \
    -d '{"content":"key: value"}'
  ```
  Expected: `valid: true`, `errors: []`

- [ ] **`POST .../config/validate` — invalid YAML fails with details**
  ```bash
  curl -X POST http://127.0.0.1:8899/api/profiles/<id>/config/validate \
    -H "content-type: application/json" \
    -d '{"content":"key: [bad"}'
  ```
  Expected: `valid: false`, errors have `message`, `details.line` and/or `details.column`

- [ ] **`PUT .../config` — valid YAML saves with backup**
  ```bash
  curl -X PUT http://127.0.0.1:8899/api/profiles/<id>/config \
    -H "content-type: application/json" \
    -d '{"content":"# test save\nkey: value"}'
  ```
  Expected: `ok: true`, `backup.path` points to `~/.hermes-hub/backups/<profileId>/<timestamp>/config.yaml`

- [ ] **`PUT .../config` — invalid YAML is blocked**
  Expected: `ok: false`, `error.code: "YAML_INVALID"`, original file unchanged

- [ ] **`PUT .../config` — redacted placeholder is blocked**
  ```bash
  curl -X PUT http://127.0.0.1:8899/api/profiles/<id>/config \
    -H "content-type: application/json" \
    -d '{"content":"api_key: ********"}'
  ```
  Expected: `ok: false`, `error.code: "VALIDATION_ERROR"`, message mentions "redacted placeholder"

- [ ] **Backup file exists after successful save**
  ```bash
  ls ~/.hermes-hub/backups/<profileId>/
  ```
  Expected: at least one timestamped directory with a `config.yaml` file inside

---

## 7. API — SOUL.md Edit

- [ ] **`GET /api/profiles/:id/soul` returns full file**
  ```bash
  curl http://127.0.0.1:8899/api/profiles/<id>/soul
  ```
  Expected: `type: "soul"`, `content` is a string, `status` has `readable`/`writable`

- [ ] **`POST .../soul/validate` — non-empty passes**
  ```bash
  curl -X POST http://127.0.0.1:8899/api/profiles/<id>/soul/validate \
    -H "content-type: application/json" \
    -d '{"content":"# Hello"}'
  ```
  Expected: `valid: true`

- [ ] **`POST .../soul/validate` — empty returns warning**
  ```bash
  curl -X POST http://127.0.0.1:8899/api/profiles/<id>/soul/validate \
    -H "content-type: application/json" \
    -d '{"content":""}'
  ```
  Expected: `valid: false`, error message mentions empty content

- [ ] **`PUT .../soul` — valid content saves with backup**
  Expected: `ok: true`, `backup.path` points to `~/.hermes-hub/backups/...`

- [ ] **`PUT .../soul` — empty content is blocked**
  Expected: `ok: false`, `error.code: "VALIDATION_ERROR"`, message mentions "must not be empty"

- [ ] **SOUL.md that does not exist can be created (save creates it)**
  Expected: for a profile with no SOUL.md, the editor shows "does not exist yet, will be created when you save"

---

## 8. Web UI

- [ ] **Dashboard loads at `http://127.0.0.1:8899`**
  Expected: page title is "Hermes Hub", runtime banner is visible

- [ ] **Runtime banner shows CLI status and HERMES_HOME**
  Expected: shows "CLI: found" or "CLI: missing", and the home path

- [ ] **Profile list table shows all profiles**
  Expected: one row per profile, columns: Name, HERMES_HOME, config.yaml, SOUL.md, Last Updated, Status

- [ ] **Click profile row opens detail page**
  Expected: shows "Profile Detail" heading, config summary (model/provider), SOUL status

- [ ] **"Open Config" button navigates to config editor**
  Expected: textarea pre-filled with YAML content, file path and status bar visible

- [ ] **"Validate YAML" shows valid result**
  Expected: green text "YAML Validation: Valid YAML"

- [ ] **"Validate YAML" shows error for invalid content**
  Expected: red text "YAML Validation: Invalid YAML" with error details

- [ ] **"Save config.yaml" saves and shows backup path**
  Expected: green text with backup path and timestamp

- [ ] **Security notice is visible in config editor**
  Expected: text "Security notice: This editor shows the real file content..."

- [ ] **"Back to Detail" returns to detail page**
  Expected: Profile Detail heading visible again

- [ ] **"Open SOUL" button navigates to SOUL editor**
  Expected: textarea with SOUL.md content, "Check Content" and "Save SOUL.md" buttons

- [ ] **"Check Content" shows result**
  Expected: validation feedback

- [ ] **Empty SOUL.md is blocked on save with clear message**
  Expected: red text "Save blocked: SOUL.md content must not be empty..."

- [ ] **"Back to Profiles" returns to list**
  Expected: Profiles heading visible, table shown

- [ ] **No console errors (except favicon.ico 404)**
  Expected: browser dev tools console is clean

---

## 9. Error Handling

- [ ] **Missing config.yaml shows clear message in editor**
  Expected: "config.yaml does not exist..." message

- [ ] **Unreadable file shows permission error**
  Expected: error message mentions permissions

- [ ] **API error responses include `suggestion` field**
  Expected: all `ok: false` responses have a `suggestion` string

- [ ] **500 errors never leak stack traces**
  Expected: 500 responses show generic message with `details.message`

---

## 10. Safety Verification (Destructive Tests)

> Perform these on a **test profile**, not on a production one.

- [ ] **Save failure does not corrupt original file**
  - Fill disk or revoke write permission on the target file
  - Attempt save
  Expected: save fails, original file content unchanged (md5 matches before/after)

- [ ] **Backup failure blocks save**
  - Revoke write permission on `~/.hermes-hub/backups/`
  - Attempt save
  Expected: save is blocked with "Backup failed" message

- [ ] **Redacted placeholder `********` in `token` field is blocked**
  Expected: VALIDATION_ERROR, field name mentioned

- [ ] **Redacted placeholder `REDACTED` in `secret` field is blocked**
  Expected: VALIDATION_ERROR, field name mentioned

---

## Verification Summary

| Section | Total Items | Passed | Notes |
|---|---|---|---|
| CLI Startup | 5 | | |
| API — Health | 1 | | |
| API — Runtime | 3 | | |
| API — Profile Scan | 3 | | |
| API — Profile Detail | 2 | | |
| API — Config Edit | 7 | | |
| API — SOUL Edit | 6 | | |
| Web UI | 16 | | |
| Error Handling | 4 | | |
| Safety Verification | 4 | | |
| **Total** | **51** | | |

---

Date tested: __________  
Tester: __________  
Hermes Hub version: __________  
Hermes CLI version: __________
