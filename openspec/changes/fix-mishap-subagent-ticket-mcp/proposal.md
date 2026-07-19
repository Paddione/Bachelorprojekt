## Why

Zwei Mishaps aus dem Betrieb der Software Factory und des ticket-ops-Systems:

**Mishap 1 — qwen35-iq4 subagent empty output**: Delegation an den qwen35-iq4 Subagenten (Qwen3.6-14B-A3B, IQ4_XS) liefert regelmäßig leere Ergebnisse zurück. Das Modell startet, produziert aber keinen Text — der aufrufende Prozess wartet vergeblich und muss die Arbeit inline wiederholen. Dies wurde heute erneut während der ticket-ops-Routine beobachtet (zwei Delegationen an qwen35-iq4 endeten mit leerem Output).

**Mishap 2 — triage_ticket component-Parameter ohne Wirkung**: Der MCP-Tool `ticket-mcp_triage_ticket` akzeptiert laut Dokumentation keinen `component`-Parameter. Der Parameter muss stattdessen per Workaround gesetzt werden (z.B. via `set_plan_meta` für areas und direkten SQL/Shell-Zugriff für component). Dies erschwert die automatisierte Triage.

## What Changes

- **Mishap 1**: Ursachenforschung für leeren Subagent-Output, ggf. Fix (z.B. Prompt-Format, Kontext-Limit, Modell-Konfiguration)
- **Mishap 2**: Entweder `ticket-mcp` erweitern um component-Parameter, oder Workaround dokumentieren

## Capabilities

### New Capabilities
Keine neuen Capabilities.

### Modified Capabilities
- `ticket-mcp`: Der `triage_ticket`-Tool soll einen `component`-Parameter akzeptieren

## Impact

- `.opencode/agent-models.jsonc`: mögliche Anpassung der qwen35-iq4 Prompt-Vorlage
- `ticket-mcp` Server: möglicher PR für component-Unterstützung
- `.agents/skills/ticket-ops/SKILL.md`: aktualisierte Workaround-Dokumentation
