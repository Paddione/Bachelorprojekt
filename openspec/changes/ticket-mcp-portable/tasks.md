---
title: "ticket-mcp-portable — Implementation Plan"
ticket_id: T002301
domains: [agent-config, dev-tooling]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-mcp-portable — Implementation Plan

_Ticket: T002301_

K2 des Epics T002299, neu geschnitten (Herleitung in `proposal.md`). `ticket-mcp` wird nach dem
Muster von `mcp-task-runner` portabel gemacht; MCPB entfällt.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/ticket-mcp/go/Makefile` | `install`-Ziel ergänzen |
| `Taskfile.yml` | `ticket-mcp:build` installiert nach `/usr/local/bin` (Best-effort, wie `mcp-task-runner` in Zeile 728–745) |
| `docs/agent-guide/registry/mcp.yaml` | `command` von absolutem Pfad auf PATH-Namen `ticket-mcp-go`; veralteten Kommentar über das MCPB-Bundle ersetzen |
| `.mcp.json` | via `task mcp:sync` regeneriert |
| `.opencode/opencode.jsonc` | via `task mcp:sync` regeneriert |
| `Taskfile.agents.yml` | absoluten Pfad im `check`-Aufruf durch PATH-Namen ersetzen |
| `scripts/hermes-mcp-servers.yaml` | absoluten Pfad durch PATH-Namen ersetzen |
| `tests/spec/mcp-gateway.bats` | Test: kein `/home/`-Literal in der Registry |

## Task 1 — Failing-Test-Step (RED)

Der Test gegen den unkorrigierten Stand — er muss fehlschlagen, weil die Registry heute
`/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go` führt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# expected: FAIL (rot — die Registry enthaelt noch einen absoluten Home-Pfad)
```

## Task 2 — Install-Pfad herstellen

`install`-Ziel im Makefile, `ticket-mcp:build` um den Install-Schritt erweitern. Das Verhalten
spiegelt `mcp-task-runner`: direkter `install`, dann `sudo -n install`, sonst Hinweis und
Weiterverwendung des vorhandenen Binaries — **kein** Abbruch.

**Akzeptanz:** `task ticket-mcp:build` endet mit Exit 0 und `command -v ticket-mcp-go` findet das
Binary.

## Task 3 — Registry und Referenzen umstellen

Registry auf den PATH-Namen, danach `task mcp:sync`. Die beiden handgepflegten Referenzen
(`Taskfile.agents.yml`, `scripts/hermes-mcp-servers.yaml`) mitziehen.

**Akzeptanz:** `grep -c '/home/' docs/agent-guide/registry/mcp.yaml` liefert `0`;
`task mcp:check` meldet keine Drift.

## Task 4 — Verifikation (final)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil diese Prüfungen nicht alle in `test:changed` liegen:

```bash
task test:spec:changed
task mcp:check
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
bash scripts/openspec.sh validate
```

**Akzeptanz:**

- `grep -rc '/home/patrick' docs/agent-guide/registry/mcp.yaml` liefert `0`.
- `task mcp:check` endet mit Exit 0 (keine Drift zwischen Registry und den drei Configs).
- `ticket-mcp` startet weiterhin — `command -v ticket-mcp-go` liefert einen Pfad.
- `task freshness:check` endet mit Exit 0.
