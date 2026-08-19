---
title: "dsh-harness-integration — Implementation Plan"
ticket_id: T012962
domains: [agents, factory, tooling]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dsh-harness-integration — Implementation Plan

_Ticket: T012962_

Der DeepSeek Harness (`dsh` 0.1.0-rc.7) wird dritter Harness neben Claude Code und opencode.
Der Durchstich deckt Loop-Guards, Factory-Executor und Audit-Log ab und endet an einer
laufenden Web-Oberfläche, in der ein Guard einen Werkzeugaufruf sichtbar ablehnt.

Entwurf und Begründung: `openspec/changes/dsh-harness-integration/design.md`.

## File Structure

```
tools/dsh/package.json                                   NEU   Bundle-Manifest (dsh.bundle.patch)
tools/dsh/cordis.patch.yml                               NEU   Patch-Layer, konfiguriert die CC-Hook-Bridge
tools/dsh/index.js                                       NEU   Bundle-Entry, mountet vorhandene plugins/*.mjs
tools/dsh/README.md                                      NEU   Version, Start, Grenzen der Bridge
tools/dsh/plugins/repo-guard.mjs                         NEU   natives Guard-Plugin auf tools/pre-execute
tools/dsh/plugins/audit-log.mjs                          NEU   Sitzungs-Ereignisse in die Phase-Event-Zeitachse
scripts/dsh/session-audit.sh                             NEU   schmaler Schreibpfad nach scripts/ticket.sh phase
scripts/dsh/web-up.sh                                    NEU   startet die Web-UI, registriert sie im Session-Hub
scripts/factory/dsh-exec.sh                              NEU   Factory-Executor nach Muster opencode-exec.sh
scripts/factory/dispatcher-bridge.sh                     MOD   dritter Executor-Zweig (Budget 609 Zeilen)
scripts/agent-guide/validate.mjs                         MOD   harness-Enum um dsh/all erweitern (Budget 630)
docs/agent-guide/registry/tools.yaml                     MOD   harness-Werte der dsh-erreichbaren Einträge
docs/agent-guide/maps/tools-map.md                       MOD   regeneriert (kein Handeintrag)
taskfiles/Taskfile.dsh.yml                               NEU   dsh:build, dsh:web, dsh:doctor
Taskfile.yml                                             MOD   includes-Eintrag für Taskfile.dsh.yml
tests/spec/dsh-harness-integration/bundle.bats           NEU   Bundle-Manifest, Entry-Autoload, kein Vendoring
tests/spec/dsh-harness-integration/hook-bridge.bats      NEU   PreToolUse-Hooks sind Kommando-Hooks
tests/spec/dsh-harness-integration/executor.bats         NEU   Executor-Zweig, Exit-Codes, kein Fallback
tests/spec/harness-workflow-split/harness-enum.bats      NEU   Enum akzeptiert dsh/all, both bleibt unberührt
components/website/src/data/test-inventory.json          MOD   regeneriert via task test:inventory
```

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-harness-enum.md` | impl | `scripts/agent-guide/validate.mjs`, `docs/agent-guide/registry/tools.yaml`, `docs/agent-guide/maps/tools-map.md` | |
| p2 | `tasks.d/p2-bundle-bridge.md` | impl | `tools/dsh/package.json`, `tools/dsh/cordis.patch.yml`, `tools/dsh/index.js`, `tools/dsh/README.md` | |
| p3 | `tasks.d/p3-repo-guard.md` | impl | `tools/dsh/plugins/repo-guard.mjs` | p2 |
| p4 | `tasks.d/p4-audit-log.md` | impl | `tools/dsh/plugins/audit-log.mjs`, `scripts/dsh/session-audit.sh` | p2 |
| p5 | `tasks.d/p5-factory-executor.md` | impl | `scripts/factory/dsh-exec.sh`, `scripts/factory/dispatcher-bridge.sh` | p2 |
| p6 | `tasks.d/p6-web-demo.md` | impl | `scripts/dsh/web-up.sh`, `taskfiles/Taskfile.dsh.yml`, `Taskfile.yml` | p2, p3, p4 |
| p7 | `tasks.d/p7-tests.md` | tests | `tests/spec/dsh-harness-integration/bundle.bats`, `tests/spec/dsh-harness-integration/hook-bridge.bats`, `tests/spec/dsh-harness-integration/executor.bats`, `tests/spec/harness-workflow-split/harness-enum.bats`, `components/website/src/data/test-inventory.json` | p1, p2, p3, p4, p5, p6 |

Das Tests-Partial wird zuletzt geschrieben, läuft aber RED zuerst: seine BATS-Fälle melden
`expected: FAIL` gegen den Scaffold-Branch, bevor die Implementierungs-Partials sie grün machen.

## Vorbedingung für jeden Lauf

Der Harness-Klon ist gitignoriert und in einem frischen Checkout ungebaut. Vor p2 einmal:

```bash
cd deepseek-harness && pnpm install && pnpm run build && pnpm dsh --version
# erwartet: 0.1.0-rc.7 (oder neuer — die Version wird notiert, nicht erzwungen)
```

## Nachweis am laufenden Produkt

Nach p6 wird die Web-Oberfläche gestartet und der Guard-Pfad vorgeführt: In einer Sitzung, deren
Arbeitsverzeichnis ein Worktree ist, wird ein Schreibzugriff auf einen Pfad außerhalb angefordert.
Erwartet wird eine Ablehnung mit lesbarer Begründung in der Oberfläche — einmal über die
CC-Hook-Bridge (p2) und einmal über das native Plugin (p3), damit beide Wege gegeneinander
belegt sind.

## Final Verification

- [ ] Alle Partials abgeschlossen, `plan-lint` grün, Web-Oberfläche vorgeführt.
- [ ] Die drei Pflicht-Gates laufen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
