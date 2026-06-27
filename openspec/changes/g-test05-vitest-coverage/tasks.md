---
title: "G-TEST05: Vitest Line-Coverage (website/src/lib) messen + ≥60%"
ticket_id: T001208
domains: [test, coverage, vitest, website]
status: plan_staged
file_locks: [website/src/data/test-inventory.json]
shared_changes: false
---

# Tasks: g-test05-vitest-coverage (T001208)

- [ ] Task 0: Coverage-Baseline messen — `vitest run --coverage` mit `thresholds.lines: 60` (RED, Expected: FAIL weil < 60 %)
- [ ] Task 1: `@vitest/coverage-v8` installieren + `website/vitest.config.ts` um `test.coverage` (scope `src/lib/**`, `json-summary`, `thresholds.lines: 60`) erweitern
- [ ] Task 2: Neue Pure-Logic-Unit-Tests für ungetestete `src/lib/*.ts`-Module schreiben bis Line-Coverage ≥ 60 % (GREEN)
- [ ] Task 3: CI-Gate in `.github/workflows/ci.yml` (`Vitest (website)`-Job) — `vitest run --coverage` + `jq`-Schwelle auf `total.lines.pct`
- [ ] Task 4: `website/src/data/test-inventory.json` via `task test:inventory` neu generieren (CI-Drift-Gate)
- [ ] Task 5: Finaler Verifikations-Task (`task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task test:inventory`)

---

# G-TEST05 — Vitest Line-Coverage (website/src/lib) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Test-first — Task 0 is the RED step, Task 2 turns it GREEN.

**Goal:** Line-Coverage von `website/src/lib` messbar machen und auf **≥ 60 %** heben, dann per CI-Gate einfrieren. Heute hat `website/vitest.config.ts` keinen `test.coverage`-Block; ~79 der 242 Nicht-Test-Module in `src/lib` haben gar keine Tests. G-TEST05 ist damit weder gemessen noch verteidigbar.

**Architecture:** Drei Hebel in Reihenfolge. (1) Coverage-Instrumentierung: `@vitest/coverage-v8` + `test.coverage` auf `src/lib/**` mit `json-summary`-Reporter und `thresholds.lines: 60`. Der Block liegt auf Root-`test`-Ebene (nicht pro Projekt), damit V8-Coverage über `node`- und `components`-Projekt aggregiert wird. (2) Neue Tests: Pure-Logic-Module ohne DB/Netz zuerst (billigste Coverage pro Zeile), bis `total.lines.pct ≥ 60`. (3) CI-Gate: zusätzlicher Schritt im bestehenden `Vitest (website)`-Job, der `coverage/coverage-summary.json` mit `jq` prüft — `thresholds.lines: 60` lässt den Vitest-Lauf selbst rot werden, der `jq`-Guard liefert die klare Fehlermeldung.

**Tech Stack:** Vitest 4, `@vitest/coverage-v8` (V8 provider), TypeScript, pnpm, GitHub Actions, `jq`, go-task (`test:inventory`, `test:changed`, `freshness:*`).

## Global Constraints

- S1-Limits (aus `docs/code-quality/gates.yaml`): `.ts`/`.js` → **600** Zeilen; `.svelte`/`.mjs` → **500**; `.astro`/`.tsx` → **400**.
- `website/vitest.config.ts` ist **nicht gebaselined** → wirksame Schwelle = statisches Limit **600**. Coverage-Block fügt ~25 Zeilen hinzu (56 → ~81 LOC) — bleibt klar unter 600.
- **Neue Test-Dateien**: `.ts` Limit = 600; pro Datei **< 300 Zeilen** planen (kleine, fokussierte `describe`-Blöcke; bei Bedarf auf mehrere `*.test.ts` aufteilen / split).
- Coverage-Scope ist **ausschließlich `src/lib`** — `src/components`/`src/pages` sind nicht Teil von G-TEST05.
- Nur **Line-Coverage** wird gegated (keine branch/function/statement-Thresholds).
- Keine Verhaltensänderung an Produktionscode — nur Tests, Config, CI. Bestehende Tests bleiben grün.
- Der bestehende `node`/`components`-Projekt-Split (`website/vitest.config.ts`) bleibt unverändert; jdom-/node-Trennung wird nicht angefasst.
- Alle Code-Änderungen müssen `task test:changed` bestehen.
- Nach Test-Änderungen MUSS `website/src/data/test-inventory.json` via `task test:inventory` neu generiert und mitcommittet werden (CI re-runs `task test:inventory` und schlägt bei Diff fehl).

## S1 Budgets

Wirksame Schwelle = `max(statisches Limit, baseline.metric)`; Restbudget = Schwelle − aktuelle `wc -l`. Nur on-disk Dateien, die der Plan modifiziert:

| Datei | Ist (`wc -l`) | Restbudget |
| --- | --- | --- |
| `website/vitest.config.ts` | 56 | 544 |

