---
title: Tasks: mcp-native-tools
ticket_id: T000980
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-native-tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `dev-flow-execute`) to implement this plan operation-by-operation. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** Weave the running MCP servers (`mcp-postgres`, `mcp-kubernetes`, `mcp-keycloak`) into skills and the CLAUDE.md agent-routing table so agents prefer the MCP fast-path over `kubectl exec … psql` detours, with `kubectl` kept as the explicit fallback and as the mandatory path for DDL/superuser/write operations.
>
> **Architecture:** Pure documentation edits across 8 existing `.md` files plus one new reference doc. No code, no manifests, no tests change. Each edited skill gets an MCP-first directive *before* its existing `psql`/`kubectl` block; the existing block is relabeled as the fallback. A single new reference (`mcp-tool-guide.md`) is the SSOT for ports, tool names, the guard pattern, and the kubectl-only carve-outs; skills link to it instead of repeating prose.

## File Structure

**New files:**
- `.claude/skills/references/mcp-tool-guide.md` — SSOT: MCP server table, portforward guard, kubectl carve-outs

**Modified files (doc-only edits, no S1 limit for `.md`):**
- `CLAUDE.md` — agent-routing table: new `MCP-Primär` column + guide pointer
- `.claude/skills/dev-flow-execute/SKILL.md` — MCP fast-path before 3 staged-plans queries
- `.claude/skills/dev-flow-plan/SKILL.md` — MCP fast-path before 2 staged-plans + planning-count queries
- `.claude/skills/feature-intake/SKILL.md` — MCP fast-path before 3 ticket-pool queries
- `.claude/skills/ticket-ops/SKILL.md` — MCP-first note above psql helper
- `.claude/skills/mishap-tracker/SKILL.md` — MCP-first note above PSQL setup
- `.claude/skills/incident-response/SKILL.md` — MCP-first note above SQL helper
- `.claude/skills/database-ops/SKILL.md` — Tool-Auswahl section (MCP vs kubectl boundary)

## Global Constraints

- **All edited files are `.md`** — S1 line limits (`.ts/.js/.svelte/.astro/.sh/.mjs/...`) do **not** apply. No line-budget accounting needed.
- **`mcp__mcp-postgres__query` is READ-ONLY and takes a single `sql` parameter.** It does NOT accept `connectionString` (the connection is baked into the MCP server at `localhost:13001/mcp`, configured in `.mcp.json`). Therefore: only `SELECT`/read queries may route to MCP. Any `INSERT`/`UPDATE`/`DELETE`/`UPSERT` MUST stay on `kubectl exec … psql`. Do not invent a `connectionString` argument in any directive.
- **DDL as the `postgres` superuser stays kubectl.** MCP-Postgres connects as the `website` user without superuser rights; DDL on the `bachelorprojekt`, `coaching`, `knowledge` schemas (owner = `postgres`) fails with "must be owner". Keep the existing `kubectl exec -i "$PGPOD" … psql -U postgres` path verbatim for DDL.
- **Never delete the existing `kubectl`/`psql` blocks** — relabel them as the fallback. Removing them would strand any environment without an active portforward.
- **Verbatim values** — MCP endpoints and tool names exactly as registered:
  - `mcp-postgres` → `http://localhost:13001/mcp` → tool `mcp__mcp-postgres__query` (param: `sql`)
  - `mcp-kubernetes` → `http://localhost:18080/sse` → tools `mcp__mcp-kubernetes__*`
  - `mcp-keycloak` → `http://localhost:18081/mcp` → tool `mcp__mcp-keycloak__executeKeycloakOperation` (params: `operation`, `params`)
  - Health/guard command: `bash scripts/mcp-portforward.sh status` (or a single `curl -s --max-time 2 -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' http://localhost:13001/mcp`).
- **No hardcoded brand hostnames** (S3) — none are introduced; this is doc text only.
- **New reference doc must be linked** from at least one SKILL.md to avoid an orphan-doc condition and to keep it discoverable (the references dir is reached via `file://…/.claude/skills/references/<name>.md` markdown links).

---

## Operation 1: Create the MCP tool guide (new reference SSOT)

**Files:**
- Create: `.claude/skills/references/mcp-tool-guide.md`

This is the single source of truth the skill directives link to, so the per-skill edits stay short. It must exist before the skills reference it (do this operation first).

