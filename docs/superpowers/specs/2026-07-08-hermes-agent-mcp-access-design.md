---
title: Hermes-Agent-Anbindung an Projekt-MCP-Server
ticket_id: T001609
plan_ref: openspec/changes/hermes-agent-mcp-access/tasks.md
status: draft
---

# Hermes-Agent-Anbindung an Projekt-MCP-Server — Design

## Kontext (WARUM)

Der lokale Hermes-Agent (`~/.hermes/`, Modell `google/gemma-4-12b-qat` via LM Studio, angebunden
über `scripts/hermes-delegate.sh`) läuft aktuell komplett isoliert von den Bachelorprojekt-
Projekt-MCP-Servern. `hermes-delegate.sh` ruft `hermes -z "<prompt>" -t ""` auf — explizit ohne
Werkzeuge. T001609 fordert eine bewusste Sandbox-/Toolset-Scope-Entscheidung statt der aktuellen
Alles-oder-nichts-Lösung (kein Zugriff).

Recherche-Ergebnis (Schritt A.1):
- `hermes mcp add/remove/list/test/configure` verwaltet Server in `~/.hermes/config.yaml` unter
  dem Key `mcp_servers`. Schema pro Server: `{url | command+args+env, enabled, tools: {include:
  [...]} | {exclude: [...]}}` (`hermes_cli/mcp_config.py:78-104`, `:465-497`, `:849-903`).
- `hermes mcp add` ist ein **interaktiver, discovery-first** Flow (verbindet, listet Tools,
  fragt Enable-all/Select/Cancel) — für reproduzierbares, versioniertes Provisioning ungeeignet.
  Die **Config-Datei direkt schreiben** (analog zu `.opencode/opencode.jsonc`, das bereits als
  statische, versionierte MCP-Registrierung für opencode dient) ist der robustere Weg.
- Referenz-Katalog der Projekt-MCP-Server + Transport: `.opencode/opencode.jsonc` (bereits
  SSOT für opencode-Zugriff):
  - Remote/HTTP (via kubectl portforward, siehe `mcp-tool-guide.md` Portforward-Guard):
    `factory-mcp` (`:13003/mcp`), `mcp-kubernetes` (`:18080/mcp`), `mcp-postgres` (`:13001/mcp`)
  - Stdio (lokale Prozesse): `codebase-memory-mcp`, `mcp-task-runner`, `ticket-mcp`
