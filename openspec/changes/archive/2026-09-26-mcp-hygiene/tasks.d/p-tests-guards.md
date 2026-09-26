---
title: "p-tests — Absence and orphan guards for retired MCP sources"
ticket_id: T900479
domains: [mcp, repo-hygiene]
status: active
---

# p-tests — Absence and orphan guards for retired MCP sources

Files: `tests/spec/software-factory/decommission-guard.bats`, `tests/spec/mcp-tooling.bats` (target_files dieses Partials; disjunkt zu p1, p2, p3; läuft nach allen drei).

## Task T.1: RED — Guards schreiben, Scheitern nachweisen

1. In `tests/spec/software-factory/decommission-guard.bats` drei Tests
   ergänzen: „factory-mcp-node-Quellen sind abwesend"
   (`[ ! -e scripts/factory-mcp-node ]`), „Hermes-Katalog ohne
   factory-mcp-Schlüssel" (`yq '.factory-mcp'` auf
   `scripts/hermes-mcp-servers.yaml` meldet `null`), „Agy-Fixture ohne tote
   Server" (`jq` über die Schlüssel von
   `docs/agent-guide/registry/expected/agy-mcp-config.json` findet weder
   `factory-mcp` noch `task-master-ai`).
2. In `tests/spec/mcp-tooling.bats` den Orphan-Guard aus dem Delta
   implementieren: Jede scripts-seitige MCP-Serverquelle
   (`scripts/*-mcp*/server.mjs`, `scripts/llm-proxy/server.mjs`,
   `scripts/ticket-mcp/go`, `scripts/hermes-mcp-*`) löst sich auf in einen
   Registry-Client (`docs/agent-guide/registry/mcp.yaml`, inkl.
   Cluster-Server), einen Eintrag der User-Scope-Notiz (comfy-image-mcp,
   glimmer-worker-mcp, mailbox-mcp) oder ein Build-Artefakt mit Begründung
   im Test (ticket-mcp/go). Unaufgelöste Quelle → Test nennt sie und ist rot.
3. RED-Nachweis auf dem unausgeführten Baum — expected: FAIL:
   `bats tests/spec/software-factory/decommission-guard.bats
   tests/spec/mcp-tooling.bats` ist rot (factory-mcp-node existiert noch,
   Hermes-Katalog trägt factory-mcp, Fixture trägt tote Server).

## Task T.2: GREEN — Guards gegen alle Partials verifizieren

1. Nach p1+p2+p3: dieselben zwei BATS-Dateien sind grün.
2. G-AGENTIC13 autoritativ prüfen (kein Ad-hoc-Grep):
   `bash scripts/health-goals-check.sh` laufen lassen und die Zeile
   G-AGENTIC13 auf 0 tote Referenzen asserten (Positiv-Anker: Script-Exit 0
   plus mindestens eine weitere grüne Gate-Zeile im Output).
3. `node scripts/toolset/check.mjs` (Exit 0; nur gewollte
   unreviewed-Hinweise aus p3) und `task mcp:sync` (idempotent, kein Diff
   im Zweitlauf).

## Verify (Partial)

```bash
bats tests/spec/software-factory/decommission-guard.bats tests/spec/mcp-tooling.bats
task test:changed
task freshness:regenerate
task freshness:check
```