### Requirement: MCP tool guide documents servers, guard, and carve-outs

The reference SHALL document, for each MCP server, the port, the MCP tool name(s)/prefix, and the use case; the portforward guard pattern; the precise MCP-vs-kubectl boundary; and the critical DDL/superuser and write carve-outs that MUST remain kubectl.

#### Scenario: Agent consults the guide to choose a tool

- **GIVEN** an agent needs to run a database read, a k8s status check, or a Keycloak realm op
- **WHEN** it reads `.claude/skills/references/mcp-tool-guide.md`
- **THEN** it finds a table mapping server → port → tool name → use case, the guard command, and an explicit "stays kubectl" list (DDL-as-postgres, writes, `kubectl apply`/`rollout`, sealed-secrets/RBAC)

- [ ] **Step 1.0: Verify the guide does not exist yet (pre-condition)**

Run: `ls .claude/skills/references/mcp-tool-guide.md 2>&1`
Expected: FAIL — "No such file or directory". If it already exists, inspect and reconcile before writing.

- [ ] **Step 1.1: Write the new reference file**

Create `.claude/skills/references/mcp-tool-guide.md` with exactly this content:

````markdown
# MCP-Tool-Guide — MCP-Schnellweg vs. kubectl-Fallback

SSOT für die MCP-native Tool-Nutzung in Skills und Subagents. Skills verlinken hierher statt die
Tabelle zu duplizieren. Die MCP-Server laufen via `scripts/mcp-portforward.sh` (Portforward auf
`localhost`), registriert in `.mcp.json`.

## Server → Port → Tool → Anwendungsfall

| MCP-Server | Endpoint | Tool / Prefix | Anwendungsfall |
|---|---|---|---|
| `mcp-postgres` | `http://localhost:13001/mcp` | `mcp__mcp-postgres__query` (Param: `sql`) | **Read-only** SQL (SELECT) als `website`-User — Ticket-Pool, staged-plans, planning-Count, Timeline-Reads |
| `mcp-kubernetes` | `http://localhost:18080/sse` | `mcp__mcp-kubernetes__*` | Strukturierte k8s-Status-/Read-Operationen (Pods, Logs, Describe) |
| `mcp-keycloak` | `http://localhost:18081/mcp` | `mcp__mcp-keycloak__executeKeycloakOperation` (Params: `operation`, `params`) | Realm-/Client-/User-/Group-Operationen (z. B. `GET_REALMS`, `GET_CLIENTS`) |

> **`mcp__mcp-postgres__query` ist READ-ONLY und nimmt NUR `sql`.** Kein `connectionString`-Argument
> — die Verbindung ist serverseitig fest (`localhost:13001`, siehe `.mcp.json`). INSERT/UPDATE/DELETE
> gehen NICHT über dieses Tool.

## Portforward-Guard (vor MCP-Nutzung prüfen)

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

## Wann MCP, wann kubectl

**MCP bevorzugen** (wenn Guard = erreichbar):
- Read-only SELECTs gegen `tickets.*`, `knowledge.*`, `v_timeline` → `mcp__mcp-postgres__query`
- k8s-Status/Read (Pod-Liste, Logs, Describe) → `mcp__mcp-kubernetes__*`
- Keycloak-Realm-/Client-/User-Reads → `mcp__mcp-keycloak__executeKeycloakOperation`

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
````

- [ ] **Step 1.2: Verify the file renders and has the carve-out**

Run: `grep -n 'mcp__mcp-postgres__query\|must be owner\|READ-ONLY\|18080/sse\|18081/mcp' .claude/skills/references/mcp-tool-guide.md`
Expected: matches for the tool name, the DDL "must be owner" carve-out, the READ-ONLY note, and both other endpoints.

- [ ] **Step 1.3: Commit**

```bash
git add .claude/skills/references/mcp-tool-guide.md
git commit -m "docs(mcp): add MCP tool guide reference (servers, guard, kubectl carve-outs)"
```

---

## Operation 2: CLAUDE.md — add `MCP-Primär` column to the agent-routing table

**Files:**
- Modify: `CLAUDE.md:7-14` (the routing table)

### Requirement: Routing table names the preferred MCP server per agent

The CLAUDE.md agent-routing table SHALL carry a third column `MCP-Primär` so a dispatched subagent knows which MCP server to prefer.

#### Scenario: Orchestrator dispatches the DB agent

