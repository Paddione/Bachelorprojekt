# S1-Frozen-Violations Reduction — Batch 1 (G-RH01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/code-quality/baseline.json` von 98 auf ≤ 30 Einträge reduzieren, indem (A) stale/gelöste Einträge via `task quality:baseline:refresh` bereinigt werden (Quick Win: ~63 Einträge) und (B) die verbliebenen größten Dateien gezielt aufgeteilt werden.

**Architecture:** Das S1-Gate verfolgt Dateien, die je über 500 Zeilen waren. `baseline-refresh.mjs` entfernt Einträge, die (a) nicht mehr existieren oder (b) jetzt unter der Schwelle liegen. Die Bereinigung reduziert ohne Code-Änderungen auf ~35 Einträge. Danach werden 5 konkrete Dateien refactored, um auf ≤30 zu kommen.

**Tech Stack:** Node.js, `scripts/code-quality/baseline-refresh.mjs`, TypeScript, Svelte, Astro.

## Global Constraints

- S1-Limit: **500 Zeilen** pro Datei (außer explizit ausgenommene Dateien)
- `brett/public/lib/GLTFLoader.js` (3629 Zeilen) ist eine **Vendor-Library** — sie sollte NICHT aufgeteilt werden, sondern via `.s1-ignore` oder Generator-Ausnahme ausgenommen werden
- `website/src/lib/agent-guide.generated.json` (2134 Zeilen) ist **generiert** — ebenfalls auszunehmen, nicht zu splitten
- Ziel: baseline.json von 98 → ≤ 30 Einträge
- Alle Code-Änderungen müssen `task test:all` bestehen
- Nach dem Splitten einer Datei: `task quality:baseline:refresh` und Änderung committen

---

### Task 1: Quick Win — Stale Baseline-Einträge entfernen

**Files:**
- Modify: `docs/code-quality/baseline.json` (via `task quality:baseline:refresh`)

**Interfaces:**
- Konsumiert: baseline.json (98 Einträge), aktuelle Dateisystem-Realität
- Produziert: bereinigte baseline.json (~35 Einträge), ohne Code-Änderungen

- [ ] **Step 1: Aktuellen Stand messen**

```bash
python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" < docs/code-quality/baseline.json
```

Erwartung: 98 Einträge.

- [ ] **Step 2: Baseline-Refresh ausführen**

```bash
task quality:baseline:refresh
```

Erwartung: Ausgabe zeigt "removed: ~63, unchanged: ~35, updated: ~0" (ungefähre Zahlen). baseline.json wird aktualisiert.

- [ ] **Step 3: Neuen Stand messen**

```bash
python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" < docs/code-quality/baseline.json
```

Erwartung: ≤40 Einträge (von 98). Falls höher als erwartet, die verbleibenden analysieren:

```bash
python3 -c "
import json,sys
d = json.load(sys.stdin)
print('Verbleibende Einträge:')
for k, v in sorted(d.items(), key=lambda x: x[1].get('metric',0), reverse=True):
    print(f\"{v.get('metric'):>5}  {v.get('path')}\")
" < docs/code-quality/baseline.json
```

- [ ] **Step 4: Qualitäts-Check ausführen**

```bash
task quality:check
```

Erwartung: Exit 0. Falls neue Violations erscheinen (Dateien über Limit die vorher durch Baseline verborgen waren), diese als nächste Task-Batch erfassen.

- [ ] **Step 5: Commit**

```bash
git add docs/code-quality/baseline.json
git commit -m "chore(quality): baseline-refresh — entferne stale/gelöste S1-Einträge [G-RH01]"
```

---

### Task 2: Vendor-Dateien und generierte Dateien ausschließen

**Files:**
- Modify: `scripts/code-quality/load.mjs` oder `.s1-ignore` (sofern vorhanden)
- Modify: `docs/code-quality/baseline.json` (entry für GLTFLoader und agent-guide.generated.json entfernen)

**Interfaces:**
- Konsumiert: `baseline.json` nach Task 1
- Produziert: Baseline ohne unbeeinflussbare Vendor/Generated-Einträge

- [ ] **Step 1: Prüfen wie S1 Dateien ausschließt**

```bash
grep -n "ignore\|exclude\|vendor\|generated\|GLTFLoader\|agent-guide" scripts/code-quality/load.mjs | head -20
cat scripts/code-quality/load.mjs | head -50
```

Notiere wie Ausnahmen definiert werden (z.B. `s1Ignore` Array, `.s1-ignore`-Datei, glob-Pattern).

- [ ] **Step 2: Vendor- und Generated-Dateien zum Ignore-Set hinzufügen**

Typischerweise gibt es in `load.mjs` oder `check.mjs` ein Ignore-Pattern. Füge hinzu:

```javascript
// In der entsprechenden ignore-Liste:
'brett/public/lib/GLTFLoader.js',         // Vendor: Three.js GLTF-Loader
'website/src/lib/agent-guide.generated.json', // Generiert: nie manuell ändern
```

Wenn eine `.s1-ignore`-Datei existiert, dort eintragen:
```
brett/public/lib/GLTFLoader.js
website/src/lib/agent-guide.generated.json
```

- [ ] **Step 3: Baseline-Refresh erneut ausführen**

```bash
task quality:baseline:refresh
python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" < docs/code-quality/baseline.json
```

Erwartung: 2 Einträge weniger.

- [ ] **Step 4: quality:check und Test ausführen**

