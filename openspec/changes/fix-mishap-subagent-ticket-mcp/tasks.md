## 1. Mishap 1 — Subagent Empty Output

- [ ] 1.1 Prompt-Template in `.opencode/agent-models.jsonc` prüfen (ChatML-Format? Context-Window-Limit?)
- [ ] 1.2 Test-Delegation mit minimalem Prompt (ohne Research-Context) zur Reproduktion
- [ ] 1.3 Fix implementieren: Prompt kürzen, Template-Korrektur, oder Dokumentation des Workarounds
- [ ] 1.4 Workaround im ticket-ops skill dokumentieren (Fallback auf inline-Execution bei leerem Output)

## 2. Mishap 2 — triage_ticket component-Parameter

- [ ] 2.1 ticket-mcp Server Code in `brett/` lokalisieren und `component`-Feld im `triage_ticket`-Handler ergänzen
- [ ] 2.2 MCP-Tool JSON-Schema erweitern um optionalen `component`-Parameter
- [ ] 2.3 PR erstellen und CI grün abwarten
- [ ] 2.4 (Parallel) Workaround-Dokumentation in ticket-ops skill: component per add_comment + set_plan_meta setzen