- **GIVEN** the orchestrator routes a `database`/`psql` request to `bachelorprojekt-db`
- **WHEN** it reads the routing table
- **THEN** the `MCP-Primär` column shows `mcp-postgres (localhost:13001)` for that row

- [ ] **Step 2.1: Replace the table header and rows**

Replace the block at `CLAUDE.md:7-14` (header through the `bachelorprojekt-security` row) with a 3-column version. The `Signals` and `Agent` cells stay byte-identical; only the new `MCP-Primär` column is added:

```markdown
| Signals | Agent | MCP-Primär |
|---------|-------|------------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080) |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` | `mcp-kubernetes` (localhost:18080) — nur Status-Checks |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, BATS, Playwright, `runner.sh`, test case, "test failing", "write a test" | `bachelorprojekt-test` | `mcp-postgres` (localhost:13001) — Ticket-Queries |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001) |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | `mcp-keycloak` (localhost:18081) |
```

- [ ] **Step 2.2: Add a one-line pointer to the guide under the table**

Immediately after the existing "Agent-Routing-Karten" blockquote (`CLAUDE.md:16`), append a new line:

```markdown
> **MCP-Schnellweg:** Welcher MCP-Server wann bevorzugt wird (statt `kubectl exec … psql`), steht in [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md) — inkl. Portforward-Guard und der kubectl-Pflicht für DDL/Superuser/Writes.
```

- [ ] **Step 2.3: Verify the table is well-formed (3 columns, 6 rows)**

Run: `grep -nA8 '^| Signals | Agent | MCP-Primär |' CLAUDE.md`
Expected: a header row, a separator row, and exactly 6 agent rows; `bachelorprojekt-website` shows `—`, the three MCP agents show their server+port.

- [ ] **Step 2.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): add MCP-Primär column to agent-routing table"
```

---

## Operation 3: dev-flow-execute/SKILL.md — MCP fast-path before every staged-plans query

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` — three `kubectl exec … psql` blocks at lines 24, 53, 155

### Requirement: dev-flow-execute prefers MCP for its read queries

dev-flow-execute SHALL instruct the implementer to use `mcp__mcp-postgres__query` for its staged-plans and progress SELECTs when the portforward is up, with the existing `kubectl exec` block kept as the labeled fallback.

#### Scenario: Single-mode staged-plans load

- **GIVEN** the implementer reaches the mode-detection step
- **WHEN** the MCP portforward is reachable
- **THEN** the skill directs it to run the staged-plans SELECT via `mcp__mcp-postgres__query` and only fall back to `kubectl exec … psql` if MCP is down

- [ ] **Step 3.1: Insert MCP directive before the mode-detection block (line 24)**

Find the fenced block beginning at line 22 (`# Wenn TICKET_ID bereits gesetzt ist …`). Immediately **before** that opening ```` ```bash ```` fence, insert this directive (keep the existing block intact below it, then add the fallback label):

```markdown
**DB-Abfragen — MCP-Schnellweg bevorzugen.** Ist `mcp-postgres` erreichbar (Guard:
`bash scripts/mcp-portforward.sh status`), nutze das `mcp__mcp-postgres__query`-Tool direkt
(nur `sql`, read-only):
> `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,'') FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`

Setze `STAGED_PLANS` aus dem MCP-Ergebnis. **Fallback** (MCP nicht erreichbar / kein Portforward) —
der kubectl-Block unten. Details: [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

_Fallback:_
```

