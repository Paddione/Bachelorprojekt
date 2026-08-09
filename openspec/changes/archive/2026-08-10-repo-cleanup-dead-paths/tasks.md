---
title: "repo-cleanup-dead-paths — tote Dateien und tote Pfad-Referenzen entfernen (Vorgang A von 3)"
ticket_id: T002688
domains: [agentic-tooling, testing, plan-authoring]
status: plan_staged
file_locks: [.dockerignore, scripts/factory/service-registry.sh, Taskfile.yml, docs/agent-guide/registry/mcp.yaml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-cleanup-dead-paths — Implementation Plan

Vorgang A von drei getrennten Aufräum-Tickets. Entfernt Dateien, die auf nichts zeigen, und
Konfiguration, die auf nicht existierende Dateien zeigt — und zieht für die drei gefundenen
Driftquellen einen Test ein, damit der Befund nicht in sieben Wochen erneut anfällt.

_Ticket: T002688_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/service-registry.sh` | 135 | 665 (S1 `.sh` 800, keine Baseline) — schrumpft |
| `.dockerignore` | 37 | — (kein S1-Gate) |
| `CLAUDE.md` | 239 | — (kein S1-Gate) |
| `Taskfile.yml` | 5169 | — (kein S1-Gate) — schrumpft |
| `docs/agent-guide/registry/mcp.yaml` | 364 | — (kein S1-Gate) — schrumpft |
| `tests/spec/repo-hygiene/dead-path-references.bats` | neu | — (kein S1-Gate) |

Gelöscht werden: `NANOS_RESPONSE`, `OPPO`, `.antigravitycli/`, `.astro/`, `mcp-browser/`,
`tasks/`, `.taskmaster/`, `Taskfile.taskmaster.yml`.

Regeneriert durch `task mcp:sync`: `.mcp.json`, `.opencode/opencode.jsonc`. Regeneriert durch
`task freshness:regenerate`: `website/src/data/test-inventory.json`,
`website/src/data/openspec-status.json`, `docs/code-quality/repo-index.json`.

## Partials

| ID | Datei | Rolle | Zieldateien |
| --- | --- | --- | --- |
| p1 | tasks.d/p1-deletions.md | impl | NANOS_RESPONSE, OPPO, .antigravitycli, .astro, mcp-browser, tasks, .taskmaster, Taskfile.taskmaster.yml, Taskfile.yml, docs/agent-guide/registry/mcp.yaml, .mcp.json, .opencode/opencode.jsonc |
| p2 | tasks.d/p2-dead-references.md | impl | .dockerignore, scripts/factory/service-registry.sh, CLAUDE.md |
| p3 | tasks.d/p3-guard-tests.md | tests | tests/spec/repo-hygiene/dead-path-references.bats, website/src/data/test-inventory.json |

Die Reihenfolge ist rot→grün: p3 schreibt den Guard, der auf dem aktuellen Stand **fehlschlägt**,
weil die toten Pfade noch da sind. p1 und p2 räumen sie ab und färben ihn grün.

## Entscheidungen (Brainstorming, Patrick, 2026-08-08)

1. **Zerlegung in drei Tickets** statt eines Umbaus. Begründung ist Verifizierbarkeit, nicht
   Größe: A lässt sich vollständig beweisen, C (Verzeichnis-Verschiebungen) hat eine
   Fehlerklasse, die erst beim Flux-Reconcile auf dem Prod-Cluster sichtbar wird.
2. **Task Master vollständig entfernen**, nachdem alle sechs Einträge als erledigt nachgewiesen
   waren. Ein Aufgabensystem statt zwei.
3. **Guard statt reiner Bereinigung** (Ansatz 1 von drei). Drei gezielte Prüfungen gegen die drei
   real gefundenen Driftquellen — kein generischer Registry-Linter, der an Globs und
   Negativ-Einträgen Fehlalarme produziert und dann abgeschaltet statt repariert wird.
4. **Zweifelsfälle bleiben:** `studio-server/`, `rustdesk-installer/`, `openclaw/`,
   `claude-code/`, `apps/whiteboard/`.

## Erkenntnis für Vorgang C

`apps/` ist bereits durch die App-Registry belegt — fünf Skripte lesen `apps/${appName}/app.yaml`
über eine Variable, weshalb eine Volltextsuche nach dem Verzeichnisnamen diese Referenzen nicht
findet. Der Zielname für die Service-Verzeichnisse in C muss ein anderer sein.

## Final Verification

- [ ] **Alle Gates grün.** Nach p1, p2 und p3.

```bash
# Der Guard aus p3 ist jetzt grün, weil p1 und p2 die toten Pfade entfernt haben
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/dead-path-references.bats

# Kustomize-Referenzen ungebrochen
task workspace:validate

# MCP-Registry und die drei Harness-Configs im Gleichstand nach dem Task-Master-Ausbau
task mcp:check

# Die drei verpflichtenden CI-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **`task taskmaster:list` existiert nicht mehr.** Positiv-Anker zuerst, damit die
      Negativ-Aussage nicht über einer leeren Liste vakuos besteht.

```bash
task --list-all > /tmp/tasklist.txt
# Positiv-Anker: die Liste ist überhaupt gefüllt
[ "$(grep -c '^\* ' /tmp/tasklist.txt)" -gt 50 ] || { echo "FATAL: Task-Liste leer oder unlesbar"; exit 1; }
# Negativ-Aussage: kein taskmaster-Task mehr
[ "$(grep -c 'taskmaster:' /tmp/tasklist.txt)" -eq 0 ] || { echo "FATAL: taskmaster-Tasks noch vorhanden"; exit 1; }
```

- [ ] **Manueller Schritt außerhalb des PR.** `task mcp:sync` schreibt zusätzlich
      `~/.gemini/config/mcp_config.json` im Home-Verzeichnis. Diese Datei liegt außerhalb des
      Repos und kann nicht Teil des Commits sein — nach dem Merge einmal lokal ausführen.
