---
ticket_id: T001211
plan_ref: openspec/changes/mcp-skill-integration/tasks.md
status: active
date: 2026-06-27
---

# MCP-Server ↔ Skills: Vollständiger Adapter + MCP-first

**Datum:** 2026-06-27
**Branch:** `feature/mcp-skill-integration`
**Status:** design

## Problem & Motivation

Die selbstgebauten MCP-Server und die Skills arbeiten heute **nicht** Hand in Hand. Zwei
unabhängige Erkundungen kamen zum selben Befund: Es ist keine Integrations-, sondern eine
**Reife-Lücke**.

- Nur **eine** Skill (`mishap-tracker`) ruft MCP-Tools tatsächlich auf. Die hochfrequenten
  Skills (`dev-flow-execute` mit 17 `ticket.sh`-Aufrufen, `dev-flow-plan` mit 7) dokumentieren
  einen „MCP-Schnellweg" nur als Kommentar, zeigen aber im ausführbaren Pfad **ausschließlich**
  den `ticket.sh`/`kubectl exec psql`-Fallback.
- Die Wurzel: Die `ticket-mcp`-Adapter-Fläche ist **unvollständig**. Verben, die Skills
  ständig brauchen (`phase`, `grill`, `stage-plan`, `create`, …), haben **kein** MCP-Tool —
  also *müssen* Skills auf `ticket.sh` zurückfallen.
- **Doppelpflege:** `ticket-mcp` existiert zweimal — Go (`scripts/ticket-mcp/go/`, von Claude
  Code genutzt) und Node (`scripts/ticket-mcp/server.js` + `tools/*.js`, von opencode genutzt).
  Beide sind **dünne Adapter, die zu `scripts/ticket.sh` shellen** (`internal/runner/run_ticket.go`
  bzw. `lib/run-ticket.js`) — keine reden direkt mit Postgres. Jedes neue Tool müsste heute
  zweimal gebaut und von Hand synchron gehalten werden (`planning.go` trägt schon
  `// Node-Kompatibilität`-Hedges).
- **Drift:** `factory-mcp` (Node, HTTP `:13003`, 6 Tools) ist **gar nicht** registriert.
  CLAUDE.md/AGENTS.md behaupten opencode-Servernamen (`mcp-k8s`, `mcp-factory`), die real nicht
  existieren (real: `mcp-kubernetes`, kein `mcp-factory`).

## Leitidee

> **Die MCP-Server sollen ein vollständiger 1:1-Adapter über genau die Skript-Verben sein, die
> Skills aufrufen.** Dann nutzen Skills das Tool statt des Skripts — mit dem Skript als Fallback.

Schichtung:

```
Skills (Markdown)
   │  MCP-first, Skript-Fallback dokumentiert
   ▼
MCP-Tools (dünne Adapter, Go)
   │  shell-out
   ▼
ticket.sh / factory-Skripte / Taskfile   ← Geschäftslogik-SSOT (unverändert)

mcp-tool-guide.md  = Mapping-SSOT (Server → Tools → Wann → Fallback)
tests/spec/mcp-tooling.bats = Guardrail gegen Re-Drift (CI, hart)
```

Da die Logik in Bash liegt, sind neue Tools **reine Adapter-Registrierungen** (~15 Zeilen Go),
keine neue Logik. Die Go-Konsolidierung ist jedoch **nicht** ganz aufwandsfrei: der Node-Adapter
exponiert heute zwei Tools (`get_mishap_buffer`, `flush_mishap_buffer`) und einen Mishap-`type`
(`process`), die das Go-Binary **noch nicht** hat — und das Exemplar `mishap-tracker` ruft alle
drei. Diese Parität muss in Go hergestellt werden, **bevor** der Node-Adapter gelöscht wird
(Plan-Vorbedingung in Slice 1, vom Plan-Autor aus dem Code verifiziert).

## Scope-Entscheidungen (mit dem User abgestimmt)

- **Voller Durchstich** in drei Slices → **drei getrennte PRs** in Reihenfolge.
- **Auf Go konsolidieren:** opencode zeigt künftig auch auf `ticket-mcp-go`; Node-Adapter
  entfernt; neue Tools nur 1× in Go.
- **Server im Scope:** `ticket-mcp` (primär), `factory-mcp` (registrieren + verdrahten),
  `mcp-task-runner` (nur Guide-Doku), `task-master-ai` (nur als „verfügbar/optional" im Guide
  dokumentieren — **keine** Skill-Logik).
- **factory-mcp** wird **als HTTP** registriert (kein stdio-Umbau) — niedrigste Friktion, da es
  bereits ein HTTP-Server ist und ohnehin eine laufende Website-Umgebung voraussetzt.
- **Guardrail** ist ein **harter** BATS-CI-Test (nicht nur advisory) — die Prüfung ist rein
  mechanisch.