(The line `_Fallback:_` ends the inserted markdown directly above the existing ```` ```bash ```` fence so the kubectl block reads as the fallback.)

- [ ] **Step 3.2: Insert MCP directive before the batch-load block (line 53)**

Before the ```` ```bash ```` fence opening the `BATCH_PLANS_JSON=…` block (line 51), insert:

```markdown
**MCP-Schnellweg (read-only SELECT).** Wenn `mcp-postgres` erreichbar, hole dieselbe Zeilen-Menge
via `mcp__mcp-postgres__query` (`sql:` = die SELECT-Anweisung aus dem Block unten, ohne das
`kubectl exec … -t -A -F '|'`-Gerüst) und parse das Ergebnis in `BATCH_ITEMS`. Der `kubectl`-Block
unten ist der **Fallback**.

_Fallback:_
```

- [ ] **Step 3.3: Insert MCP directive before the progress-tracking block (line 155)**

The block at lines 155-158 is inside a ```` ``` ```` (plain) fence used as a copy-paste progress hint. Before that fence, insert:

```markdown
**Fortschritt per MCP (read-only).** `mcp__mcp-postgres__query` mit
`sql:` `SELECT external_id, status, title FROM tickets.tickets WHERE external_id IN (<TICKET_IDs>) ORDER BY status;`
— sonst der kubectl-Befehl unten.

_Fallback:_
```

- [ ] **Step 3.4: Verify all three directives landed and fallbacks remain**

Run: `grep -nc 'mcp__mcp-postgres__query' .claude/skills/dev-flow-execute/SKILL.md && grep -nc 'kubectl exec -n workspace deploy/shared-db' .claude/skills/dev-flow-execute/SKILL.md`
Expected: `3` MCP references and the original `3` kubectl blocks both present (MCP added, nothing removed).

- [ ] **Step 3.5: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(dev-flow-execute): prefer mcp-postgres for staged-plans/progress reads"
```

---

## Operation 4: dev-flow-plan/SKILL.md — MCP fast-path for staged-plans + planning-count

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` — `psql` blocks at lines 281, 290, and the repeat at 398, 406

### Requirement: dev-flow-plan prefers MCP for its dashboard reads

dev-flow-plan SHALL prefer `mcp__mcp-postgres__query` for the staged-plans list and the planning-count SELECTs in step 6.5 (and its repeat), with kubectl as the fallback.

#### Scenario: Planning dashboard counts

- **GIVEN** the planner renders the Kommissionierung/Planungsbüro summary
- **WHEN** MCP is reachable
- **THEN** both the `plan_staged` list and the `COUNT(*) … status='planning'` run via `mcp__mcp-postgres__query`

- [ ] **Step 4.1: Insert MCP directive before the first staged-plans block (line ~280)**

Before the ```` ```bash ```` fence containing `STAGED_PLANS=…` (line 281), insert:

```markdown
**MCP-Schnellweg (read-only).** Wenn `mcp-postgres` erreichbar (`bash scripts/mcp-portforward.sh status`),
führe beide Reads via `mcp__mcp-postgres__query` aus:
> staged plans — `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,'') FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`
> planning-Count — `sql:` `SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';`

Belege `STAGED_PLANS` bzw. `PLANNING_COUNT` aus den MCP-Ergebnissen. **Fallback:** der kubectl-Block
unten. Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

_Fallback:_
```

- [ ] **Step 4.2: Insert the same directive before the repeated block (line ~397)**

Before the ```` ```bash ```` fence containing the second `STAGED_PLANS=…` (line 398), insert the **identical** directive from Step 4.1 (this is a deliberate repeat — the two dashboard renders are separate code paths; do not abbreviate to "same as above").

- [ ] **Step 4.3: Verify both directives landed**

Run: `grep -nc 'mcp__mcp-postgres__query' .claude/skills/dev-flow-plan/SKILL.md && grep -nc "status='planning'" .claude/skills/dev-flow-plan/SKILL.md`
Expected: at least `2` MCP references; the two `planning` count queries still present.

- [ ] **Step 4.4: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "docs(dev-flow-plan): prefer mcp-postgres for staged-plans/planning-count reads"
```

---

## Operation 5: feature-intake/SKILL.md — MCP fast-path for ticket-pool queries

**Files:**
- Modify: `.claude/skills/feature-intake/SKILL.md` — `psql` blocks at lines 51 (PLANNING_ROWS), 314 (EXISTING), 325 (SPEC_POOL), 799 (candidate dedup)

### Requirement: feature-intake prefers MCP for its pool/dedup reads

feature-intake SHALL prefer `mcp__mcp-postgres__query` for the planning-rows, existing-tickets, spec-pool, and candidate-dedup SELECTs, with kubectl as the fallback.

#### Scenario: Discovery interview dedup load

- **GIVEN** Modus B/C loads the existing-tickets and spec-pool lists
- **WHEN** MCP is reachable
- **THEN** the `EXISTING` and `SPEC_POOL` SELECTs run via `mcp__mcp-postgres__query`

- [ ] **Step 5.1: Insert MCP directive before the PLANNING_ROWS block (line 51)**

Before the ```` ```bash ```` fence at line 50 (`PLANNING_ROWS=…`), insert:

