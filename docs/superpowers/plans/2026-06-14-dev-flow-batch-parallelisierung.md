---
ticket_id: T000721
spec_ref: docs/superpowers/specs/2026-06-14-dev-flow-batch-parallelisierung.md
status: active
date: 2026-06-14
domains: [scripts, skills]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: dev-flow-batch Dynamische Parallelisierung (KI-Zerlegung, file-isoliert)

## Ziel

`dev-flow-batch` Modus 2 mit echter KI-basierter Zerlegung und file-isolierten Sub-Features ausstatten. `pipeline.js` auf ≤600 Zeilen bringen durch Extraktion der Decompose-Logik in eine neue Datei `pipeline-decompose.cjs`.

## S1-Budget-Analyse

| Datei | Aktuell | Limit | Status |
|-------|---------|-------|--------|
| `scripts/factory/pipeline.js` | 777 Zeilen | 600 | Über Limit — Extraktion in pipeline-decompose.cjs reduziert auf <600 |
| `scripts/factory/pipeline-decompose.cjs` | neu | 600 | Neue Datei, bleibt <600 |
| `.claude/skills/dev-flow-batch/SKILL.md` | 225 Zeilen | 600 | OK |
| `scripts/batch-workflow-gen.sh` | ~155 Zeilen | — | Keine S1-Pflicht, optional minimal anpassen |

## Architektur

```
pipeline-decompose.cjs (NEU)
  export decomposeFeature(description, apiBalance) → SubFeature[]
  export assignFiles(subFeatures, touchedFiles, sharedFileList) → SubFeature[]
  (Workflow-Skript: kein import, alles inline)

pipeline.js (ANGEPASST)
  - Decompose-Logik ENTFERNT (→ pipeline-decompose.cjs)
  - batch_mode arg: wenn true + args.sub_features gesetzt → parallele Runs
  - Fehlerbehandlung: sub-feature null → log + skip

SKILL.md (ANGEPASST)
  - Modus 2: Verweis auf pipeline-decompose.cjs
  - Dynamische Branch-Anzahl erklärt
  - apiBalance-Parameter dokumentiert
```

## Tasks

### T1 — Analyse & Setup

- [ ] Worktree anlegen: `bash scripts/worktree-create.sh feature/dev-flow-batch-parallelisierung /tmp/wt-batch-parallel`
- [ ] S1-Baseline prüfen für alle betroffenen Dateien (`wc -l` auf pipeline.js, dispatcher.js, SKILL.md)
- [ ] `jq -r '."S1:scripts/factory/pipeline.js".metric // "nicht-baselined"' docs/code-quality/baseline.json` — Status bestätigen

### T2 — `scripts/factory/pipeline-decompose.cjs` erstellen (NEU, <600 Zeilen)

- [ ] Datei anlegen als Workflow-Skript (kein `import`, kein `require` außer CommonJS via `require('child_process')`)
- [ ] Funktion `decomposeFeature(description, apiBalance)` implementieren:
  - Ruft `agent(...)` mit JSON-Schema auf
  - Schema: `{ parent_feature: string, sub_features: [{id, title, description, domains, depends_on, shared_changes}] }`
  - `apiBalance`-Parameter bestimmt `maxSubFeatures = Math.min(6, Math.max(1, apiBalance))`
  - Gibt Array von Sub-Features zurück
- [ ] Funktion `assignFiles(subFeatures, touchedFiles, sharedFileList)` implementieren:
  - `sharedFileList`: `['k3d/configmap-domains.yaml', 'environments/schema.yaml', 'k3d/kustomization.yaml']`
  - Shared files: höchstens dem **ersten** Sub-Feature zugewiesen, das sie anfordert; alle weiteren erhalten `shared_changes: true` ohne konkrete file-Zuweisung
  - Restliche Files: disjunkt verteilt (first-come, first-served nach Sub-Feature-Index)
  - Rückgabe: `SubFeature[]` mit ergänztem `assignedFiles: string[]`
- [ ] Validierungsschritt: alle `assignedFiles`-Listen paarweise disjunkt — wirft Fehler wenn nicht
- [ ] Edge Cases absichern: `apiBalance = 0` → leeres Array; nur 1 Sub-Feature → Array mit einem Element (kein Batch nötig)
- [ ] `node --check scripts/factory/pipeline-decompose.cjs` muss sauber durchlaufen

