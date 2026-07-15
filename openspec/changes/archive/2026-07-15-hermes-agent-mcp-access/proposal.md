## Why

Der lokale Hermes-Agent (`~/.hermes/`, Tier-0-Delegate über `scripts/hermes-delegate.sh`) läuft
aktuell komplett isoliert von den Bachelorprojekt-Projekt-MCP-Servern (`-t ""`, kein Werkzeug-
Zugriff). T001609 fordert eine bewusste Sandbox-/Toolset-Scope-Entscheidung statt der Alles-oder-
nichts-Lösung, damit Hermes für reine Lese-/Query-Aufgaben (Ticket-Status, Codebase-Suche,
Cluster-Read, Postgres-Read) genutzt werden kann, ohne dass ein kleineres, weniger zuverlässiges
Modell Schreib-/Mutations-Zugriff auf Produktionssysteme bekommt.

## What Changes

- Neue deklarative Server-Registry `scripts/hermes-mcp-servers.yaml` (SSOT, analog zu
  `.opencode/opencode.jsonc`), die für jeden Projekt-MCP-Server Transport (`url` oder
  `command`+`args`) und eine `tools.exclude`-Denylist für destruktive/mutierende Tools trägt.
- Neues Provisioning-Skript `scripts/hermes-mcp-provision.sh`, das die Registry idempotent in
  `~/.hermes/config.yaml` (`mcp_servers`-Key) schreibt — ohne den interaktiven
  `hermes mcp add`-Flow.
- Erweiterung von `scripts/hermes-delegate.sh` um ein Opt-in-Flag/Parameter, das provisionierte
  MCP-Server statt `-t ""` aktiviert. Default-Verhalten (kein Tool-Zugriff) bleibt unverändert.
- Dokumentations-Ergänzung in `.claude/skills/references/subagent-provisioning.md` (Tier-0-
  Absatz) und `docs/superpowers/references/gotchas-footguns.md` (Denylist-Pflege-Hinweis).
- BATS-Test, der die Registry gegen eine Denylist-Vollständigkeits-Prüfung validiert und das
  Provisioning-Skript im `--dry-run` gegen ein Fixture-`config.yaml` testet.

## Capabilities

### New Capabilities
- `hermes-mcp-access`: Deklarative, versionierte Anbindung des lokalen Hermes-Tier-0-Agenten an
  die Projekt-MCP-Server-Registry mit serverseitiger Denylist für destruktive/mutierende Tools.

### Modified Capabilities
(keine — `llm-local-dev` und `agent-skills` bleiben unverändert; Hermes ist kein Teil dieser
bestehenden Capabilities, siehe Recherche in der Design-Spec)

## Impact

- **Neue Dateien:** `scripts/hermes-mcp-servers.yaml`, `scripts/hermes-mcp-provision.sh`,
  `tests/spec/hermes-mcp-access.bats`.
- **Geänderte Dateien:** `scripts/hermes-delegate.sh`, `.claude/skills/references/
  subagent-provisioning.md`, `docs/superpowers/references/gotchas-footguns.md`.
- **Betroffene Systeme:** Nur der lokale Hermes-Agent (`~/.hermes/config.yaml`, außerhalb des
  Repo-Git-Trackings) und die bereits laufenden Projekt-MCP-Server (`mcp-postgres`,
  `mcp-kubernetes`, `factory-mcp`, `codebase-memory-mcp`, `ticket-mcp`, `mcp-task-runner`) —
  keine Änderung an deren Implementierung, nur an der Client-seitigen Denylist-Konfiguration.
- **Keine CI-/Deploy-Auswirkung:** Hermes läuft nur lokal auf dem Entwickler-Host, nicht im
  Cluster oder in GitHub Actions.