## Slice 1 — `ticket-mcp`: Go-SSOT + vollständige Adapter-Fläche

### 1a. Go-Konsolidierung
- **Parität ZUERST (Vorbedingung):** Die Node-only-Tools `get_mishap_buffer` +
  `flush_mishap_buffer` und der Mishap-`type: process` nach Go portieren — sonst bricht
  `mishap-tracker` beim Node-Löschen. Erst danach darf der Node-Adapter weg.
- `.opencode/opencode.jsonc`: `ticket-mcp.command` von `["node", ".../server.js"]` auf das
  Go-Binary `["/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go"]` umstellen.
- Node-Adapter entfernen: `scripts/ticket-mcp/server.js`, `scripts/ticket-mcp/tools/`,
  `scripts/ticket-mcp/lib/`, `scripts/ticket-mcp/package.json`, `scripts/ticket-mcp/package-lock.json`,
  `scripts/ticket-mcp/node_modules/` (letzteres ist vermutlich gitignored — prüfen).
- `planning.go`: die `// Node-Kompatibilität`-Hinweise (Z. 118–120, 154) entfernen, sobald die
  Node-Parität nicht mehr Vorgabe ist. **Achtung:** Das Verhalten (priority/severity NICHT an
  `ticket.sh` durchreichen) darf sich nicht ändern, solange `ticket.sh` diese Flags bei
  `plan-meta` nicht akzeptiert — nur den irreführenden Kommentar bereinigen, nicht das Verhalten.
- `task ticket-mcp:build` muss weiterhin grün bauen; Build-Doku/Taskfile prüfen, ob auf den
  Node-Pfad verwiesen wird.

### 1b. Neue Tool-Wrapper (Adapter über bestehende `ticket.sh`-Verben)
Reihenfolge nach Skill-Nutzung. Jeder Wrapper folgt exakt dem Muster der bestehenden Go-Tools
(`s.AddTool(mcp.NewTool(...), handler)` → `runner.RunTicket("<verb>", args...)`).

| MCP-Tool (neu) | `ticket.sh`-Verb | Skill-Nutzung | Pflicht-Args |
|---|---|---|---|
| `record_phase_event` | `phase` | ×9 | id, phase, state; optional driver/detail |
| `record_grill_answers` | `grill` | ×6 | id, answers (qid=text …) |
| `stage_plan` | `stage-plan` | ×4 | id, branch, plan |
| `create_ticket` | `create` | ×4 | type, brand, title; optional priority/severity/description/status/areas |
| `enqueue_ticket` | `enqueue` | ×2 | id |
| `set_touched_files` | `set-touched-files` | ×1 | id, files |
| `get_attachments` | `get-attachments` | ×1 | id |
| `archive_plan` | `archive-plan` | ×1 | id |
| `add_pr_link` | `add-pr-link` | ×1 | id, pr |

Genaue Flag-Namen je Verb aus `scripts/ticket.sh` (Funktionen `cmd_*`) ableiten — der Plan-Autor
liest die `cmd_<verb>`-Signaturen, bevor er die Tool-Parameter definiert. `create_ticket` gibt
das `EXT_ID|UUID`-Format zurück, das die Skills heute parsen — unverändert durchreichen.

> **Hinweis `enqueue`:** `factory-mcp` hat bereits `factory_enqueue` (HTTP). Wir bauen den
> ticket-mcp-Wrapper trotzdem, damit die Ticket-Lifecycle-Tools kohärent an einem Server liegen;
> `factory_enqueue` bleibt für Factory-Queue-Kontext.

## Slice 2 — Skills MCP-first (Fallback bleibt)

Muster (Exemplar: `.claude/skills/mishap-tracker`): **MCP-Tool als primärer Pfad**, Skript/kubectl
als *darunter dokumentierter* Fallback. Markdown bleibt für den ausführenden Agenten lesbar.

Umzustellende Skills (nach Aufruf-Dichte):
- **`dev-flow-execute`** — `ticket.sh phase/stage-plan/get-attachments/archive-plan/add-comment`
  → `mcp__ticket-mcp__record_phase_event/stage_plan/get_attachments/archive_plan/add_comment`;
  Plan-Metadaten-Read (`kubectl exec … psql`) → `mcp__mcp-postgres__query` zuerst.
- **`dev-flow-plan`** — `ticket.sh create/stage-plan` → `mcp__ticket-mcp__create_ticket/stage_plan`.
- **`ticket-ops`** — DB-Reads → `mcp__mcp-postgres__query`; Lifecycle → `ticket-mcp`-Tools.
- **`incident-response`** — Cluster-Reads → `mcp__mcp-kubernetes__*`; DB-Reads →
  `mcp__mcp-postgres__query` (Writes/DDL bleiben kubectl, gemäß Guide).