```markdown
**MCP-Schnellweg (read-only).** Wenn `mcp-postgres` erreichbar, lade die planning-Tickets via
`mcp__mcp-postgres__query`:
> `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''), array_to_string(areas,','), COALESCE(description,''), readiness::text, COALESCE(array_to_string(depends_on,','),'') FROM tickets.tickets WHERE status='planning' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`

Belege `PLANNING_ROWS` aus dem Ergebnis (leeres Ergebnis → Modus C entfällt, wie unten). **Fallback:**
der kubectl-Block. Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

_Fallback:_
```

- [ ] **Step 5.2: Insert MCP directive before the EXISTING + SPEC_POOL blocks (line 314)**

Before the ```` ```bash ```` fence at line 313 (`EXISTING=…`), insert a directive covering **both** the EXISTING block (313-318) and the SPEC_POOL block (324-334) that follow:

```markdown
**MCP-Schnellweg (read-only) — beide Reads.** Wenn `mcp-postgres` erreichbar, hole sie via
`mcp__mcp-postgres__query`:
> bestehende Tickets — `sql:` `SELECT external_id, title, status FROM tickets.tickets WHERE status NOT IN ('done','archived') ORDER BY created_at DESC LIMIT 60;`
> Spec-Pool — `sql:` `SELECT d.title, left(kc.text, 300), d.source_uri FROM knowledge.documents d JOIN knowledge.collections c ON c.id = d.collection_id JOIN knowledge.chunks kc ON kc.document_id = d.id AND kc.position = 0 WHERE c.source = 'specs_plans' AND d.source_uri LIKE 'file:openspec/changes/%/proposal.md' ORDER BY d.created_at DESC LIMIT 30;`

Belege `EXISTING` und `SPEC_POOL` aus den Ergebnissen. **Fallback:** die zwei kubectl-Blöcke unten.

_Fallback:_
```

- [ ] **Step 5.3: Insert MCP directive before the candidate-dedup block (line 799)**

The block at lines 799-801 is inside a blockquote-fenced ```` ```bash ```` snippet. Before its ```` ```bash ```` fence, insert (as a blockquote line, matching the surrounding `> ` prefix):

```markdown
> **MCP-Schnellweg (read-only):** `mcp__mcp-postgres__query` mit
> `sql:` `SELECT external_id, title, status FROM tickets.tickets WHERE status NOT IN ('done','archived') ORDER BY created_at DESC LIMIT 40;`
> — sonst der kubectl-Befehl unten (Fallback).
```

- [ ] **Step 5.4: Verify directives landed and the four kubectl blocks remain**

Run: `grep -nc 'mcp__mcp-postgres__query' .claude/skills/feature-intake/SKILL.md && grep -nc 'kubectl exec -n workspace deploy/shared-db' .claude/skills/feature-intake/SKILL.md`
Expected: at least `3` MCP references (the EXISTING+SPEC_POOL directive covers two queries in one block) and the original `4` kubectl blocks intact.

- [ ] **Step 5.5: Commit**

```bash
git add .claude/skills/feature-intake/SKILL.md
git commit -m "docs(feature-intake): prefer mcp-postgres for ticket-pool/spec-pool reads"
```

---

## Operation 6: ticket-ops + mishap-tracker + incident-response — MCP-first for the psql helper (reads only)

**Files:**
- Modify: `.claude/skills/ticket-ops/SKILL.md:32-36` (psql helper preamble)
- Modify: `.claude/skills/mishap-tracker/SKILL.md:77-82` (PSQL setup)
- Modify: `.claude/skills/incident-response/SKILL.md:24-28` (psql helper preamble)

### Requirement: psql-helper skills prefer MCP for reads, keep kubectl for writes

These three skills SHALL state that read SELECTs prefer `mcp__mcp-postgres__query` while the `psql()`/`$PSQL` bash helper remains the fallback for reads **and the mandatory path for writes** (INSERT/UPDATE/DELETE), because the MCP query tool is read-only.

#### Scenario: Incident ticket creation stays on kubectl

- **GIVEN** incident-response inserts a new incident row (`INSERT INTO tickets.tickets …`)
- **WHEN** the agent reads the DB-access note
- **THEN** it is told writes MUST use the `psql`/`kubectl exec` helper (MCP query is read-only), while read SELECTs prefer MCP

- [ ] **Step 6.1: ticket-ops — add MCP-first note above the helper (before line 32)**

Before the line `All SQL below assumes:` (line 32), insert:

```markdown
**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Ist `mcp-postgres` erreichbar
(`bash scripts/mcp-portforward.sh status`), führe **lesende** SELECTs über `mcp__mcp-postgres__query`
aus (nur `sql`, read-only). Die `psql()`-Bash-Hilfsfunktion unten ist (a) der **Fallback** für Reads
ohne aktiven Portforward und (b) der **Pflichtweg für schreibende** Statements (INSERT/UPDATE/DELETE) —
das MCP-Query-Tool ist read-only. Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

