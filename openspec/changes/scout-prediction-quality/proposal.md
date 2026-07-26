## Why

Seit Mitte Juli 2026 produziert die Scout-Phase der Software Factory systematisch schwache Ergebnisse: 20+ SCOUT_WEAK-Ereignisse und 5+ scout_drift-Fälle innerhalb von 12 Tagen. Der deterministische Scout (grep-basiert) findet oft keine oder zu wenige `touched_files`, und die LLM-Fallback ist entweder nicht aktiv oder liefert unzureichende Ergebnisse. Nach dem Merge weichen die vorhergesagten Files systematisch von den tatsächlich geänderten Files ab.

Dies führt zu Factory-Ticks, die im Scout-Phase hängenbleiben, Tickets in der Warteschleife und einem akkumulierenden Vertrauensverlust in die automatisierte Planung.

## What Changes

1. **Bessere Keyword-Extraktion in scout.sh** — N-Gramm-Splitting, Compound-Word-Zerlegung (camelCase → Einzelwörter), bessere Nutzung des bestehenden SCS (Code Search) API-Endpunkts
2. **Schärferer LLM-Fallback** — SCOUT_LLM_MIN_FILES von 4 → 2 senken, Prompt verbessern (deterministische Zwischenergebnisse als Kontext mitgeben)
3. **Spec-Qualitäts-Pre-Gate** — Vor dem Scout-Lauf prüfen, ob die Spec ≥300 Zeichen hat; wenn nicht, direkt SCOUT_WEAK mit `spec_too_short` zurückgeben (ohne den Scout überhaupt zu starten)
4. **Drift-Ratchet-Feedback-Loop** — Historische Drift-Scores in `scout.sh` einlesen und die File-Count-Schätzung sowie die Komplexitätsklassifikation dynamisch anpassen

## Capabilities

### New Capabilities

- `scout-prediction-quality`: Sammlung von Verbesserungen der Scout-Vorhersagequalität — Keyword-Extraktion, LLM-Fallback-Tuning, Spec-Pre-Gate, Drift-Feedback

### Modified Capabilities

- `software-factory`: Neue Requirements für Scout-Qualität (verbesserte Keyword-Extraktion, LLM-Fallback-Verhalten, Pre-Gate-Logik, Drift-Feedback)

## Impact

| Bereich | Betroffen | Änderung |
|---------|-----------|----------|
| `scripts/factory/scout.sh` | Modifiziert | Keyword-Extraktion (Phase 1), Drift-Feedback (neue Phase) |
| `scripts/factory/scout-llm-fallback.sh` | Modifiziert | Prompt verbessert, Schwellenwert angepasst |
| `scripts/factory/scout-quality-check.cjs` | Modifiziert | Pre-Gate-Logik (Spec-Länge vor Scout-Lauf) |
| `scripts/factory/pipeline-runner.js` | Modifiziert | Integration des Pre-Gates |
| `scripts/factory/scout-drift.cjs` | Modifiziert | ggf. zusätzliche Metriken für Feedback-Loop |
| `scripts/factory/scout-drift.sh` | Modifiziert | Feedback-Daten für scout.sh aufbereiten |
| `tests/spec/scout-prediction-quality.bats` | Neu | BATS-Tests für die neuen Verhaltensweisen |