- `mcp-postgres` exponiert **ein** Tool (`query`) und ist **serverseitig read-only erzwungen**
  (`.claude/skills/references/mcp-tool-guide.md:15`: „ist READ-ONLY und nimmt NUR `sql`"). Kein
  Denylist-Bedarf — sicher in voller Breite anbindbar.
- Die übrigen Server exponieren gemischte Read/Write-Toolsets; hier greift die Nutzerentscheidung
  aus dem Brainstorming.

## Entscheidung (aus Brainstorming mit dem User)

Zwei Runden Rückfrage (AskUserQuestion) haben den Scope präzisiert:
1. Erste Frage (read-only-Subset vs. kein MCP-Zugriff vs. volles Set wie `haiku`) →
   User wählt **volles MCP-Set wie haiku**.
2. Gegenfrage mit konkretem Risiko-Beispiel (Hermes' schwächeres, weniger zuverlässiges
   Tool-Calling + volles `mcp-kubernetes`-Schreibrecht `pods_delete`/`resources_delete`/
   `resources_scale`/`resources_create_or_update` + `ticket-mcp`-Mutationen ohne
   Urteilsvermögen) → User bestätigt: **Vollzugriff auf alle Server, aber pro Server eine
   Denylist für destruktive/mutierende Tools** (`tools.exclude` in `config.yaml`).

**Ergebnis:** Hermes bekommt denselben Server-Katalog wie opencode/haiku, aber mit einer
harten `tools.exclude`-Liste pro Server für alles, was Cluster-State, Ticket-DB-State oder
Shell/Task-Execution mutiert. `mcp-postgres` bleibt ohne Denylist (bereits read-only erzwungen).

### Denylist pro Server (destruktive/mutierende Tools, aus dem projekt-globalen MCP-Katalog)

| Server | Transport | `tools.exclude` |
|---|---|---|
| `mcp-postgres` | remote `:13001/mcp` | *(keiner — serverseitig read-only)* |
| `mcp-kubernetes` | remote `:18080/mcp` | `pods_delete`, `pods_exec`, `pods_run`, `resources_delete`, `resources_create_or_update`, `resources_scale` |
| `codebase-memory-mcp` | stdio | `delete_project`, `index_repository`, `ingest_traces`, `manage_adr` |
| `ticket-mcp` | stdio | `create_ticket`, `enqueue_ticket`, `transition_status`, `triage_ticket`, `update_fields`, `set_readiness_flag`, `set_touched_files`, `set_plan_meta`, `stage_plan`, `archive_plan`, `link_tickets`, `record_grill_answers`, `record_phase_event`, `report_mishap`, `flush_mishap_buffer`, `add_comment`, `add_pr_link`, `backfill_ticket_id` |
| `factory-mcp` | remote `:13003/mcp` | `factory_enqueue`, `factory_trigger` |
| `mcp-task-runner` | stdio | `execute_plan`, `run_task`, `run_task_async`, `cancel_task` |

Übrig bleiben ausschließlich Read/Query/Status-Tools (z.B. `mcp-kubernetes` `pods_get`,
`pods_list`, `pods_log`, `resources_get`, `resources_list`, `events_list`; `ticket-mcp`
`get_ticket`, `list_tickets`, `get_ticket_links`, `export_tickets`, `get_attachments`,
`get_mishap_buffer`; `factory-mcp` `factory_ask/queue/recent/status`, `openspec_find_similar`;
`codebase-memory-mcp` `search_graph/search_code/trace_path/get_code_snippet/get_architecture/
query_graph/get_graph_schema/index_status/list_projects`; `mcp-task-runner`
`get_task_graph/get_task_result/plan_tasks`).

## Umfang (WAS)

1. Neues Provisioning-Skript `scripts/hermes-mcp-provision.sh`, das die o.g. Server-Liste
   (Transport + `tools.exclude`) deklarativ in `~/.hermes/config.yaml` unter `mcp_servers`
   schreibt (idempotent: bestehende Einträge werden überschrieben, kein `hermes mcp add`-
   Interaktions-Flow). Quelle der Server-Definitionen: eine neue, versionierte
   `scripts/hermes-mcp-servers.yaml` (SSOT, analog zu `.opencode/opencode.jsonc`), damit
   Server-Katalog-Änderungen nicht im Bash-Skript verstreut werden.
2. `scripts/hermes-delegate.sh` erweitern: neuer optionaler dritter Parameter/Flag
   `--with-project-mcp`, der statt `-t ""` die projisionierten MCP-Server aktiviert
   (`hermes -z "<prompt>" --mcp-servers <liste>` bzw. äquivalenter Hermes-CLI-Mechanismus —
   im Plan zu verifizieren, ob `hermes` CLI ein Flag zur Server-Auswahl pro Aufruf hat oder
   ob `enabled: true/false` in `config.yaml` die einzige Steuerung ist). Default bleibt
   **unverändert** `-t ""` (kein Tool-Zugriff) — reines Opt-in, kein Verhaltenswechsel für
   bestehende Aufrufer.
3. Dokumentation: `.claude/skills/references/subagent-provisioning.md` Tier-0-Absatz um den
   MCP-Opt-in-Hinweis + Denylist-Verweis ergänzen; `docs/superpowers/references/gotchas-
   footguns.md` um einen Eintrag "Hermes MCP-Denylist ist die einzige Sicherheitsgrenze —
   bei neuen destruktiven Tools in einem der Server MUSS die Denylist nachgezogen werden".
4. Test: BATS-Test, der `scripts/hermes-mcp-servers.yaml` gegen die Denylist-Tabelle oben
   validiert (kein destruktives Tool fehlt in `exclude`) und `scripts/hermes-mcp-provision.sh
   --dry-run` gegen ein Fixture-`config.yaml` prüft (korrekte `tools.exclude`-Merges, keine
   Fremd-Server werden überschrieben).

## Nicht-Ziele

- Kein automatischer Aufruf von `hermes-mcp-provision.sh` aus bestehenden dev-flow-Skills —
  bleibt ein manuell/durch Setup-Task angestoßener Schritt (analog zu `hermes setup`).
- Kein OAuth-Flow für die Remote-MCP-Server (die laufen lokal über kubectl-Portforward ohne
  Auth, siehe `mcp-tool-guide.md` Portforward-Guard).
- Kein Rollout auf andere Hermes-Profile außer dem bereits vorhandenen `bachelorprojekt`-Profil.

## Risiken

- **Denylist-Drift:** Neue Tools in einem der Server (z.B. `mcp-kubernetes` bekommt ein neues
  destruktives Tool) werden nicht automatisch in die Denylist aufgenommen — Doku-Hinweis (Punkt 3)
  mildert, löst aber nicht strukturell. Akzeptiert laut User-Entscheidung.
- **Hermes' Tool-Calling-Zuverlässigkeit:** Auch mit Denylist kann das kleinere Modell Read-Tools
  falsch/exzessiv aufrufen (Kosten: lokal, keine API-Tokens — geringes Risiko) oder Ergebnisse
  fehlinterpretieren — bleibt laut Tier-0-Definition ungeprüfte Weiterverwendung tabu.
