---
title: "p2 — Sync Hermes MCP provisioning catalog with the registry"
ticket_id: T900479
domains: [mcp, repo-hygiene]
status: active
---

# p2 — Sync Hermes MCP provisioning catalog with the registry

Files: `scripts/hermes-mcp-servers.yaml`, `scripts/hermes-mcp-provision.sh`, `tests/spec/hermes-mcp-access.bats`, `docs/agent-guide/registry/expected/agy-mcp-config.json` (target_files dieses Partials; disjunkt zu p1, p3, p-tests).

## Task 2.1: Hermes-Katalog mit der Registry abgleichen

1. In `scripts/hermes-mcp-servers.yaml` den Eintrag `factory-mcp` (toter
   Server, Port 13003) entfernen.
2. Fehlende aktuelle Server aus `docs/agent-guide/registry/mcp.yaml`
   (Clients) ergänzen: `bge-mcp` (http, Port 13005), `context7` (npx wie im
   Registry-Eintrag), `warden` (node-Launcher wie im Registry-Eintrag).
   `playwright` bleibt draußen (in opencode disabled, Hermes spiegelt den
   aktiven Katalog). Bestehende Schlüssel-Schreibweisen (`ticket-mcp` statt
   `ticket-mcp-node`) behalten — hermes-lokal konsistent.
3. Je ergänztem Server die `tools.exclude`-Denylist nach Design-Regel D2/D4
   entscheiden (destruktive/mutierende Tools ausschließen): Quelle für Warden
   ist die ask-Liste in `.claude/settings.json` (`mcp__warden__*`, Präfix
   abgestreift); für bge-mcp und context7 die Tool-Annotations der Server
   prüfen und nur bei mutierenden Tools eine Denylist anlegen (Präzedenz
   mcp-postgres: keine Denylist bei serverseitig read-only).
4. `scripts/hermes-delegate.sh` NICHT anfassen (Tier-0-Delegation, außerhalb
   dieses Partials).
5. `scripts/hermes-mcp-provision.sh` nur anfassen, falls ein Test aus Task 2.2
   an der Katalogform scheitert (das Skript iteriert generisch über die
   YAML-Schlüssel). Falls berührt: Ist 37 · Limit 800 (.sh,
   nicht-baselined) → Budget 763.

## Task 2.2: Hermes-Testsuite nachziehen

1. In `tests/spec/hermes-mcp-access.bats` an allen drei Stellen (Setup-Zeile
   `_servers_expected`, Kommentar plus Schleifenliste in Szenario 1,
   Count-Assertion `count -eq 6`) die Servermenge aktualisieren:
   `factory-mcp` raus, `bge-mcp context7 warden` rein (Zielstand 8 Server).
2. In der `_denylist_map` (Szenario 2) die `factory-mcp`-Zeile streichen und
   für jeden Server mit Denylist aus Task 2.1 eine Zeile im gleichen Format
   ergänzen.
3. Den SSOT-Kopfkommentar korrigieren: Die Spec liegt nicht unter
   `openspec/specs/hermes-mcp-access.md` (nie gemergt), sondern im Archiv
   (`openspec/changes/archive/2026-07-15-hermes-agent-mcp-access/specs/hermes-mcp-access.md`).
4. Laufen lassen: `bats tests/spec/hermes-mcp-access.bats` ist grün.

## Task 2.3: Agy-Erwartungs-Fixture bereinigen

1. In `docs/agent-guide/registry/expected/agy-mcp-config.json` die Blöcke
   `factory-mcp` und `task-master-ai` entfernen (beide seit 2026-08-30 aus
   der Registry).
2. Die verbleibenden Einträge an die aktuellen `harness.agy`-Werte aus
   `docs/agent-guide/registry/mcp.yaml` angleichen (npx für
   codebase-memory-mcp und context7, Binary-Pfad für mcp-task-runner,
   node-Pfad für ticket-mcp, http-URLs für postgres/kubernetes/bge).
3. `bats tests/spec/toolset-registry/agy-expected-proxy.bats` ist grün.

## Verify (Partial)

```bash
bats tests/spec/hermes-mcp-access.bats tests/spec/toolset-registry/agy-expected-proxy.bats
task test:changed
task freshness:regenerate
task freshness:check
```
