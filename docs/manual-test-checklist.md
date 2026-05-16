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

## 8. Web UI — MUI App Shell

- [ ] **App Shell loads with Sidebar and Topbar at `http://127.0.0.1:8899`**
  Expected: Left sidebar visible with 7 nav items (Dashboard/Profiles/Gateway/Logs/Health/Templates/Settings), top bar shows "Hermes Hub v0.1.0"

- [ ] **Sidebar navigation — Profiles is highlighted by default**
  Expected: Profiles menu item has selected/highlighted state

- [ ] **Sidebar navigation — non-Profiles items show placeholder pages**
  Expected: Clicking Gateway/Logs/Health/Templates/Settings shows a centered "coming soon" placeholder page

- [ ] **App Shell uses dark theme consistently**
  Expected: Dark background (`#0d1117`), paper cards (`#161b22`), no white/light flash on navigation

- [ ] **Sidebar shows version info at bottom**
  Expected: "Hermes Hub v0.1.0" visible at bottom of sidebar

---
## 9. Web UI — Profiles Page

- [ ] **Profiles Page has header with title, subtitle, and action buttons**
  Expected: "Profiles" title, "Manage local Hermes Agent Profiles" subtitle, buttons: Rescan (text) → Import (outlined) → New Profile (contained)

- [ ] **Runtime Status Card shows CLI version, HERMES_HOME, and source**
  Expected: Card with "Runtime" label, CLI chip (green/red), HOME path chip, source chip (outlined), Rescan button

- [ ] **Runtime Status Card — Rescan button works**
  Expected: Clicking Rescan refreshes the runtime info chips

- [ ] **Summary Cards show counts**
  Expected: 5 cards — Total Profiles, Ready, Missing SOUL, Runtime Unknown, Last Scan. All display correct values.

- [ ] **Profiles Table has 8 columns**
  Expected: Name, HERMES_HOME, Config, SOUL, Runtime, Health, Last Updated, Actions

- [ ] **Config status chip shows correct color**
  Expected: Ready=green, Missing/Unknown=amber, Invalid/Perm Error=red

- [ ] **SOUL status chip shows correct color**
  Expected: Ready=green, Missing/Empty=amber, Perm Error=red

- [ ] **Runtime status chip shows Unknown for all profiles**
  Expected: All rows show "Unknown" in grey (default) chip — NOT "Stopped"

- [ ] **Health status chip derived correctly**
  Expected: Profiles with ready config+soul show Healthy (green). Profiles with missing files show Warning (amber) or Error (red).

- [ ] **Table row click navigates to Profile Detail**
  Expected: Clicking any row opens the Profile Detail page

- [ ] **Actions column has View and More buttons**
  Expected: Each row has an OpenInNew icon button and a MoreVert icon button. Both stop event propagation.

- [ ] **Empty state shows helper text and New Profile button**
  Expected: If no profiles, centered message with "New Profile" button

- [ ] **New Profile button opens Create Profile wizard**
  Expected: Clicking "New Profile" navigates to the 3-step wizard (Name → Model → SOUL.md)

- [ ] **Import button opens Import page**
  Expected: Clicking "Import" navigates to import page with directory path input

---
## 10. Web UI — Profile Detail, Gateway & Logs (MUI-styled)

- [ ] **Profile Detail page preserves all fields**
  Expected: HERMES_HOME, status, config.yaml details, SOUL.md details, Gateway status all visible

- [ ] **Gateway status chip shows correct color**
  Expected: Running=green, Stopped=grey, Error=red, Unknown=amber

- [ ] **Gateway Start/Stop/Restart buttons work**
  Expected: Each button triggers the API call and shows feedback via Alert

- [ ] **Clone button navigates to Clone Profile page**
  Expected: Clone page shows source profile name and new name input

- [ ] **View Logs button navigates to Log Viewer**
  Expected: Shows log lines with line count selector and Refresh button

- [ ] **Open Config navigates to Config Editor**
  Expected: Textarea with YAML content, Validate and Save buttons, security notice

- [ ] **Open SOUL navigates to SOUL Editor**
  Expected: Textarea with SOUL.md content, Validate and Save buttons

- [ ] **Back button returns to Profiles list**
  Expected: "Back to Profiles" button navigates to the list page

---
## 11. Web UI — StatusChip Color Semantics

- [ ] **Config: Ready → green (success)**
- [ ] **Config: Missing → amber (warning)**
- [ ] **Config: Invalid → red (error)**
- [ ] **SOUL: Ready → green (success)**
- [ ] **SOUL: Missing / Empty → amber (warning)**
- [ ] **SOUL: Permission Error → red (error)**
- [ ] **Runtime: Unknown → grey (default)** — MUST NOT show as Stopped or Error
- [ ] **Health: Healthy → green (success)**
- [ ] **Health: Warning → amber (warning)**
- [ ] **Health: Error → red (error)**

---
## 12. Web UI — No Console Errors

- [ ] **No JavaScript console errors on any page**
  Expected: browser dev tools console is clean (favicon.ico 404 is acceptable)

- [ ] **No MUI prop warnings in console**
  Expected: no deprecated prop warnings, no missing key warnings

---
## 13. Error Handling

- [ ] **Missing config.yaml shows clear message in editor**
  Expected: "config.yaml does not exist..." message

- [ ] **Unreadable file shows permission error**
  Expected: error message mentions permissions

- [ ] **API error responses include `suggestion` field**
  Expected: all `ok: false` responses have a `suggestion` string

- [ ] **500 errors never leak stack traces**
  Expected: 500 responses show generic message with `details.message`

---

## 14. Safety Verification (Destructive Tests)

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
| 1. CLI Startup | 5 | | |
| 2. API — Health | 1 | | |
| 3. API — Runtime | 3 | | |
| 4. API — Profile Scan | 3 | | |
| 5. API — Profile Detail | 2 | | |
| 6. API — Config Edit | 7 | | |
| 7. API — SOUL Edit | 6 | | |
| 8. Web UI — MUI App Shell | 5 | | |
| 9. Web UI — Profiles Page | 14 | | |
| 10. Web UI — Detail, Gateway & Logs | 8 | | |
| 11. Web UI — StatusChip Colors | 10 | | |
| 12. Web UI — No Console Errors | 2 | | |
| 13. Error Handling | 4 | | |
| 14. Safety Verification | 4 | | |
| **Total** | **74** | | |

---

Date tested: __________  
Tester: __________  
Hermes Hub version: __________  
Hermes CLI version: __________