Neue `*.test.ts`-Dateien existieren noch nicht (kein Live-`wc -l`); Vorgabe pro Datei < 300 Zeilen, hartes `.ts`-Limit 600. `.github/workflows/ci.yml` (`.yml`) und `website/src/data/test-inventory.json` (`.json`) sind ungated (kein S1-Limit für diese Endungen).

## Candidate untested modules (Pure-Logic zuerst)

Top-Kandidaten ohne sibling `*.test.ts` und ohne DB-/Netz-Abhängigkeit — billigste Coverage pro Zeile, in dieser Reihenfolge abzuarbeiten bis ≥ 60 %. Spalte „Art" markiert den Modultyp (keine Budget-Zahl).

| Modul | LOC | Art |
| --- | --- | --- |
| `website/src/lib/sanitize.ts` | 17 | pure |
| `website/src/lib/invoice-types.ts` | 28 | pure |
| `website/src/lib/questionnaire-display.ts` | 32 | pure |
| `website/src/lib/einvoice-types.ts` | 36 | pure |
| `website/src/lib/e2e-marker.ts` | 40 | pure |
| `website/src/lib/rate-limit.ts` | 46 | pure |
| `website/src/lib/compute-scores.ts` | 60 | pure |
| `website/src/lib/srgb-icc.ts` | 65 | pure |
| `website/src/lib/legal-defaults.ts` | 88 | pure |
| `website/src/lib/graph-utils.ts` | 108 | pure |
| `website/src/lib/xrechnung-ubl.ts` | 131 | pure-XML |
| `website/src/lib/coaching-session-prompts.ts` | 215 | pure-prompts |

Die exakte Auswahl/Anzahl richtet sich nach dem in Task 0 gemessenen Delta zu 60 %. DB-/Netz-Module (z. B. `*-db.ts`, `claude.ts`, `talk.ts`) sind ausdrücklich **nicht** Erstziel — sie erfordern Mocks und liefern weniger Coverage pro Aufwand.

## File Structure

```
website/vitest.config.ts                         ← MODIFY: test.coverage-Block (v8, src/lib scope, json-summary, thresholds.lines 60)
website/package.json                             ← MODIFY: devDependency @vitest/coverage-v8
website/pnpm-lock.yaml                           ← MODIFY: lockfile-Update durch pnpm add -D
website/src/lib/sanitize.test.ts                 ← NEU: Pure-Logic-Unit-Tests (< 300 LOC)
website/src/lib/invoice-types.test.ts            ← NEU: Pure-Logic-Unit-Tests (< 300 LOC)
website/src/lib/compute-scores.test.ts           ← NEU: Pure-Logic-Unit-Tests (< 300 LOC)
website/src/lib/graph-utils.test.ts              ← NEU: Pure-Logic-Unit-Tests (< 300 LOC)
website/src/lib/xrechnung-ubl.test.ts            ← NEU: Pure-Logic-Unit-Tests (< 300 LOC)
website/src/lib/<weitere-kandidaten>.test.ts     ← NEU: nach Bedarf bis ≥ 60 %
.github/workflows/ci.yml                          ← MODIFY: Coverage-Schritt im Vitest (website)-Job
website/src/data/test-inventory.json             ← REGEN: task test:inventory
```

---

## Task 0: Coverage-Baseline messen (RED)

**Files:**
- Modify: `website/vitest.config.ts` (temporärer Coverage-Block — wird in Task 1 dauerhaft)

### Step 1: Minimal-Coverage-Setup + V8-Provider bereitstellen

```bash
cd /tmp/wt-vitest-coverage/website
pnpm add -D @vitest/coverage-v8
```

### Step 2: Coverage einmal laufen lassen — Expected: FAIL (RED)

Coverage-Block (siehe Task 1) eintragen, dann:

```bash
cd /tmp/wt-vitest-coverage/website
pnpm exec vitest run --coverage --testTimeout=30000 || echo "RED (exit non-zero)"
jq -r '.total.lines.pct' coverage/coverage-summary.json
```

**Expected: FAIL** — der Lauf endet mit exit ≠ 0, weil `total.lines.pct` unter dem `thresholds.lines: 60`-Gate liegt. Den gemessenen Prozentwert als Baseline notieren (Delta zu 60 % bestimmt die Menge neuer Tests in Task 2). Falls die Baseline bereits ≥ 60 % ist (RED entfällt), reduziert sich Task 2 auf Härtung/Doku und Task 3/4/5 laufen unverändert weiter.

## Task 1: Coverage-Reporter dauerhaft konfigurieren

**Files:**
- Modify: `website/vitest.config.ts`
- Modify: `website/package.json` + `website/pnpm-lock.yaml`

### Step 1: `@vitest/coverage-v8` als devDependency festschreiben

`pnpm add -D @vitest/coverage-v8` (aus Task 0) committet `package.json` + `pnpm-lock.yaml`.

### Step 2: `test.coverage`-Block in `website/vitest.config.ts` (Root-`test`-Ebene)