```

- [ ] **Step 6.2: mishap-tracker — add MCP-first note above the PSQL setup (before line 79)**

Before the ```` ```bash ```` fence at line 79 (`PGPOD=…` / `PSQL=…`), insert:

```markdown
**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Bei erreichbarem `mcp-postgres` lese SELECTs via
`mcp__mcp-postgres__query`. Das `$PSQL`-Konstrukt unten ist der Read-Fallback **und** der Pflichtweg
für schreibende Statements (INSERT/UPDATE) — das MCP-Query-Tool ist read-only.
Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

```

- [ ] **Step 6.3: incident-response — add MCP-first note above the SQL helper (before line 24)**

Before the line `SQL helper:` (line 24), insert:

```markdown
**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Bei erreichbarem `mcp-postgres` lese SELECTs via
`mcp__mcp-postgres__query`. Die `psql()`-Funktion unten ist der Read-Fallback; **schreibende**
Statements (z. B. das `INSERT INTO tickets.tickets` in Schritt 2) bleiben Pflicht über
`psql`/`kubectl exec`, da das MCP-Query-Tool read-only ist.
Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

```

- [ ] **Step 6.4: Verify all three notes landed and helpers/writes untouched**

Run: `for f in ticket-ops mishap-tracker incident-response; do echo "== $f =="; grep -c 'mcp__mcp-postgres__query' .claude/skills/$f/SKILL.md; grep -c 'psql -U website\|psql -U postgres\|INSERT INTO tickets' .claude/skills/$f/SKILL.md; done`
Expected: each file shows `1` MCP reference; the existing helper/INSERT lines are still present (counts unchanged from before the edit).

- [ ] **Step 6.5: Commit**

```bash
git add .claude/skills/ticket-ops/SKILL.md .claude/skills/mishap-tracker/SKILL.md .claude/skills/incident-response/SKILL.md
git commit -m "docs(skills): prefer mcp-postgres for reads in psql-helper skills (writes stay kubectl)"
```

---

## Operation 7: database-ops/SKILL.md — clarify MCP vs kubectl tool selection

**Files:**
- Modify: `.claude/skills/database-ops/SKILL.md` — insert a "Tool selection" section after the intro (after line 14), reinforcing the existing DDL warning at lines 57-60

### Requirement: database-ops states the MCP/kubectl boundary up front

database-ops SHALL open with an explicit tool-selection note: DML/SELECT as the `website` user prefers `mcp__mcp-postgres__query`; DDL as the `postgres` superuser on `bachelorprojekt`/`coaching`/`knowledge` is mandatory kubectl.

#### Scenario: Author picks the right tool for a migration

- **GIVEN** an engineer is about to run a schema migration
- **WHEN** they read the top of database-ops
- **THEN** they see that DDL-as-postgres MUST use `kubectl exec … psql -U postgres`, while read/DML as `website` can use MCP

- [ ] **Step 7.1: Insert the tool-selection section after the intro line (after line 14)**

After the line ending `…across both brands on the fleet cluster.` (line 14) and before the `---` at line 16, insert:

