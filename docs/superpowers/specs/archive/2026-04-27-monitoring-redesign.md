# Monitoring Page Redesign

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Redesign `/admin/monitoring` from a single long-scroll page into a tabbed dashboard. Add a live bash test runner (in-cluster, SSE-streamed) and a Playwright E2E report panel fed by a Claude-triggered webhook.

---

## Layout: Overview + Tabs

The page has a persistent tab bar with five tabs:

| Tab | Purpose |
|-----|---------|
| Übersicht | At-a-glance status cards, deep links to detail tabs |
| Cluster | Full pod table, node metrics, events list |
| Tests | Bash runner (live log + report) + Playwright report |
| Deployments | Deployment health table with restart/scale actions |
| Berichte | Staleness detail, test run history, manual test protocols |

Auto-refresh (15 s) continues as before; it only re-fetches data relevant to the active tab to avoid unnecessary load.

---

## Tab 1 — Übersicht

Five summary cards across the top row:

- **Pods** — `running/total`, pending count, failed count
- **Nodes** — `ready/total`, aggregate CPU %, aggregate memory %
- **Deployments** — `healthy/total`, first degraded deployment name if any
- **Letzter Testlauf** — `pass/total`, duration, age, fail count
- **Staleness** — OK / N warnings / N stale, report date

Below the cards, two side-by-side panels:

- **Aktuelle Events** (left) — last 3 events with type badge, message, age; "→ Cluster" deep-link
- **Staleness-Bericht** (right) — top 3 findings with colour dot; "→ Berichte" deep-link

Bottom row:

- **Letzter Testlauf — detail** (left 2/3) — per-category badge (FA ✓ N/N, SA, NFA, AK); "→ Tests" deep-link
- **Schnellzugriff** (right 1/3) — "▶ Tests starten" (navigates to Tests tab, starts run with default prod tier), "Bericht generieren" (calls `POST /api/admin/tests/report` to regenerate markdown from last completed run)

---

## Tab 2 — Cluster

**Node metrics panel** — one row per node: name, CPU bar (green <65 %, orange 65–84 %, red 85 %+), memory bar, absolute values.

**Pod summary bar** — four counters: Running, Pending, Restarting, Failed.

**Pod table** — columns: Pod name, Phase, Ready (✓/✗), Restarts, CPU, Memory. Rows with restarts > 3 or phase ≠ Running are highlighted red. Paginated or virtualised if > 20 pods.

**Events table** — last 10 events. Columns: Type (Warning/Normal badge), Reason, Object, Message, Age. Warning rows highlighted. "Bug-Ticket erstellen" action per row (existing modal).

---

## Tab 3 — Tests

### Bash runner

**Controls bar:**
- Tier toggle: `prod` / `local` (default `prod`)
- Optional test ID filter input (space-separated, e.g. `FA-15 SA-07`; empty = all)
- **▶ Starten** button — triggers `POST /api/admin/tests/run`
- Status badge while running: `● läuft · <current test ID>`

**Split panel (log left / report right):**

- **Left — Ausgabe**: scrolling `<pre>` fed by SSE from `GET /api/admin/tests/stream/:jobId`. Each line appended as it arrives. Auto-scrolls to bottom.
- **Right — Ergebnis**: table with columns Req, Test, Beschreibung, Status (✓/✗/⊘/●), Duration. Rows are appended in real-time as each JSONL line arrives from the same SSE stream. Running test highlighted with blue border.

**Summary bar** (shown on completion):
- ✓ N bestanden · ✗ N fehlgeschlagen · ⊘ N übersprungen · Dauer: Xm Xs
- Download links: `↓ JSON`, `↓ Markdown` — served from `GET /api/admin/tests/results/:jobId?format=json|md`

### Playwright E2E

**Header bar:** last report timestamp, "Prompt kopieren" button.

**Content area:**
- Mini stats column (pass count, fail count, "↗ Vollbericht" link)
- `<iframe src="/api/admin/tests/playwright-report">` showing the last posted HTML report

**Copyable Claude prompt** (pre-filled `<textarea>`):
```
Run Playwright tests in tests/e2e/ for the prod cluster,
then POST the HTML report to /api/admin/tests/playwright-report
with Bearer token from MONITORING_WEBHOOK_TOKEN.
```

---

## Tab 4 — Deployments

Table with columns: Deployment name, Desired replicas, Ready replicas, Status badge (healthy / degraded / stopped), Actions.

- Degraded/stopped rows highlighted amber/red.
- Actions: **↺ Restart** (rolling restart modal, existing logic) and **⤢ Scale** (replica dialog 0–10, existing logic).

No functional changes to restart/scale logic — only visual reorganisation into this tab.

