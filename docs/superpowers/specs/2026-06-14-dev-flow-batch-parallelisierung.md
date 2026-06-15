---
ticket_id: T000721
plan_ref: docs/superpowers/plans/2026-06-14-dev-flow-batch-parallelisierung.md
status: active
date: 2026-06-14
---

# Spec: dev-flow-batch Dynamische Parallelisierung (KI-Zerlegung, file-isoliert)

## Kontext & Ist-Zustand

`dev-flow-batch` (`.claude/skills/dev-flow-batch/SKILL.md`) besitzt bereits einen rudimentären Modus 2 ("Großes Feature splitten"), der:

1. Einen Decompose-Subagenten spawnt und Sub-Features als JSON zurückbekommt
2. Diese in ein Ticket-Array umwandelt
3. `batch-workflow-gen.sh` + `Workflow({scriptPath, args})` aufruft — denselben Flow wie Modus 1

Was **fehlt**:
- Die KI-Zerlegung im Skill ist rein konzeptuell beschrieben; keine Datei-Isolierungs-Logik ist implementiert
- Der Decompose-Subagent im Skill gibt Domains zurück, aber **keine konkreten Dateilisten** pro Sub-Feature
- `shared_changes: true/false` ist binär — keine Zuweisung, welchem Sub-Feature die shared files gehören
- `batch-workflow-gen.sh` behandelt alle Tickets identisch, ohne file-assignment awareness
- Die Branch-Anzahl ist nicht explizit an eine API-Balance geknüpft (Skill sagt "dynamisch", liefert aber keine Implementierung)
- `scripts/factory/pipeline.js` hat 777 Zeilen; das S1-Limit liegt bei 600 — ein Zeilen-Gate-Problem sobald weitere Logik dazukommt

## Was dieses Feature ändert

1. **Neue Datei `scripts/factory/pipeline-decompose.cjs`** extrahiert die KI-Zerlegungslogik aus der SKILL.md-Beschreibung in ausführbaren Code:
   - Funktion `decomposeFeature(description, apiBalance)` → Array von Sub-Features mit `{id, title, description, assignedFiles[]}`
   - file-assignment Logik: jedes Sub-Feature bekommt eine **disjunkte** Dateiliste; shared files (`configmap-domains.yaml`, `environments/schema.yaml`, `k3d/kustomization.yaml`) werden höchstens einem Sub-Feature zugewiesen
   - `apiBalance`-Parameter steuert die maximale Sub-Feature-Anzahl (nicht hardcoded)

2. **`scripts/factory/pipeline.js` anpassen**:
   - Zerlegungslogik aus pipeline.js in pipeline-decompose.cjs auslagern (Zeilenreduktion auf <600)
   - batch-Modus: wenn `args.batch_mode === true` → `decomposeFeature` aufrufen → parallele Sub-Feature-Runs
   - Fehlerbehandlung: gescheitertes Sub-Feature wird geloggt + übersprungen, Rest läuft weiter

3. **`.claude/skills/dev-flow-batch/SKILL.md` aktualisieren**:
   - Modus 2 auf die neue pipeline-decompose.cjs verweisen
   - Dynamische Branch-Anzahl dokumentieren
   - Beispiel-Aufrufe aktualisieren

## Kern-Nutzerflow

```
Major-Feature (Text oder .md-Pfad)
  → SKILL.md Modus 2 erkennt Feature
  → pipeline-decompose.cjs: decomposeFeature(description, apiBalance)
      → KI-Agent zerlegt in N Sub-Features (N ≤ min(6, apiBalance))
      → file-assignment: shared files → max. 1 Sub-Feature, Rest disjunkt
  → Für jedes Sub-Feature: paralleler Agent-Run (pipeline.js batch_mode)
      → bei Fehler: Sub-Feature SKIPPED, nächstes läuft weiter
  → Report: N erfolgreich / M übersprungen
```

## Akzeptanzkriterien

- [ ] KI zerlegt Ticket-Beschreibung automatisch in ≥2 Sub-Features
- [ ] Jedes Sub-Feature bekommt disjunkte Dateiliste (kein overlap)
- [ ] `configmap-domains.yaml` + `environments/schema.yaml` max. einem Sub-Feature zugewiesen
- [ ] Fehlgeschlagenes Sub-Feature wird übersprungen, Rest läuft weiter
- [ ] Branch-Anzahl dynamisch (abhängig von `apiBalance`-Parameter, nicht hardcoded)
- [ ] `pipeline.js` hat nach der Extraktion ≤600 Zeilen
- [ ] `task test:all` grün nach Implementation

## Nicht-Scope

- E2E-Tests pro Sub-Feature (zu teuer, zu eng an Live-Infra)
- Automatische Konflikt-Auflösung zwischen Sub-Features (bleibt sequenziell wie heute in der Shared-Phase)
- Merge-Reihenfolge-Optimierung (depends_on bleibt wie today in batch-workflow-gen.sh)
- API-Balance-Abfrage via echte Rate-Limit-API (Anthropic liefert keine; apiBalance bleibt konfigurierbarer Parameter)

## Edge Cases

| Edge Case | Verhalten |
|-----------|-----------|
| `configmap-domains.yaml` von zwei Sub-Features benötigt | Ersten Sub-Feature zugewiesen; zweites erhält `shared_changes: true` ohne konkrete file-Zuweisung → landet in Phase 2 "Shared" seriell |
| `apiBalance = 0` | `decomposeFeature` gibt `[]` zurück → SKILL.md meldet "Keine Parallelisierung möglich" und stopp |
| Zerlegung ergibt nur 1 Sub-Feature | Kein Batch-Modus; direkt als single-Feature an pipeline.js übergeben |
| Sub-Feature-Agent returnt null | `pipeline()` filtert null-Ergebnisse bereits (wie batch-workflow-gen.sh heute, Zeile 103) |

## Technische Constraints

- **S1-Limit**: `pipeline.js` hat 777 Zeilen (kein Baseline-Eintrag → Limit 600). Die Zerlegungslogik MUSS in `pipeline-decompose.cjs` (neue Datei, <600 Zeilen) extrahiert werden; `pipeline.js` wird durch die Extraktion auf <600 Zeilen gebracht.
- **Workflow-Import-Verbot**: `pipeline.js` und `pipeline-decompose.cjs` sind Workflow-Skripte — `import` ist verboten. Hilfsfunktionen werden inline definiert oder (bei pipeline-decompose.cjs) als harness-injiziertes Modul behandelt.
- Kein `isolation: 'worktree'` im Agent-Tool (git-crypt smudge-filter-Fehler, T000426) — immer `scripts/worktree-create.sh`.

## Betroffene Dateien

| Datei | Änderungstyp | Zeilenanzahl aktuell | Limit | Status |
|-------|-------------|---------------------|-------|--------|
| `scripts/factory/pipeline.js` | Modifiziert (Extraktion) | 777 | 600 | Über Limit → Extraktion nötig |
| `scripts/factory/pipeline-decompose.cjs` | Neu erstellt | — | 600 | Neue Datei |
| `.claude/skills/dev-flow-batch/SKILL.md` | Modifiziert | 225 | 600 | OK |
| `scripts/batch-workflow-gen.sh` | Ggf. kleinere Anpassungen | ~155 | — | Optional |
