# Proposal: agy-headless-mcp-permissions

## Why

agy verweigert im Headless-Betrieb (`agy -p '...'`) den Aufruf von MCP-Tools (z. B. `bge-mcp/bge_embed`), weil im Headless-Modus keine interaktive Berechtigungsanfrage an den Benutzer gestellt werden kann (`jetski: no output produced — a tool required the "mcp" permission that headless mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. mcp(<target>))`).

Manuelle Konfigurationsversuche in `~/.gemini/settings.json` oder `~/.gemini/config/config.json` führen laut Log (`cli_setting_manager.go`) zu `no shared config permissions`.

Um `agy` im Headless-Modus für autonome Subagenten und Scripting mit vollem MCP-Tool-Zugriff zu betreiben, sieht das `agy` CLI das Flag `--dangerously-skip-permissions` vor. Dieses schaltet alle Tool-Berechtigungsprüfungen im Print-Modus automatisch frei (`Print mode: --dangerously-skip-permissions set, auto-approving all tool permissions`).

## What

1. **Spec-Erweiterung in `openspec/specs/mcp-gateway.md`**:
   - Dokumentieren der Headless-Berechtigungssteuerung für `agy` via `--dangerously-skip-permissions`.
   - Festlegung, dass autonome non-interaktive Invocations von `agy` das `--dangerously-skip-permissions`-Flag nutzen müssen, um MCP-Tool-Aufrufe ohne interaktive Freigabe-Prompts auszuführen.

2. **Automatisierte Verifikation & Tests (`tests/spec/mcp-gateway/agy-mcp-permissions.bats`)**:
   - Ergänzung eines BATS-Tests, der verifiziert, dass `agy` im Headless-Modus mit `--dangerously-skip-permissions` Tool-Berechtigungsabfragen automatisch freigibt und MCP-Server-Interaktionen ermöglicht.

_Ticket: T002719_