---

## Tab 5 — Berichte

Three stacked sections:

**Staleness-Bericht:** Full findings table — System, Status dot, Issue text, Recommendation. Sourced from existing `GET /api/admin/staleness-report`. Bug-ticket action per non-ok finding (existing modal).

**Testlauf-Historie:** Table of past runs stored in DB — Date, Tier, Pass, Fail, Skip, JSON download, Markdown download. Runs are stored when the bash runner completes (see backend below).

**Manuelle Test-Protokolle:** Existing `TestResultsPanel` component embedded unchanged.

---

## Backend — New API Endpoints

### `POST /api/admin/tests/run`

Requires admin session. Body: `{ tier: "prod"|"local", testIds?: string[] }`.

- Spawns `bash tests/runner.sh <tier> [testIds...]` via `child_process.spawn`.
- Detects cluster from `ENV` env var (set in pod spec) and sets `PROD_DOMAIN` accordingly.
- Writes stdout to a temp JSONL file; each line is a test result or raw log line.
- Returns `{ jobId: string }`.
- Stores job metadata in DB: `test_runs(id, tier, test_ids, started_at, status, cluster)`.

### `GET /api/admin/tests/stream/:jobId`

Server-Sent Events endpoint. Watches two sources for the given job simultaneously:

1. **Process stdout** — each line emitted as `event: log` (human-readable output for the left panel).
2. **JSONL temp file** (`/app/tests/results/.tmp-<tier>-<date>.jsonl`) — tailed with `fs.watch`; each new line parsed and emitted as `event: result` with payload `{ req, test, desc, status, duration_ms, detail }` (for the right panel).

- Emits `event: done` with summary `{ total, pass, fail, skip }` when the process exits.
- Closes SSE connection after `done`.

### `GET /api/admin/tests/results/:jobId`

Returns the finalised result. Query param `?format=json` (default) or `?format=md`.

- Reads finalised JSON/MD from `/app/tests/results/` inside the pod after run completes.
- Also used for the Berichte tab history download links.

### `POST /api/admin/tests/playwright-report`

Accepts `Content-Type: text/html`. Protected by `Authorization: Bearer <MONITORING_WEBHOOK_TOKEN>`.

- Stores the HTML body in DB table `playwright_reports(id, created_at, html)` — keeps last 5 reports.
- Returns `{ ok: true, id }`.

### `GET /api/admin/tests/playwright-report`

Requires admin session.

- Returns the most recent HTML from `playwright_reports`.
- Served inside an `<iframe>` on the Tests tab.

---

## Infrastructure Changes

### Website Docker image

Add to `website/Dockerfile`:
- Copy `tests/` directory into image at `/app/tests/`
- Install: `kubectl`, `jq`, `curl`, `bash` (if not already present in base image)

### Pod environment

Add to website Deployment (`k3d/website.yaml` and prod overlays):
- `ENV` env var — set to `dev` / `mentolder` / `korczewski` so the runner knows which `PROD_DOMAIN` to use
- `MONITORING_WEBHOOK_TOKEN` — new secret value for Playwright report webhook auth

### Database

Two new tables in the `website` database:

```sql
CREATE TABLE test_runs (
  id         TEXT PRIMARY KEY,
  tier       TEXT NOT NULL,
  test_ids   TEXT,            -- space-separated, null = all
  cluster    TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status     TEXT NOT NULL DEFAULT 'running',
  pass       INT,
  fail       INT,
  skip       INT,
  duration_ms INT
);

CREATE TABLE playwright_reports (
  id         SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  html       TEXT NOT NULL
);
```

### `.gitignore`

Add `.superpowers/` if not already present.

---

## Component Structure

```
website/src/components/admin/
  MonitoringDashboard.svelte        ← replace with tabbed shell
  monitoring/
    OverviewTab.svelte              ← new
    ClusterTab.svelte               ← extracted from current dashboard
    TestsTab.svelte                 ← new
    DeploymentsTab.svelte           ← extracted from current dashboard
    BerichteTab.svelte              ← new, wraps TestResultsPanel
    TestRunner.svelte               ← bash runner split panel (used by TestsTab)
    PlaywrightPanel.svelte          ← playwright iframe + prompt (used by TestsTab)
    TestResultsPanel.svelte         ← unchanged, embedded in BerichteTab
```

`MonitoringDashboard.svelte` becomes a thin shell that renders the tab bar and the active tab component. Each tab component fetches its own data independently.

---

## Out of Scope

- Running Playwright tests directly in the pod (heavyweight, not needed — Claude handles it via MCP)
- Historical Playwright report diffing
- Real-time deployment log streaming (restart/scale only)
- Any changes to existing staleness webhook flow