```ts
// innerhalb von defineConfig({ test: { … } }), neben `projects`:
coverage: {
  provider: 'v8',
  include: ['src/lib/**/*.ts'],
  exclude: [
    'src/lib/**/*.test.ts',
    'src/lib/**/*.spec.ts',
    'src/lib/**/__tests__/**',
    'src/lib/**/*.generated.*',
    'src/lib/**/*.d.ts',
  ],
  reporter: ['text', 'json-summary'],
  reportsDirectory: './coverage',
  thresholds: { lines: 60 },
},
```

### Step 3: `coverage/` gitignoren

Sicherstellen, dass `website/coverage/` in `website/.gitignore` steht (kein Report-Artefakt committen).

### Step 4: Verifizieren, dass die Instrumentierung greift

```bash
cd /tmp/wt-vitest-coverage/website
pnpm exec vitest run --coverage --testTimeout=30000 || true
test -f coverage/coverage-summary.json && jq -r '.total.lines.pct' coverage/coverage-summary.json
```

`coverage/coverage-summary.json` muss existieren und `total.lines.pct` ausweisen. `wc -l website/vitest.config.ts` muss < 600 bleiben.

## Task 2: Neue Pure-Logic-Tests schreiben (GREEN)

**Files:**
- Create: `website/src/lib/sanitize.test.ts`
- Create: `website/src/lib/invoice-types.test.ts`
- Create: weitere `*.test.ts` aus der Kandidatenliste nach Bedarf

### Step 1: Kandidaten nach Coverage-Delta priorisieren

Aus dem Task-0-Coverage-Text (`pnpm exec vitest run --coverage` → `text`-Reporter listet pro Datei `% Lines`) die Module mit 0 %/niedriger Line-Coverage und hoher LOC-Zahl auswählen. Pure-Module aus der Kandidatenliste zuerst (kein Mock-Aufwand).

### Step 2: Pro Modul fokussierte `describe`-Suite schreiben

Muster (analog `website/src/lib/billing-tax.test.ts`): nur die exportierten Funktionen importieren, Happy-Path + Randfälle (leere Eingabe, Null/Undefined, Grenzwerte) abdecken. Pro Datei < 300 Zeilen; größere Module ggf. auf mehrere `*.test.ts` aufteilen (split).

```bash
cd /tmp/wt-vitest-coverage/website
pnpm exec vitest run --coverage --testTimeout=30000
jq -r '.total.lines.pct' coverage/coverage-summary.json   # iterieren bis >= 60
```

### Step 3: Schwelle erreicht — GREEN

`pnpm exec vitest run --coverage` endet exit 0 und `total.lines.pct >= 60`. Alle bestehenden Tests bleiben grün.

## Task 3: CI-Gate in `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

### Step 1: Coverage-Schritt im `Vitest (website)`-Job ergänzen

Nach dem bestehenden „Run website unit tests"-Schritt:

```yaml
      - name: Lib line-coverage gate (G-TEST05 >= 60%)
        run: |
          cd website
          pnpm exec vitest run --coverage --testTimeout=30000
          pct=$(jq -r '.total.lines.pct' coverage/coverage-summary.json)
          echo "website/src/lib line coverage: ${pct}%"
          awk -v p="$pct" 'BEGIN{ exit (p+0 >= 60) ? 0 : 1 }' \
            || { echo "::error::lib line coverage ${pct}% < 60%"; exit 1; }
```

`thresholds.lines: 60` lässt den Vitest-Lauf selbst rot werden; der `jq`/`awk`-Guard liefert die explizite Fehlermeldung im CI-Log. Job-`timeout-minutes: 10` reicht für den zusätzlichen Coverage-Lauf; falls knapp, den bestehenden Unit-Test-Schritt durch den Coverage-Schritt ersetzen statt zweier Läufe.

### Step 2: Workflow-Syntax prüfen

```bash
cd /tmp/wt-vitest-coverage
task test:all   # enthält den Taskfile-/CI-Dry-Run-Check
```

## Task 4: test-inventory.json regenerieren

**Files:**
- Regen: `website/src/data/test-inventory.json`

### Step 1: Inventory neu bauen und committen

```bash
cd /tmp/wt-vitest-coverage
task test:inventory
git add website/src/data/test-inventory.json
```

Da Task 2 neue `*.test.ts` hinzufügt, würde der CI-Schritt „Test inventory check" sonst auf dem Diff fehlschlagen. Das regenerierte JSON MUSS mitcommittet werden.

## Task 5: Finaler Verifikations-Task

**Files:**
- (kein neuer Code — Gates ausführen)

### Step 1: Smart-Test-Selection + Freshness-Gates

```bash
cd /tmp/wt-vitest-coverage
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

### Step 2: Coverage-Endzustand bestätigen (Evidence before assertion)

```bash
cd /tmp/wt-vitest-coverage/website
pnpm exec vitest run --coverage --testTimeout=30000
jq -r '"lib line coverage: " + (.total.lines.pct|tostring) + "%"' coverage/coverage-summary.json
```

Erwartung: alle vier `task`-Gates grün, `total.lines.pct >= 60`, `git status` zeigt nur die geplanten Dateien (Config, neue Tests, ci.yml, test-inventory.json). Erst dann PR via `dev-flow-execute` erstellen.
