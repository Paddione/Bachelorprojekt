---
title: "G-RH01: S1-Frozen-Violations Batch 1 — baseline.json 98→≤30"
ticket_id: T001108
domains: [quality, infra, website, brett]
status: active
file_locks: [docs/code-quality/baseline.json]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: s1-violations-batch1 (T001108)

- [ ] Task 0: Failing-Test schreiben — BATS `tests/spec/s1-violations.bats` (RED)
- [ ] Task 1: Quick Win — `task quality:baseline:refresh` (stale entries entfernen)
- [ ] Task 2: Vendor/Generated aus S1 ausschließen
- [ ] Task 3: `website/src/lib/questionnaire-db.ts` aufteilen (1227 → <500 Zeilen)
- [ ] Task 4: Final Baseline-Refresh, alle Tests, Commit + PR

---

# G-RH01: S1-Frozen-Violations Reduction — Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** `docs/code-quality/baseline.json` von 98 auf ≤ 30 Einträge reduzieren, G-RH01-Ziel erreichen.

**Architecture:** Drei Hebel in Reihenfolge: (1) `task quality:baseline:refresh` Quick-Win, (2) Vendor/Generated ausschließen, (3) größte Source-Dateien aufteilen. Nach jedem Hebel: refresh + check, um Fortschritt zu sehen. Falls nach Hebel 1+2 bereits ≤30 erreicht: Hebel 3 überspringen.

**Tech Stack:** Node.js, `scripts/code-quality/baseline-refresh.mjs`, `scripts/code-quality/load.mjs`, `scripts/code-quality/check.mjs`, TypeScript, Svelte, Astro.

## Global Constraints

- S1-Limit: **500 Zeilen** pro Datei (außer explizit ausgenommene)
- **Nicht aufteilen** (Vendor/Generated):
  - `brett/public/lib/GLTFLoader.js` (3629 Zeilen, Three.js Vendor)
  - `website/src/lib/agent-guide.generated.json` (2134 Zeilen, generator-output)
  - `website/src/lib/platform-descriptions.generated.json` (auto-generated)
  - `scripts/ticket.sh` (735 Zeilen, Shell, niedrige Priorität)
- Ziel: baseline.json ≤ 30 Einträge
- Alle Code-Änderungen müssen `task test:changed` bestehen
- Nach dem Splitten: `task quality:baseline:refresh` und Änderung committen
- Kein API-Bruch bei `questionnaire-db.ts` — bestehende Importe müssen weiter funktionieren (Index-Re-Export)

## File Structure

```
docs/code-quality/baseline.json                     ← MODIFY: refresh + reduce
scripts/code-quality/load.mjs                        ← MODIFY: vendor/generated exclude
website/src/lib/questionnaire-db.ts                   ← MODIFY: redirect to ./questionnaire-db/index
website/src/lib/questionnaire-db/index.ts             ← NEU: re-export compat layer
website/src/lib/questionnaire-db/queries.ts           ← NEU: DB-Operationen
website/src/lib/questionnaire-db/scoring.ts           ← NEU: Scoring/Auswertung
website/src/lib/questionnaire-db/types.ts             ← NEU: TypeScript-Interfaces
tests/spec/s1-violations.bats                         ← NEU: RED→GREEN Regression
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/s1-violations.bats`

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-s1-violations-batch1/tests/spec/s1-violations.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/s1-violations-batch1/proposal.md
# G-RH01: baseline.json ≤ 30 Einträge

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH01: baseline.json hat ≤ 30 Einträge" {
  count=$(jq 'keys | length' "$REPO_ROOT/docs/code-quality/baseline.json")
  [ "$count" -le 30 ]
}

