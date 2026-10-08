---
page: ai-agents
ticket: T901051
status: complete
actions:
  - agent-start
  - file-context
  - selection-context
---

## Voraussetzungen

- Mindestens eine Agent-CLI auf PATH (verifiziert 2026-10-08: opencode,
  muse, claude, codex, qwen, pi, agy — alle vorhanden). Nur vorhandene
  CLIs werden angezeigt (`executable()`-Probe zur Laufzeit).
- Eingebettet: `opencode.nvim` bleibt (Begruendung: snacks-kompatibel,
  kein zweites Agent-Plugin noetig).

## Geordnete Schritte

1. **agent-start**: CLI aus den vorhandenen waehlen — Agent startet im
   Terminal im Git-Root.
2. **file-context**: Aktuelle Datei als Kontext uebergeben — Agent
   startet mit Dateipfad.
3. **selection-context**: Auswahl als Kontext — erst yanken, dann Agent
   mit Dateikontext starten (Schritt dokumentiert die Reihenfolge).

## Erwartetes Ergebnis

Agentenliste enthaelt nur live vorhandene CLIs; Start mit
Kontextuebergabe; Plugin-Entscheid (opencode.nvim) begruendet.

## Troubleshooting

- **Keine CLI angeboten**: PATH pruefen — keine der sieben CLIs gefunden.
- **Leerer Buffer bei file-context**: erst Datei oeffnen.

## Recovery

Keine: Agents laufen im Terminal und veraendern die Config nicht.