```markdown

## Tool-Auswahl: MCP vs kubectl

**DML/SELECT (als `website`-User):** Bei erreichbarem `mcp-postgres` (`bash scripts/mcp-portforward.sh status`)
bevorzuge `mcp__mcp-postgres__query` (`localhost:13001`, nur `sql`, read-only). Schreibende DML
(INSERT/UPDATE/DELETE) bleibt `task workspace:psql` / `kubectl exec` — das MCP-Query-Tool ist read-only.

**DDL als `postgres`-Superuser (Schemas `bachelorprojekt`, `coaching`, `knowledge`):** Pflicht
`kubectl exec` — MCP-Postgres verbindet als `website` ohne Superuser-Rechte (DDL → „must be owner"):

```bash
PGPOD=$(kubectl get pod -n workspace --context <env> -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace --context <env> -- psql -U postgres -d website < migration.sql
```

Details: [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).
```

- [ ] **Step 7.2: Verify the section landed and the existing DDL warning is intact**

Run: `grep -n 'Tool-Auswahl: MCP vs kubectl\|mcp__mcp-postgres__query\|must be owner' .claude/skills/database-ops/SKILL.md`
Expected: the new heading and MCP tool name appear near the top; the original "must be owner" DDL warning (line ~57) is still present further down.

- [ ] **Step 7.3: Commit**

```bash
git add .claude/skills/database-ops/SKILL.md
git commit -m "docs(database-ops): clarify MCP (DML/SELECT) vs kubectl (DDL-superuser) tool selection"
```

---

## Operation 8: Final verification gate

**Files:** none (validation only)

### Requirement: All edits pass the repo's CI-equivalent gates

The change SHALL pass the targeted test, freshness regeneration, and freshness check before PR. No test files changed, so `task test:inventory` is not required.

#### Scenario: Pre-PR gate is green

- **GIVEN** all eight documentation operations are committed
- **WHEN** the CI-equivalent commands run locally
- **THEN** `task test:changed`, `task freshness:regenerate`, and `task freshness:check` all succeed

- [ ] **Step 8.1: Sanity-check the cross-references and carve-outs across the whole change**

Run: `grep -rl 'mcp__mcp-postgres__query' .claude/skills/ CLAUDE.md && echo '--- guide linked from at least one skill ---' && grep -rl 'references/mcp-tool-guide.md' .claude/skills/*/SKILL.md CLAUDE.md`
Expected: the 8 edited files plus the guide appear in the first list; the guide is linked from CLAUDE.md and ≥1 skill (no orphan doc).

- [ ] **Step 8.2: Confirm no write/DDL path was accidentally routed to MCP**

Run: `grep -rn 'mcp__mcp-postgres__query' .claude/skills/ CLAUDE.md | grep -iE 'INSERT|UPDATE|DELETE|CREATE TABLE|ALTER|DROP'`
Expected: **no output** (MCP is only ever paired with SELECT/read directives; writes and DDL stay kubectl).

- [ ] **Step 8.3: Run the targeted test suite**

Run: `cd /tmp/wt-mcp-native-tools && task test:changed`
Expected: PASS (these are `.md`-only changes; quality/S1 gates do not apply to `.md`).

- [ ] **Step 8.4: Regenerate freshness artifacts**

Run: `cd /tmp/wt-mcp-native-tools && task freshness:regenerate`
Expected: completes; if any generated artifact (e.g. `docs/code-quality/repo-index.json`) changes, stage it in the final commit.

- [ ] **Step 8.5: Run the freshness check (CI equivalent)**

Run: `cd /tmp/wt-mcp-native-tools && task freshness:check`
Expected: PASS (freshness + `quality:check` S1–S4 ratchet + baseline assertion all green).

- [ ] **Step 8.6: Commit any regenerated artifacts**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(mcp): regenerate freshness artifacts after MCP doc edits"
```

---

## Self-review checklist (plan author)

- **Spec coverage:** proposal's 3 WAS items mapped → Op 2 (routing column), Ops 3–7 (skill directives), Op 1 (guard pattern standardized in the guide). All 8 "Betroffene Dateien" + the new reference covered.
- **kubectl carve-outs preserved:** DDL-as-postgres (Op 1 + Op 7), writes/INSERT (Op 6 + Op 8.2 guard), `kubectl apply`/`rollout`/sealed-secrets (Op 1) — none removed, all explicitly fenced.
- **No placeholders:** every directive ships the exact `sql:` text and the exact tool name; no "same as above" except the deliberate dev-flow-plan repeat (Op 4.2), which is called out as intentional.
- **Type/name consistency:** tool name `mcp__mcp-postgres__query` (param `sql`), `mcp__mcp-keycloak__executeKeycloakOperation` (`operation`,`params`), `mcp__mcp-kubernetes__*`, ports 13001/18080/18081 — identical across the guide, CLAUDE.md, and every skill edit.
- **Correctness fix vs brief:** the brief's suggested `connectionString:` argument is intentionally dropped — the real tool takes only `sql` and is read-only (verified against `.mcp.json` + the tool schema); this is reflected everywhere.
