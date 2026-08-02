# Design: K8 Agentische Headed-Tests

## Architektur

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ dev-flow-e2e │────▶│ Playwright       │────▶│ Fleet Cluster   │
│ (Skill)      │     │ (Headless/Headed)│     │ (Live Deploy)   │
└──────┬───────┘     └────────┬─────────┘     └─────────────────┘
       │                      │
       │ (optional)           │ (Screenshots)
       ▼                      ▼
┌──────────────┐     ┌──────────────────┐
│ Agent-       │     │ Vision Server    │
│ Steuerung    │     │ (Port 8094)      │
└──────────────┘     └──────────────────┘
```

## Komponenten

### 1. Skill-Erweiterung: `dev-flow-e2e`

Der bestehende Skill wird um eine optionale Stufe `headed-verify` ergänzt:

- **Trigger:** `--headed` Flag oder `HEADED_VERIFY=true` Env
- **Ablauf:** Agent parametrisiert den Playwright-Test (URL, Element-Selektoren, Assertions) → führt Playwright headed aus → wertet Ergebnisse aus
- **Kein Abbruch bei Fehler:** Der Test informiert, blockiert aber nicht

### 2. Playwright-Test-Spezifikation

- Basis: bestehende Playwright-Konfiguration aus `e2e.yml`
- Erweiterung: agenten-lesbare Test-Parameter (JSON/YAML)
- Headed-Modus: `headless: false` für visuelle Verifikation

### 3. Vision-Integration (optional)

- Screenshots an `http://localhost:8094/v1/chat/completions` senden
- Vision-Modell prüft: UI-Elemente, Texte, Positionierung
- Antwort wird in Testergebnis eingebettet

## Abgrenzung

- **KEIN CI-Gate:** `.github/workflows/e2e.yml` wird nicht geändert
- **KEIN neuer Server:** Vision-Server (Port 8094) existiert bereits
- **KEIN starres Skript:** Der Agent steuert den Test dynamisch
