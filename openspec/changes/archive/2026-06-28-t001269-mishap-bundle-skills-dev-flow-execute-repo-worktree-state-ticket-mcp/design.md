# Design Specifications for T001269 Mishap Bundle

This document details the changes required to address three issues:
1. Converting active plan states to `completed` in `dev-flow-execute` (Mishap 1).
2. Documenting precautions for `git reset --hard` to prevent losing local settings (Mishap 2).
3. Documenting best practices for MCP extensions and verifying dependency on T001272 (Mishap 3).

## Mishap 1: dev-flow-execute SKILL.md Plan Status Conversion
In `.claude/skills/dev-flow-execute/SKILL.md`, the command:
```bash
sed -i 's/^status: active$/status: completed/' "$PLAN_FILE"
```
fails to convert plans that have other active states, such as `plan_staged` or `in_progress`.
We will modify this pattern to be regex-based, converting all active plan states (`active`, `plan_staged`, `in_progress`) to `completed`.
The new pattern will be:
```bash
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
```

## Mishap 2: Local Setup Preservation against reset --hard
We will add a new sub-section under `### Lokale Entwicklung` in `CONTRIBUTING.md`:
```markdown
### Lokales Setup bewahren (Verlust durch git reset verhindern)

Lokale Konfigurationsdateien wie `.claude/settings.json` und `.opencode/opencode.jsonc` werden nicht im Git-Repository getrackt (bzw. sind gitignored). Bei einem unbedachten `git reset --hard` werden uncommitted oder ungestashte Änderungen (auch an diesen Configs) unwiderruflich gelöscht.
* **Best Practice:** Nutze vor einem `git reset --hard` immer `git stash push -u` (oder `git stash --include-untracked`), um deine lokalen Einstellungen und uncommitted Code zu sichern.
* **Selektives Zurücksetzen:** Nutze `git checkout origin/main -- <paths>` oder `git restore --source=origin/main <paths>` anstelle von `git reset --hard`, wenn du nur bestimmte Dateien auf den Stand von `origin/main` bringen möchtest, ohne das restliche Arbeitsverzeichnis zu beeinträchtigen.
```

## Mishap 3: MCP Extension Best Practices and Dependency
We will add a new sub-section under `### Für KI-Assistenten (Claude Code / Codex / Gemini)` (or as a separate section) in `CONTRIBUTING.md`:
```markdown
### MCP-Erweiterung & Tool-Registrierung

Wenn neue Werkzeuge (Tools) in `ticket-mcp` (Go-Code unter `scripts/ticket-mcp/go/`) hinzugefügt werden, müssen folgende Schritte durchgeführt werden, um sie in opencode und Claude Code verfügbar zu machen:
1. **Tool-Definition in Go:** Registriere das Tool in `scripts/ticket-mcp/go/internal/tools/`.
2. **Kompilieren:** Baue die Go-Binärdatei neu via `task ticket-mcp:build`. Dies aktualisiert `scripts/ticket-mcp/ticket-mcp-go`.
3. **Konfiguration verifizieren:** Stelle sicher, dass die geänderten Tools in `.opencode/opencode.jsonc` (für opencode) und `.mcp.json` (für Claude Code) geladen werden.
4. **Verifikation:** Teste die Verfügbarkeit der neuen Tools. MCP-Tools müssen vom Runtime-Prozess über stdio eingelesen werden können.
```
Additionally, during execution of T001269, we depend on T001272 having generated the correct schemas. We will verify the schema generation and that the binary compiles correctly with all registered workflow tools.