```bash
task quality:check && task test:all
```

Erwartung: Exit 0 beides.

- [ ] **Step 5: Commit**

```bash
git add scripts/code-quality/ docs/code-quality/baseline.json
git commit -m "chore(quality): vendor/generated Dateien aus S1-Gate ausschließen [G-RH01]"
```

---

### Task 3: `website/src/lib/questionnaire-db.ts` aufteilen (1227 → <500 Zeilen)

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` (1227 Zeilen → aufteilen)
- Create: `website/src/lib/questionnaire-db/queries.ts` (DB-Queries)
- Create: `website/src/lib/questionnaire-db/scoring.ts` (Punkte-/Scoring-Logik)
- Create: `website/src/lib/questionnaire-db/index.ts` (Re-Export für Abwärtskompatibilität)

**Interfaces:**
- Konsumiert: bestehende 1227-Zeilen-Datei
- Produziert: 3-4 fokussierte Module; alle bestehenden Importe bleiben kompatibel (kein API-Bruch)

- [ ] **Step 1: Dateistruktur analysieren**

```bash
grep -n "^export\|^function\|^const\|^class\|^interface\|^type" website/src/lib/questionnaire-db.ts | head -40
wc -l website/src/lib/questionnaire-db.ts
```

Notiere die Exports und ihre logische Gruppierung (DB-Operationen vs. Datenverarbeitung vs. Schema-Definitionen).

- [ ] **Step 2: Aufteilen nach Verantwortung**

Erstelle Unterverzeichnis:
```bash
mkdir -p website/src/lib/questionnaire-db
```

Verschiebe Exports nach Gruppe in die entsprechenden Dateien. Zum Beispiel:
- `queries.ts`: alle `SELECT/INSERT/UPDATE/DELETE`-Funktionen
- `scoring.ts`: Auswertungs- und Scoring-Logik
- `types.ts`: TypeScript-Interfaces und -Types
- `index.ts`: Re-exportiert alles aus den Untermodulen

`index.ts`-Muster für Abwärtskompatibilität:
```typescript
export * from './queries';
export * from './scoring';
export * from './types';
```

- [ ] **Step 3: Bestehende Datei durch Index ersetzen**

```bash
# Backup
cp website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-db.ts.bak

# Ältere Datei durch Redirect ersetzen
cat > website/src/lib/questionnaire-db.ts << 'TS'
// Re-export: Inhalt aufgeteilt nach questionnaire-db/
export * from './questionnaire-db/index';
TS
```

- [ ] **Step 4: TypeScript-Check**

```bash
cd website && pnpm run check 2>&1 | grep -i "error\|questionnaire" | head -20
```

Erwartung: 0 Fehler.

- [ ] **Step 5: Tests ausführen**

```bash
task test:all
```

Erwartung: Exit 0.

- [ ] **Step 6: Backup-Datei löschen und committen**

```bash
rm website/src/lib/questionnaire-db.ts.bak
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-db/
git commit -m "refactor(website): questionnaire-db.ts aufteilen (1227→<500 Zeilen) [G-RH01]"
```

---

### Task 4: Final — Baseline aktualisieren und PR erstellen

**Files:**
- Modify: `docs/code-quality/baseline.json` (via `task quality:baseline:refresh`)

**Interfaces:**
- Konsumiert: refactored Files aus Tasks 2-3
- Produziert: verifizierter Stand ≤ 30 Einträge, grüner CI, PR

- [ ] **Step 1: Baseline-Refresh**

```bash
task quality:baseline:refresh
python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Einträge: {len(d)}')" < docs/code-quality/baseline.json
```

Erwartung: ≤ 30 Einträge (Ziel: G-RH01 erreicht).

- [ ] **Step 2: Alle Tests und Quality-Gates**

```bash
task test:all && task quality:check && task freshness:check
```

Erwartung: Exit 0 aller drei.

- [ ] **Step 3: Commit und PR**

```bash
git add docs/code-quality/baseline.json
git commit -m "chore(quality): baseline nach Refactoring aktualisieren [G-RH01]"

git push -u origin chore/s1-violations-batch1
gh pr create \
  --title "chore: S1-Violations Batch 1 — baseline.json 98→≤30 [G-RH01]" \
  --body "Quick-win refresh (stale entries) + questionnaire-db.ts split + Vendor/Generated excludes. G-RH01 erreicht."
gh pr merge --squash --auto
```

---

## Anmerkungen für den Executor

**Reihenfolge ist wichtig:**
1. Task 1 (Refresh) immer zuerst — ergibt den tatsächlichen Umfang
2. Task 2 (Vendor-Excludes) vor Task 3 (Refactoring) — vermeidet Arbeit an bereits ausgeschlossenen Dateien
3. Baseline-Refresh nach JEDEM Refactoring-Step, um Fortschritt zu sehen

**Falls nach Task 1+2 bereits ≤30:** Tasks 3 und 4 überspringen und direkt zu Task 4 (PR) gehen. Das ist gut möglich!

**Dateien die NICHT aufgeteilt werden sollten:**
- `brett/public/lib/GLTFLoader.js` — Vendor (Three.js), nicht editieren
- `website/src/lib/agent-guide.generated.json` — Auto-generiert via `task freshness:regenerate`
- `website/src/lib/platform-descriptions.generated.json` — Auto-generiert
- `scripts/ticket.sh` (735 Zeilen) — Shell-Script, Funktionsextraktion komplex, niedrige Priorität