- **`infra-ops`** — Status-Reads → `mcp__mcp-kubernetes__pods_list/…` zuerst.

**Regel beibehalten (aus mcp-tool-guide):** Writes/DDL/Superuser bleiben kubectl/psql — MCP-first
gilt nur für Reads und für die ticket-mcp-Lifecycle-Tools.

## Slice 3 — Hygiene, SSOT-Doku, Guardrail

- **factory-mcp registrieren** in `.mcp.json` **und** `.opencode/opencode.jsonc` als HTTP
  (`http://localhost:13003/mcp`, analog mcp-browser/postgres/github). In `ticket-ops` und
  `operations-management` verdrahten (factory_status/factory_queue/factory_trigger als
  primärer Pfad gegenüber Skript-Aufrufen).
- **Drift fixen** in CLAUDE.md + AGENTS.md: opencode-Servernamen korrigieren (`mcp-kubernetes`
  statt `mcp-k8s`; `mcp-factory` streichen oder durch real registrierten Namen ersetzen).
- **`mcp-tool-guide.md` → Mapping-SSOT** umschreiben: pro Server eine Sektion (Tools, Wann
  bevorzugen, Fallback). `task-master-ai` als „verfügbar/optional (PRD/Komplexität)" listen;
  `mcp-task-runner` als Task-Ausführung. Der Portforward-Guard und die kubectl-Pflicht für
  DDL/Writes bleiben erhalten.
- **Guardrail** `tests/spec/mcp-tooling.bats` (neu): prüft mechanisch
  1. jeder im Go-Quellcode exponierte `mcp.NewTool("…")`-Name ist in `mcp-tool-guide.md` gelistet
     (Guide-Vollständigkeit), und
  2. ein definiertes Set skill-kritischer `ticket.sh`-Verben (phase, grill, stage-plan, create,
     enqueue, set-touched-files, get-attachments, archive-plan, add-pr-link, get, add-comment)
     hat je einen MCP-Wrapper (Adapter-Vollständigkeit).
  Test ist **hart** (CI-Fail). Nach Test-Hinzufügung: `task test:inventory` + Inventar committen.

## Tests & Verifikation

- **Go:** Smoke/Unit für die neuen Wrapper — Tool registriert sich, Handler ruft `runner.RunTicket`
  mit korrektem Verb/Args (ggf. `ticket.sh` über `TICKET_SH`-Env auf ein Stub-Skript zeigen,
  analog bestehender Tests, falls vorhanden — sonst minimaler Registrierungs-Smoke).
- **BATS-Guardrail** wie oben.
- **Finaler Verifikations-Task (CI-Äquivalent):** `task test:changed`, `task freshness:regenerate`,
  `task freshness:check`; nach Test-Änderungen zusätzlich `task test:inventory` + Commit;
  `task test:openspec` (bzw. `bash scripts/openspec.sh validate`) muss grün sein.

## Nicht-Ziele (YAGNI)

- Kein DB-direkter Umbau der MCP-Server (shell-out bleibt — bewusst).
- Keine Codegen-Pipeline „Skill aus Tool-Manifest" (über-engineered).
- Keine Skill-Logik an `task-master-ai` (nur Guide-Eintrag).
- `mcp-browser` (Playwright-Wrapper) bleibt unangetastet.
- Keine Änderung an Writes/DDL-Pfaden (bleiben kubectl/psql).

## Risiken & Mitigationen

- **opencode bricht, wenn das Go-Binary fehlt:** `ticket-mcp:build` muss vor dem opencode-Switch
  laufen; Doku ergänzen. Mitigation: Build-Step im Slice-1-Plan vor der opencode-Umstellung.
- **Verhaltensdrift bei `plan-meta` priority/severity:** beim Entfernen der Node-Hedges das
  bestehende Verhalten exakt erhalten (nicht an `ticket.sh` durchreichen, solange das Verb es
  nicht akzeptiert).
- **factory-mcp HTTP nicht erreichbar** (Daemon nicht gestartet): Skills behalten Skript-Fallback;
  Guide dokumentiert die Voraussetzung.

## Betroffene Dateien (Orientierung, nicht abschließend)

- `scripts/ticket-mcp/go/internal/tools/*.go` (neue Wrapper)
- `scripts/ticket-mcp/server.js`, `tools/`, `lib/`, `package*.json` (entfernen)
- `.opencode/opencode.jsonc`, `.mcp.json` (Registrierung)
- `.claude/skills/{dev-flow-execute,dev-flow-plan,ticket-ops,incident-response,infra-ops}/SKILL.md`
- `.claude/skills/references/mcp-tool-guide.md`
- `CLAUDE.md`, `AGENTS.md`
- `tests/spec/mcp-tooling.bats` (neu), `website/src/data/test-inventory.json` (regen)