@test "G-RH01: GLTFLoader.js ist aus S1-Gate ausgeschlossen" {
  ! grep -q "GLTFLoader" "$REPO_ROOT/scripts/code-quality/load.mjs" 2>/dev/null \
    || ! jq -e '."S1:brett/public/lib/GLTFLoader.js"' "$REPO_ROOT/docs/code-quality/baseline.json" >/dev/null 2>&1
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
cd /tmp/wt-s1-violations-batch1
bats tests/spec/s1-violations.bats
```

**Expected fail:** `count` ist 98, weit über 30. Erst nach Task 1+2+3 wird der Test grün.

---

## Task 1: Quick Win — Stale Baseline-Einträge entfernen

**Files:**
- Modify: `docs/code-quality/baseline.json` (via `task quality:baseline:refresh`)

### Step 1: Aktuellen Stand messen

```bash
cd /tmp/wt-s1-violations-batch1
jq 'keys | length' docs/code-quality/baseline.json
```

Erwartung: 98 Einträge.

### Step 2: Baseline-Refresh ausführen

```bash
task quality:baseline:refresh
```

Erwartung: Ausgabe zeigt "removed: ~63, unchanged: ~35, updated: ~0". baseline.json wird aktualisiert.

### Step 3: Neuen Stand messen

```bash
jq 'keys | length' docs/code-quality/baseline.json
```

Erwartung: ≤40 Einträge. Falls höher, Top-Verbleibende analysieren:

```bash
jq -r 'to_entries | sort_by(-.value.metric) | .[] | "\(.value.metric)  \(.value.path)"' \
  docs/code-quality/baseline.json | head -20
```

### Step 4: Qualitäts-Check

```bash
task quality:check
```

Erwartung: Exit 0. Falls neue Violations erscheinen (vorher durch Baseline verdeckt), diese in Task 3 mit-addressieren.

### Step 5: Commit

```bash
cd /tmp/wt-s1-violations-batch1
git add docs/code-quality/baseline.json
git commit -m "chore(quality): baseline-refresh — entferne stale/gelöste S1-Einträge [T001108]"
```

---

## Task 2: Vendor- und Generated-Dateien ausschließen

**Files:**
- Modify: `scripts/code-quality/load.mjs` (oder `.s1-ignore`)
- Modify: `docs/code-quality/baseline.json` (entries für GLTFLoader, agent-guide.generated.json, platform-descriptions.generated.json)

### Step 1: S1-Ausschluss-Mechanismus prüfen

```bash
cd /tmp/wt-s1-violations-batch1
grep -n "ignore\|exclude\|vendor\|generated" scripts/code-quality/load.mjs | head -20
ls -la .s1-ignore 2>/dev/null || echo "no .s1-ignore file"
```

Identifiziere wie Vendor/Generated-Dateien ausgeschlossen werden (Ignore-Array, .s1-ignore, glob-Pattern).

### Step 2: Vendor/Generated-Patterns hinzufügen

In `scripts/code-quality/load.mjs` (oder gleichwertige Konfiguration):

```javascript
// Im s1Ignore-Set / exclude-Pattern:
'brett/public/lib/GLTFLoader.js',                 // Vendor: Three.js GLTF-Loader (3629 LoC)
'website/src/lib/agent-guide.generated.json',    // Generiert: freshness:regenerate
'website/src/lib/platform-descriptions.generated.json', // Generiert
```

Falls `.s1-ignore`-Datei existiert, dort eintragen.

### Step 3: Baseline-Refresh erneut

```bash
task quality:baseline:refresh
jq 'keys | length' docs/code-quality/baseline.json
```

Erwartung: 2-3 Einträge weniger.

### Step 4: Quality + Tests

```bash
task quality:check && task test:changed
```

Erwartung: Exit 0 beides.

### Step 5: Commit

```bash
cd /tmp/wt-s1-violations-batch1
git add scripts/code-quality/ docs/code-quality/baseline.json
git commit -m "chore(quality): vendor/generated Dateien aus S1-Gate ausschließen [T001108]"
```

---

## Task 3: `website/src/lib/questionnaire-db.ts` aufteilen (1227 → <500)

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` (redirect → re-export)
- Create: `website/src/lib/questionnaire-db/index.ts` (compat re-export)
- Create: `website/src/lib/questionnaire-db/queries.ts` (DB-Operationen)
- Create: `website/src/lib/questionnaire-db/scoring.ts` (Scoring/Auswertung)
- Create: `website/src/lib/questionnaire-db/types.ts` (Interfaces)

**Hinweis:** Nur ausführen, wenn nach Task 1+2 baseline.json noch > 30 Einträge ist. Sonst überspringen (siehe Plan-Anmerkung im original Plan-Doc).

### Step 1: Datei-Struktur analysieren

```bash
cd /tmp/wt-s1-violations-batch1
grep -nE "^export|^function|^const|^class|^interface|^type" website/src/lib/questionnaire-db.ts | head -60
wc -l website/src/lib/questionnaire-db.ts
```

Notiere Exports + logische Gruppierung (DB-Ops, Scoring, Types, Helpers).

### Step 2: Module-Verzeichnis anlegen

```bash
mkdir -p website/src/lib/questionnaire-db
```

### Step 3: Exports aufteilen

Verschiebe Exports nach Verantwortung:
- `queries.ts`: alle `SELECT/INSERT/UPDATE/DELETE`-Funktionen
- `scoring.ts`: Punkte-/Auswertungs-Logik
- `types.ts`: TypeScript-Interfaces + Types
- `index.ts`: re-exportiert alle Sub-Module

`index.ts`-Pattern für Abwärtskompatibilität:
```typescript
export * from './queries';
export * from './scoring';
export * from './types';
```

### Step 4: Alte Datei durch Redirect ersetzen

```bash
cd /tmp/wt-s1-violations-batch1
# Backup (lokal, nicht committen)
cp website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-db.ts.bak

cat > website/src/lib/questionnaire-db.ts << 'TS'
// Re-export: Inhalt aufgeteilt nach questionnaire-db/
export * from './questionnaire-db/index';
TS
```

### Step 5: TypeScript-Check

```bash
cd /tmp/wt-s1-violations-batch1/website
pnpm run check 2>&1 | grep -iE "error|questionnaire" | head -20
```

Erwartung: 0 Fehler.

### Step 6: Tests

```bash
cd /tmp/wt-s1-violations-batch1
task test:changed
```

Erwartung: Exit 0.

### Step 7: Backup löschen + committen

```bash
cd /tmp/wt-s1-violations-batch1
rm website/src/lib/questionnaire-db.ts.bak
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-db/
git commit -m "refactor(website): questionnaire-db.ts aufteilen (1227→<500 Zeilen) [T001108]"
```

---

## Task 4: Final — Baseline aktualisieren, alle Tests, PR

**Files:**
- Modify: `docs/code-quality/baseline.json` (final refresh)

### Step 1: Baseline-Refresh

```bash
cd /tmp/wt-s1-violations-batch1
task quality:baseline:refresh
jq 'keys | length' docs/code-quality/baseline.json
```

Erwartung: ≤ 30 Einträge (G-RH01-Ziel).

### Step 2: Alle Quality-Gates

```bash
cd /tmp/wt-s1-violations-batch1
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: alle Exit 0.

### Step 3: BATS-Regression muss GRÜN sein

```bash
cd /tmp/wt-s1-violations-batch1
bats tests/spec/s1-violations.bats
```

Erwartung: Beide Tests grün (baseline ≤30, GLTFLoader ausgeschlossen).

### Step 4: Commit (falls baseline.json sich geändert hat)

```bash
git add docs/code-quality/baseline.json
git diff --cached --quiet || git commit -m "chore(quality): baseline nach Refactoring final aktualisieren [T001108]"
```

### Step 5: PR-Titel Preflight

```bash
bash scripts/preflight-pr-scope.sh "chore(quality): S1-Violations Batch 1 — baseline.json 98→≤30 [T001108]" || { echo "preflight failed"; exit 1; }
```

### Step 6: Push + PR + Auto-Merge

```bash
cd /tmp/wt-s1-violations-batch1
git push -u origin feature/s1-violations-batch1
gh pr create \
  --title "chore(quality): S1-Violations Batch 1 — baseline.json 98→≤30 [T001108]" \
  --base main \
  --body "Closes T001108. Quick-win baseline-refresh + Vendor/Generated-Excludes + questionnaire-db.ts split. G-RH01 erreicht."
gh pr merge --auto --squash --delete-branch
```

### Step 7: Ticket abschließen

```bash
cd /tmp/wt-s1-violations-batch1
PR_NUM=$(gh pr view --json number -q '.number')
./scripts/ticket.sh add-pr-link --id T001108 --pr "$PR_NUM"
./scripts/ticket.sh update-status --id T001108 --status qa_review
./scripts/ticket.sh add-comment --id T001108 --body "PR #${PR_NUM} merged. baseline.json: 98→≤30. G-RH01 erreicht."
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-s1-violations-batch1
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
bats tests/spec/s1-violations.bats
```

Alle müssen grün sein, bevor der PR erstellt wird.
