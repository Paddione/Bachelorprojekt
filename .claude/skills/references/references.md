# Skill References — Consolidated

Konsolidierte SSOT-Referenz für `dev-flow`-Skills und Subagenten. Früher 8 Einzeldokumente unter
`.claude/skills/references/*.md`, jetzt gebündelt in einer Datei. Skill- und Subagent-Prompts
verlinken gezielt per Section-Anchor auf den passenden Abschnitt.

## Inhaltsverzeichnis

1. [Subagent-Provisioning-Rubrik](#subagent-provisioning) — Modell · Effort · Kontext
2. [Plan-Quality-Gates](#plan-quality-gates) — CI-Checkliste für Plan-Autoren
3. [Plan-Review-UI](#plan-review-ui) — Render → Review → Verdict
4. [dev-flow Gotchas & Knowledge Base](#dev-flow-gotchas) — T000xxx-Referenz
5. [Deploy-Routing (SSOT)](#deploy-routing) — Pfad → Deploy-Task
6. [MCP-Tool-Guide](#mcp-tool-guide) — MCP-Schnellweg vs. kubectl-Fallback
7. [Brainstorming Visual Companion Tunnel Setup](#brainstorm-tunnel-setup)
8. [Grilling → Ticket](#grilling-to-ticket) — Q/A-Antworten ans Ticket senden

---

## Subagent-Provisioning

Wenn ein dev-flow-Skill Arbeit an einen frischen Subagenten delegiert, wähle **nicht** pauschal ein
Modell — provisioniere den **passenden** Subagenten entlang dreier Achsen. (Gleiche Logik wie die
Software-Factory-`provision()` (historisch archiviert).)

Leitsatz: **Korrektheit vor Kosten.** Im Zweifel eine Stufe höher (Modell) bzw. mehr Effort.

### 1. Modell (ideal)

Klassifiziere die Aufgabe nach **Komplexität × Risiko × Rolle**:

| Aufgaben-Charakter | Modell |
|---|---|
| Mechanisch: Config, Doku, Rename, Single-File-Edit, Lockfile-/Dependency-Bump | `haiku` |
| Standard: normale Feature-/Fix-Implementierung, mehrere Dateien, klarer Plan | `sonnet` |
| Komplex/riskant: systemübergreifend, Architektur, Security, DB-/Schema-Migration, Nebenläufigkeit, Auto-Deploy | `opus` |
| Reasoning-lastige Meta-Arbeit: Plan-Schreiben, Design/Architektur, adversariale Review | `opus` (immer) |

Im Zweifel **eine Stufe höher**. Wenn unsicher, ob ein Spezial-Modell überhaupt passt: **`model` weglassen**
→ der Subagent erbt das Main-Loop-Modell (fast immer korrekt).

> **⚠ Haiku-Fußangel bei Spec-Reviews [T000551]:** Haiku liest ohne expliziten `limit`-Parameter nur
> die ersten ~80 Zeilen einer Datei und liefert daher false negatives bei Spec-Compliance-Prüfungen
> über mehrere Dateien. **Spec-Reviewer-Subagenten müssen `sonnet` oder besser verwenden.**
> Zusätzlich: Im Prompt explizit `grep`-basierte Verifikation verlangen statt blindem `Read()` — das
> umgeht sowohl das Zeilenlimit als auch potenzielle Read-Caching-Artefakte.

### 2. Effort (per Prompt-Direktive)

Das `task`-Tool kennt **`subagent_type` und `description`**, keinen separaten Effort-Regler — Effort wird über die Prompt-Einleitung vermittelt. Für reine Read-only-Arbeiten (Recherche, Analyse) verwende `delegate(prompt, agent)` mit agent `"researcher"` oder `"explore"` — Effort wird über die Prompt-Einleitung vermittelt:

| Stufe | Prompt-Einleitung | Wann |
|---|---|---|
| low | „Arbeite zügig und fokussiert." | mechanisch, geringes Risiko |
| medium | (neutral, kein Zusatz) | Standard |
| high | „Ultrathink. Denke sehr gründlich nach." | komplex/riskant/Meta |
| **ultra** | high **+ `Workflow`-Fan-out statt Einzel-Agent** | sehr groß/parallelisierbar (multi-subsystem Plan/Review): nutze das `Workflow`-Tool (mehrere Agenten + adversariale Verifikation gegen einen **geteilten Interface-Contract**), nicht einen einzelnen Agenten |

### 3. Kontext (passend & KOMPAKT)

Der Subagent hat per Konstruktion **keinen** Kontext — gib alles explizit, aber **verdichtet**:

- Absoluter Worktree-Pfad (`pwd`) + Branch-Name; er arbeitet NUR relativ dazu.
- Die relevanten **Artefakt-Pfade** (Spec/Plan/Ticket), nicht deren Volltext, wenn er sie selbst lesen kann.
- Bei mehreren Vorstufen-Ergebnissen: **zusammenfassen, nie Roh-JSON dumpen**. (Ein 162k-Zeichen-Prompt ließ
  einen Synthese-Agenten ohne brauchbare Antwort scheitern — die Provisioning-Lehre schlechthin.)

---

## Plan-Quality-Gates

Jeder Implementierungsplan muss gegen diese CI-Gates geschrieben werden. Die Quelle der Wahrheit
ist `docs/code-quality/gates.yaml` (Limits/Scopes dort nachlesen, nicht hier raten — diese Datei
ist eine Karte, kein Ersatz).

### S1 — Zeilenlimits pro Datei (Ratchet gegen BASELINE, nicht gegen das Limit)

`node scripts/code-quality/check.mjs` (lokal: `task quality:check`, in `task freshness:check`
enthalten) ist ein **Ratchet** gegen die eingefrorenen Werte in `docs/code-quality/baseline.json`.
Es blockiert CI, wenn:
- eine **neue / nicht gebaselinete** Datei über ihrem Extension-Limit liegt, **oder**
- eine **bereits gebaselinete** Datei *wächst*, d.h. `metric > baseline[datei].metric` (worsened).

> **Die Schwelle, die euch in der Praxis trifft, ist NICHT das statische Limit, sondern der
> Baseline-Wert.** Eine schon gewachsene (gebaselinete) Datei liegt bereits *über* dem Limit und
> ist auf ihrem Ist-Wert eingefroren → das Zeilenbudget ist **0 oder negativ**: schon **+1 Zeile**
> macht CI rot (real passiert: `AdminLayout.astro` 444→445). Das statische Limit ist nur für
> *neue/kleine* Dateien die relevante Schwelle.

Statische Limits (Stand 2026-06, verbindlich ist `gates.yaml` → `s1.limits`):

| Extension | Limit | | Extension | Limit |
|-----------|-------|-|-----------|-------|
| `.ts` `.js` `.jsx` `.py` | 600 | | `.svelte` `.sh` `.mjs` `.mts` | 500 |
| `.astro` `.tsx` `.java` `.php` | 400 | | `.bash` | 300 |
| `.cjs` | 200 | | | |

**Pflicht beim Plan-Schreiben — pro zu ändernder Datei BEIDE Schwellen ermitteln:**
1. `wc -l <datei>` → Ist-Zeilen.
2. Baseline-Wert nachschlagen (die **wirksame** Schwelle):
   ```bash
   jq -r '."S1:<relativer/pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json
   ```
   - `nicht-baselined` → wirksame Schwelle = statisches Extension-Limit (Tabelle oben),
     Budget = Limit − Ist.
   - eine Zahl → Datei ist gebaselined (liegt über Limit, eingefroren). Wirksame Schwelle =
     **dieser Baseline-Wert**, Budget = Baseline − Ist (**oft 0**).
3. Budget im Plan notieren — gegen die wirksame Schwelle, z.B.
   „`CoachingSettings.svelte` Ist 600 · Baseline 600 → **Budget 0**: Änderung MUSS netto
   zeilenneutral sein ODER die Datei in dieser PR echt verkleinern."
4. Liegt die Datei nach der Änderung voraussichtlich über ~80 % ihrer **wirksamen Schwelle**,
   plane die Aufteilung in ein Modul gleich mit ein — **echter Split/Extraktion**, kein
   kosmetisches Zeilen-Zusammenziehen (das drückt nur die Metrik und trippt bei der nächsten
   Änderung erneut → genau die Firefight-Schleife, die dieser Schritt verhindern soll).
5. Neue Dateien mit Wachstumsreserve unter dem Limit schneiden.
6. **Niemals** eine Baseline-/Ignore-Ausnahme einplanen, um die Schwelle zu umgehen — die
   Baseline-Key-Count-Assertion in `freshness:check` (Phase 3) failt ohnehin bei Baseline-Wachstum.

### S2 — Import-Zyklen

Keine neuen Zyklen in den Graphen `website`, `arena-server`, `e2e` (tsconfig-basiert).
Helper-Module als **pure Module** ohne Rück-Import auf DB-/API-Schichten planen.

### S3 — Hardcodierte Hostnamen

In `k3d/`, `prod*/`, `website/src/` sind String-Literale `*.mentolder.de` / `*.korczewski.de`
verboten (Kommentarzeilen ausgenommen). Im Plan immer Env-/Config-basierte Auflösung
vorsehen (`PROD_DOMAIN`, `configmap-domains.yaml`-ConfigMap, `{ns}`-Templates) — nie
Brand-Domains in Code-Snippets vorgeben.

### S4 — Orphan-Manifeste/-Skripte

Jedes neue `k3d/*.yaml` muss in einer `kustomization.yaml` referenziert sein, jedes neue
`scripts/*.sh`/`*.mjs` von Taskfile/CI/Doku/anderem Skript aus erreichbar — sonst Orphan-Violation.

### Weitere CI-Gates (Pflicht im finalen Verifikations-Task jedes Plans)

Der letzte Task jedes Plans MUSS diese Kommandos als Steps enthalten:

```bash
task test:changed          # Gezielte Tests für geänderte Domains (vitest --changed + BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Dazu:
- **Test-Inventar:** nach jeder Test-Änderung `task test:inventory` regenerieren und
  `website/src/data/test-inventory.json` mitcommitten (CI failt sonst).
- **Baseline darf nicht wachsen:** CI vergleicht die Key-Anzahl von
  `docs/code-quality/baseline.json` gegen main — Pläne dürfen keine Baseline-Einträge hinzufügen.
- **Bestehende Tests erweitern statt neue Dateien anlegen** (Vitest/Playwright/BATS zuerst suchen).
- **Manifest-Änderungen:** `task workspace:validate` + relevante `./tests/runner.sh local <TEST-ID>`.
- **Image-Pins:** CI warnt bei `:latest` — Ausnahmen nur website/brett/docs (dokumentiert in CLAUDE.md).

---

## Plan-Review-UI

### Overview

The Plan Review UI lets you visually review a plan file line-by-line in a local
browser, annotate changes (strike/replace/insert lines, comment), and submit a
verdict (`approve` or `request-changes`) over the existing loopback `/submit`
channel. No external service, no DB, no network.

### Flow

1. **Render**
   ```bash
   bash scripts/plan-review/plan-review.sh render openspec/changes/<slug>/tasks.md
   ```
   → Opens the plan in the Companion board with line-numbered HTML.

2. **Review & annotate** in the browser:
   - Select text → sidebar op buttons (Durchstreichen, Ersetzen, Einfügen, Kommentar)
   - Annotations appear in the sidebar (removable)
   - Submit ✓ Approve or ↺ Änderungen anfordern

3. **Read verdict**
   ```bash
   bash scripts/plan-review/plan-review.sh result
   ```
   → `jq`-formatted `{kind, verdict, annotations, plan}`
   - `approve` → proceed with execution
   - `request-changes` → apply annotations, 1 revision round, re-render

### Files

| File | Role |
|------|------|
| `scripts/plan-review/render-plan.mjs` | Pure Node Markdown→HTML renderer |
| `scripts/plan-review/annotate-client.js` | Vanilla-JS annotation client (embedded in HTML) |
| `scripts/plan-review/plan-review.sh` | CLI wrapper: `render` / `result` |
| `tests/unit/superpowers-submit-patch.bats` | Server patch smoke tests (plan-review fields) |

### Security

- **Loopback-only gate**: the annotation client activates only on
  `http://localhost|127.0.0.1` with `__BRAINSTORM_SUBMIT_PORT` set (injected by
  server). Public pages (https via funnel) never see the annotation UI.
- **Server-side**: the plan-review fields (`annotations`, `verdict`) are added
  only when `ev.kind === 'plan-review'`. Regular brainstorm submit payloads are
  unaffected.
- **No hardcoded hostnames**: the board host comes from `brainstorm.sh`; the
  submit port from the server-injected `__BRAINSTORM_SUBMIT_PORT`.

### Payload Contract

POST `http://localhost:<submitPort>/submit`:
```json
{
  "kind": "plan-review",
  "plan": "Plan title",
  "verdict": "approve|request-changes",
  "annotations": [
    {"op": "strike|replace|insert|comment", "fromLine": 3, "toLine": 5,
     "text": "…", "reason": "…", "position": "before|after"}
  ],
  "nonce": "<unique>",
  "screen": "<path>",
  "markdown": "«PLAN-REVIEW»\nVerdict: approve\n..."
}
```

---

## dev-flow Gotchas

This section aggregates known operational issues, gotchas, and workarounds for the `dev-flow` pipeline. Refer to these when executing plans, creating tickets, or deploying components.

### [T000321] Main Branch Guard (Branch Protection)
**Context**: Never commit or push directly to `main`.
**Rule**: Always create a feature, fix, or chore worktree/branch. `dev-flow-plan` and `dev-flow-execute` verify that the active branch is not `main` before commiting/pushing changes.

### [T000343] Brainstorm Port Selection
**Context**: Visual Companion server port mismatch.
**Rule**: Always derive the `$PORT` dynamically from the return value of `start-server.sh`. Hardcoding or guessing a port from a prior session will result in 502 Bad Gateway.

### [T000298] Git Auto-Merge in Worktrees
**Context**: `gh pr merge --auto` inside `/tmp/wt-*` worktrees.
**Rule**: Running `--auto` inside a worktree can silently fail or skip because Git thinks `main` is already in use by the primary worktree. Always run the merge command either with explicit `--repo` from the primary repository directory, or poll the checks sequentially (without `--auto`) before merging.

### [T000346] K8s Object verification before Planning
**Context**: Mismatch between planned k8s object name and actual name.
**Rule**: Before detailing a step to patch a deployment (e.g. `talk-hpb`), run `kubectl kustomize` or `kubectl get` to verify its actual name (e.g. `spreed-signaling`) and active configurations/affinity rules. Do not assume names.

### [T000244] JSON Patch duplicate keys in Env variables
**Context**: Using `op: add` to append env variables in Kustomize patches.
**Rule**: If the variable already exists in the base deployment, use `op: replace` instead of `op: add`. Otherwise, the duplicate key causes Kubernetes API server validation failures at dry-run time.

<a id="t000218"></a>
### [T000218] task test:all exit 128
**Context**: Intermittent exit code 128 on first run in a fresh worktree.
**Rule**: This is a transient race condition between `npm install` and BATS submodule checks. Re-running the command a second time succeeds.

### [T000245] fresh worktree node_modules missing
**Context**: Node modules are not checked in, and worktrees are clean.
**Rule**: Run `npm ci --prefix brett` or `pnpm install --frozen-lockfile` inside `arena-server` before running tests or compilation within a fresh worktree.

### [T000254] lockfile mismatch after package add
**Context**: Changing `package.json` in `arena-server` causes `pnpm install --frozen-lockfile` to fail.
**Rule**: Run `pnpm install` without flags first to update the lockfile, then commit `pnpm-lock.yaml`.

### [T000214] openclaw approvals get JSON parsing
**Context**: `openclaw approvals get` returns tab-delimited text, not JSON.
**Rule**: Avoid passing stdout to python/jq JSON parsers. If needed, parse the raw `.openclaw/exec-approvals.json` configuration file directly from disk.

### [T000335] Commitlint body-max-line-length
**Context**: Commit lint rejects body lines exceeding 100 characters.
**Rule**: Wrap all commit message body lines to under 100 characters. For raw output or log traces, truncate them or wrap them manually.

### [T000342] gh pr checks parsing
**Context**: Parsing `gh pr checks` status.
**Rule**: Do not use `gh pr view --json state` or check status enums because the values do not reliably map to build results. Use text-based parsing of the checks list columns.

### [T000344] Database row check before file deletion
**Context**: Deleting plan markdown file before verifying database storage.
**Rule**: Always verify that the plan exists in `tickets.ticket_plans` by checking that the row count is greater than 0 before running `rm` on the plan file.

### [T000388] tickets.ticket_plans Query Timeout
**Context**: Querying the `tickets.ticket_plans` table over `kubectl exec`.
**Rule**: Never run `SELECT *` or query the `content` column on the entire `tickets.ticket_plans` table. The `content` column contains large markdown plan files which will cause connection timeouts over the `kubectl exec` tunnel. Always query metadata columns (such as `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly by a specific `ticket_id` or `slug`.

### [T000418] Playwright Project Assignment
**Context**: Assigning the correct Playwright project when writing E2E tests.
**Zuordnungstabelle**:
Use the correct project name in `playwright.config.ts` depending on the targeted service/brand:

| Projektname | Zweck / Ziel |
|-------------|--------------|
| `mentolder` | E2E-Tests für die Marke Mentolder |
| `korczewski` | E2E-Tests für die Marke Korczewski |
| `website` | Allgemeine Website E2E-Tests |
| `services` | Testen von Hintergrund-Diensten |
| `brett-mentolder` | Systembrett E2E-Tests auf Mentolder |
| `smoke` | Smoke-Tests für den Live-Cluster |
| `systemtest` | System-Integrationstests |

---

## Deploy-Routing

Diese Tabelle ist die **einzige** verbindliche Quelle dafür, welcher Deploy-Task zu welchen
geänderten Pfaden gehört. `dev-flow-execute` (Post-Merge-Deploy), `dev-flow-chore` (Schritt 7)
und `dev-flow-iterate` (Dev-Cluster-Redeploy) verweisen alle hierher — **nicht** die Tabelle
kopieren, sondern verlinken.

> Push-basiertes Deploy-Modell: Es gibt **keinen** GitOps-Reconciler auf dem fleet-Cluster.
> Ein Merge nach `main` deployt nichts automatisch (außer `website/**` via `build-website*.yml`).
> Nach dem Merge muss explizit deployt werden.

### Prod-Deploy (nach Merge — beide Brands auf fleet)

| Geänderte Dateipfade | Task |
|---|---|
| `website/**` | `task feature:website` (rollt auto via CI; manueller Re-Deploy bei Bedarf) |
| `brett/**` | `task feature:brett` |
| `docs/**` | `task docs:deploy` |
| `k3d/**`, `prod*/**`, `prod-fleet/**`, `environments/**` | `task feature:deploy` |
| Mehrere Bereiche | Alle zutreffenden Tasks nacheinander |

**Auto-Detection (für `dev-flow-execute` Schritt 8):**
```bash
MERGE_COMMIT=$(git log origin/main -1 --format="%H")
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT")
echo "$CHANGED" | grep -qE '^website/'                                            && task feature:website
echo "$CHANGED" | grep -qE '^brett/'                                              && task feature:brett
echo "$CHANGED" | grep -qE '^docs/'                                               && task docs:deploy
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' && task feature:deploy
```

**Verify nach dem Deploy:**
```bash
kubectl --context fleet get pods -n workspace            | grep -v Running
kubectl --context fleet get pods -n workspace-korczewski | grep -v Running
```

### Dev-Cluster-Redeploy (für `dev-flow-iterate`, k3d)

| SURFACE | Redeploy-Task | Watched pods |
|---------|--------------|--------------|
| `website` | `task dev:redeploy:website ENV=$ENV` | `app=website` |
| `brett` | `task dev:redeploy:brett ENV=$ENV` | `app=brett` |
| `full` | `task dev:deploy ENV=$ENV` | `app=website`, `app=brett` |

### Footguns

- `task feature:*` baut aus dem **Working Tree des aktuellen cwd** — aus einem frischen, mit
  `origin/main` synchronisierten Tree deployen, sonst landet alter Code (Memory:
  *Deploy from a fresh tree, not a stale main checkout*).
- Website-Deploys werden über `build-website*.yml` digest-gepinnt → ein bloßer `rollout restart`
  landet das neue Image evtl. nicht (Memory: *Website deploy goes silently stale*).
- `ENV=` ist immer explizit; ohne `ENV=` greift `dev` und der Context-Mismatch-Check entfällt.

---

## MCP-Tool-Guide

SSOT für die MCP-native Tool-Nutzung in Skills und Subagents. Skills verlinken hierher statt die
Tabelle zu duplizieren. Die MCP-Server laufen via `scripts/mcp-portforward.sh` (Portforward auf
`localhost`), registriert in `.mcp.json`.

### Server → Port → Tool → Anwendungsfall

| MCP-Server | Endpoint | Tool / Prefix | Anwendungsfall |
|---|---|---|---|
| `mcp-postgres` | `http://localhost:13001/mcp` | `mcp__mcp-postgres__query` (Param: `sql`) | **Read-only** SQL (SELECT) als `website`-User — Ticket-Pool, staged-plans, planning-Count, Timeline-Reads |
| `mcp-kubernetes` | `http://localhost:18080/sse` | `mcp__mcp-kubernetes__*` | Strukturierte k8s-Status-/Read-Operationen (Pods, Logs, Describe) |
| `mcp-task-runner` | stdio (local binary) | `plan_tasks`, `run_task`, `execute_plan` | go-task parallel ausführen + OTel-Logging; OTel via `localhost:4317` (portforward) |

> **`mcp__mcp-postgres__query` ist READ-ONLY und nimmt NUR `sql`.** Kein `connectionString`-Argument
> — die Verbindung ist serverseitig fest (`localhost:13001`, siehe `.mcp.json`). INSERT/UPDATE/DELETE
> gehen NICHT über dieses Tool.

### Portforward-Guard (vor MCP-Nutzung prüfen)

```bash
bash scripts/mcp-portforward.sh status
# oder gezielt nur postgres:
curl -s --max-time 2 -o /dev/null -w '%{http_code}' \
  -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' \
  http://localhost:13001/mcp
# 200 → MCP erreichbar; alles andere → kubectl-Fallback nutzen
```

Wenn der Portforward nicht läuft: `bash scripts/mcp-portforward.sh start`. Schlägt das fehl oder ist
der Cluster-Kontext nicht gesetzt → **kubectl-Fallback** (der jeweilige `psql`-/`kubectl`-Block im Skill).

### Wann MCP, wann kubectl

**MCP bevorzugen** (wenn Guard = erreichbar):
- Read-only SELECTs gegen `tickets.*`, `knowledge.*`, `v_timeline` → `mcp__mcp-postgres__query`
- k8s-Status/Read (Pod-Liste, Logs, Describe) → `mcp__mcp-kubernetes__*`


**Bleibt kubectl (Pflicht, kein MCP-Äquivalent / fehlende Rechte):**
- **DDL als `postgres`-Superuser** auf den Schemas `bachelorprojekt`, `coaching`, `knowledge`
  (Tabellen-Owner = `postgres`). MCP-Postgres verbindet als `website` ohne Superuser-Rechte → DDL
  schlägt mit „must be owner" fehl. Pflicht:
  ```bash
  PGPOD=$(kubectl get pod -n workspace --context <env> -l app=shared-db -o name | head -1)
  kubectl exec -i "$PGPOD" -n workspace --context <env> -- psql -U postgres -d website < migration.sql
  ```
- **Schreibende SQL** (INSERT/UPDATE/DELETE/UPSERT) — `mcp__mcp-postgres__query` ist read-only → kubectl.
- **`kubectl apply` / `kubectl rollout restart`** und sonstige Manifest-Mutationen.
- **Sealed Secrets / RBAC / Cluster-Level-Operationen.**

---

## Brainstorm-Tunnel-Setup

This guide details how to start and publish the Visual Companion brainstorming tunnel.

### Step 1: Ensure wss:// and collab patches are applied

```bash
bash scripts/superpowers-helper-patch.sh
bash scripts/superpowers-collab-patch.sh
```

Both patches are idempotent and wired as SessionStart hooks. Re-run after any
superpowers plugin update (`bash scripts/superpowers-collab-patch.sh --check`
exits non-zero if a re-apply is needed).

If exit ≠ 0, retry or run manually.

### Step 2: Start Visual Companion server

```bash
START_SCRIPT=$(find ~/.claude/plugins/cache/claude-plugins-official/superpowers \
  -name start-server.sh | sort -V | tail -1)
RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
PORT=$(echo "$RESULT" | jq -r '.port')
SCREEN_DIR=$(echo "$RESULT" | jq -r '.screen_dir')
STATE_DIR=$(echo "$RESULT" | jq -r '.state_dir')
```

Always derive the PORT dynamically from the start script result. Never guess or reuse old ports.

### Step 3: Verify sish setup and keys

```bash
task brainstorm:status >/tmp/brainstorm-status.log 2>&1 || true
grep -q 'Running' /tmp/brainstorm-status.log || { echo "sish pod not Running — aborting"; cat /tmp/brainstorm-status.log; exit 1; }

# Check that at least one authorized key is present in secrets
KEY_COUNT=$(kubectl --context fleet -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.DEV_SISH_AUTHORIZED_KEYS}' 2>/dev/null | base64 -d 2>/dev/null | grep -c '^ssh-' || echo 0)
if [[ "$KEY_COUNT" -lt 1 ]]; then
  echo "⚠️ Keine authorized_keys in workspace-secrets. Key in environments/.secrets/mentolder.yaml unter DEV_SISH_AUTHORIZED_KEYS ergänzen, dann: task env:seal ENV=mentolder"
  exit 1
fi
```

### Step 4: Kill stale tunnels & Publish

```bash
# Kill stale SSH forwards on sish port 32223
pkill -f "ssh.*[3]2223" 2>/dev/null && echo "Stale ssh tunnel(s) killed" || echo "Kein staler Tunnel gefunden"
sleep 1

# Publish tunnel (run_in_background)
task brainstorm:publish -- $PORT >/tmp/brainstorm-publish.log 2>&1
```

#### Step 4b: Register in the Active Sessions Hub

So the board shows up as a card in the website Mediaviewer. This is a live WebSocket board,
so use `register` (not `start-form` — the board is served via sish, not the sessions-server):

```bash
bash scripts/session-hub.sh register \
  --name "brainstorm" --port "$PORT" --type brainstorm \
  --title "Brainstorm: $(date +%F)"
```

The Mediaviewer card links to `https://session-brainstorm.sessions.mentolder.de` (registry
entry only — not served there). The actual interactive board is at `https://brainstorm.dev.mentolder.de`.

### Step 5: Verify the Tunnel is Live

Wait up to 15 seconds for `https://brainstorm.dev.mentolder.de` to reply:

```bash
for i in $(seq 1 15); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 https://brainstorm.dev.mentolder.de/ || echo 000)
  if [[ "$CODE" == "200" || "$CODE" == "302" || "$CODE" == "301" ]]; then
    echo "✓ Tunnel live (HTTP $CODE) nach ${i}s"
    break
  fi
  sleep 1
done
if [[ "$CODE" != "200" && "$CODE" != "302" && "$CODE" != "301" ]]; then
  echo "✗ Tunnel failed (HTTP: $CODE)"
  cat /tmp/brainstorm-publish.log
  exit 1
fi
```

If the companion server terminates right after verification, restart it:
```bash
if ! ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
  PORT=$(echo "$RESULT" | jq -r '.port')
fi
```
Tell the user: **"Visual-Companion running at https://brainstorm.dev.mentolder.de"**

---

### Collaborative Session

Use `task brainstorm:collab` to start a session that gekko can join:

```bash
# Apply collab patch + publish + print the SSO link
task brainstorm:collab -- $PORT
```

This runs the collab patch, prints the SSO link, then delegates to `task brainstorm:publish`.

#### Prerequisites for gekko

1. gekko must have a Keycloak account in the workspace realm.
2. Add gekko to the `/brainstorm-access` group (Keycloak admin UI → Groups → brainstorm-access → Members).
3. Share the printed link: `https://brainstorm.dev.mentolder.de`
4. gekko logs in via Keycloak; without `/brainstorm-access` membership they get a 403.

#### Dev-flow status pushes

During a dev-flow, push milestone updates to the board so gekko can follow along:

```bash
task brainstorm:push TITLE='Task 3 — Patch driver' STATUS='bats grün, driver fertig'
```

The companion's `fs.watch` broadcasts a reload automatically; both screens update.

#### First-time setup: BRAINSTORM_OIDC_SECRET

Before applying `oauth2-proxy-brainstorm.yaml` to the dev cluster:

```bash
# 1. Add BRAINSTORM_OIDC_SECRET to environments/.secrets/mentolder.yaml
# 2. Re-seal:
task env:seal ENV=mentolder
# 3. Apply the dev-stack with the new manifest:
task dev:deploy
```

The Keycloak `brainstorm` client and `/brainstorm-access` group are pre-configured
in `k3d/realm-workspace-dev.json` and will be imported on the next realm import.

#### WebSocket passthrough note

The SSO gate uses Traefik ForwardAuth (not a full upstream proxy). Traefik
authenticates the initial HTTP upgrade, then passes the `wss://` connection
directly to sish. Both the click-loop and the collab WebSocket survive this hop.
If the WS upgrade breaks in practice (check browser DevTools → Network → WS
frames), fall back to running oauth2-proxy with `--upstream=http://sish:80`
(full-proxy mode) and remove the IngressRoute routing to sish — the proxy
handles all traffic end-to-end in that case.

### Headless / Automated Browser Access (T000542)

The collab-patch shows a blocking `window.prompt()` to collect the user's display
name on first load. Headless browsers (Playwright MCP) timeout waiting for this
dialog. To bypass it, append `?who=<name>` to the URL:

```
https://brainstorm.dev.mentolder.de/?who=AutoBot
```

- The value is saved to `localStorage.brainstorm_who` and reused on subsequent
  visits (no re-prompt).
- Names are trimmed to 24 characters.
- The `?who=` param is checked **before** `prompt()` — no `handle_dialog` needed.
- Pre-setting `localStorage` also works if the page is already loaded without a
  URL param (existing behavior, unchanged).

### Active Sessions Hub — SessionStart reap (optional local hook)

`.claude/settings.json` is gitignored (machine-local). To auto-reap dead session
tunnels at every session start, add locally:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  "bash scripts/session-hub.sh reap"
] } ] } }
```

The file is never committed. See `scripts/session-hub.sh reap` for the behavior:
it drops registry entries whose tunnel PID is no longer alive, preventing stale
cards in the Mediaviewer.

---

## Grilling → Ticket

Eine *Grilling-Session* (strukturiertes Q/A-Interview — Coaching-Fragebogen, Deep-Grilling
vor dem Planen, Klärungsrunde, Incident-Befragung) **an ein bestehendes Ticket senden**.
Das Wissen landet in der `grilling_answers` JSONB-Spalte auf `tickets.tickets` und (sofern
nicht unterdrückt) zusätzlich als lesbarer Timeline-Kommentar.

### Wann grillen

- **Klärung statt Raten:** Wenn eine offene Frage nur der Mensch beantworten kann (Scope,
  Akzeptanzkriterien, Design-Präferenz), grillen statt annehmen.
- **Persistenz statt flüchtig:** Antworten gehören ans Ticket, nicht nur in den Chat —
  so sind sie für Factory/dev-flow-execute/Panel wieder abrufbar.

### Aufruf

```bash
scripts/ticket.sh grill --id <external_id> \
  [--questionnaire <qid>] \          # default: coaching-sessions-v1
  ( --json '{"q1":"...","q2":"..."}' \
  | --answers-file <pfad.json> \
  | --answer qid=text --answer qid=text ... ) \
  [--no-comment] \
  [--brand <mentolder|korczewski>]
```

**Semantik:**
- **Per-Frage-Merge** (akkumulierend, wie das Panel-Auto-Save): bestehende Antworten bleiben,
  gleiche `questionId` wird überschrieben.
- **Idempotent:** legt die Spalte bei Bedarf selbst an (`ADD COLUMN IF NOT EXISTS`) → funktioniert
  unabhängig vom Merge-Zeitpunkt des T000737-Panels, bleibt aber form-identisch.
- **Validierung vor Cluster-Zugriff:** fehlende `--id` oder Antwort-Quelle → Exit 2 ohne kubectl.
  Ticket nicht gefunden → Exit 1.
- **Brand:** via `--brand` oder `BRAND`-Env (mentolder=`workspace`, korczewski=`workspace-korczewski`).

### Strukturiert vs. ad-hoc

- **Strukturiert** (`--questionnaire coaching-sessions-v1`, registriert in
  `website/src/lib/tickets/grilling.ts`): rendert nach dem T000737-Merge direkt im
  `GrillingAnswersPanel`.
- **Ad-hoc** (eigener Fragebogen-Slug, nicht registriert): wird gespeichert, aber vom Panel
  (das nur bekannte `QUESTIONNAIRES` rendert) **nicht** angezeigt → hier ist der
  Timeline-Kommentar die universelle Sichtbarkeit. Ein generischer Panel-Renderer für
  unbekannte Fragebögen ist ein Folge-Ticket (kein Blocker).

### Beispiele

Ad-hoc-Klärung an ein Planungsbüro-Ticket:
```bash
scripts/ticket.sh grill --id T000812 \
  --answer scope="nur mentolder, korczewski später" \
  --answer deadline="kein Hard-Date"
```

Strukturierter Coaching-Fragebogen aus Datei (forward-kompatibel mit dem Panel):
```bash
scripts/ticket.sh grill --id T000812 --questionnaire coaching-sessions-v1 \
  --answers-file /tmp/coaching-answers.json
```