### T3 — `scripts/factory/pipeline.js` anpassen (<600 Zeilen nach Extraktion)

- [ ] Decompose-Logik (aktueller `plan:decompose`-Agent-Block) in pipeline-decompose.cjs verlagert — pipeline.js referenziert `decomposeFeature` nicht direkt (Workflow-Import-Verbot), stattdessen: pipeline-decompose.cjs wird als separates Workflow-Skript via `workflow()` aufgerufen ODER die Funktion wird inline in pipeline.js belassen und die Extraktion betrifft nur Hilfsfunktionen
  - **Konkrete Strategie**: Hilfsfunktionen `provision()`, `chooseModel()`, `chooseEffort()`, `buildContextHints()`, `routeProviderSync()`, `releaseSlotSync()`, `routerSource()`, `routerTier()` (~80 Zeilen) in pipeline-decompose.cjs als eigenständige Sammlung auslagern; pipeline.js `require()`-t diese via CommonJS wenn im Workflow-Kontext erlaubt — falls nicht: Funktionen bleiben inline, aber redundante Kommentare + veraltete Spike-Kommentare werden bereinigt bis <600 Zeilen
  - Ziel: `wc -l pipeline.js` ≤ 600 nach dem Commit
- [ ] Batch-Modus implementieren: `if (A.batch_mode === true && Array.isArray(A.sub_features))`
  - Sub-Features-Array aus `args.sub_features` laden
  - `parallel()` über Sub-Features mappen, jedes startet einen `agent()` mit eigenem Worktree-Slug
  - Ergebnis: `results = await parallel(sub_features.map(sf => () => agent(...)))`
  - Fehlgeschlagene Sub-Features (null/undefined result): geloggt + aus Endergebnis herausgefiltert — kein Abbruch
- [ ] Return-Wert im Batch-Modus: `{ succeeded: N, skipped: M, results: [...] }`
- [ ] `node --check scripts/factory/pipeline.js` muss sauber durchlaufen
- [ ] `wc -l scripts/factory/pipeline.js` ≤ 600 bestätigen

### T4 — `.claude/skills/dev-flow-batch/SKILL.md` aktualisieren

- [ ] Modus 2 Schritt 2 "Decompose-Subagent": Verweis auf `pipeline-decompose.cjs` + Erklärung des `apiBalance`-Parameters
- [ ] Schritt 3 aktualisieren: Sub-Features → file-assignment → `assignedFiles`-Zuweisung erklären
- [ ] Schritt 4 neu: Workflow-Aufruf mit `batch_mode: true, sub_features: [...]` dokumentieren
- [ ] Abschnitt "Edge Cases" hinzufügen: apiBalance=0, 1 Sub-Feature, shared file conflict
- [ ] Zeilenzahl nach Änderung: `wc -l` ≤ 600

### T5 — Tests & Freshness

- [ ] `task test:all` im Worktree ausführen — muss grün sein
- [ ] `task freshness:regenerate` ausführen
- [ ] `task freshness:check` ausführen — muss grün sein
- [ ] `node --check scripts/factory/pipeline.js` und `node --check scripts/factory/pipeline-decompose.cjs`
- [ ] `wc -l scripts/factory/pipeline.js` ≤ 600 final bestätigen

## Implementierungsreihenfolge

T1 → T2 → T3 (T2 und T3 können teilweise parallel, da disjunkte Dateien) → T4 → T5

## Risiken & Guardrails

- **Workflow-Import-Verbot**: CommonJS `require()` ist in Workflow-Skripten erlaubt, ESM `import` nicht. pipeline-decompose.cjs muss ohne Top-Level-Import auskommen.
- **git-crypt**: Kein `isolation: 'worktree'` im Agent-Tool — immer `scripts/worktree-create.sh` verwenden.
- **pipeline.js Zeilen-Gate**: Die Extraktion muss pipeline.js tatsächlich unter 600 Zeilen bringen — nicht nur Kommentare kürzen, sondern echte Logik auslagern.
- **S1 nicht baselined**: Da pipeline.js nicht in baseline.json steht, greift das Gate mit dem Repo-Default (600). Nach Implementation: `task freshness:regenerate` aktualisiert baseline.json automatisch wenn das Gate läuft.
