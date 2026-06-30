---
title: "website-strict-lint-gate-regression: restore G-CQ03 --max-warnings 0 gate"
ticket_id: T001337
domains: [website, cq, lint, ci]
status: completed
file_locks: []
shared_changes: false
---

# Tasks: website-strict-lint-gate-regression (T001337)

- [x] Task 0: Bestehenden Regressionstest bestätigen (RED) — `tests/spec/ci-cd.bats`
- [x] Task 1: `@typescript-eslint/no-unused-vars`-Befunde beheben
- [x] Task 2: `@typescript-eslint/no-explicit-any`-Befunde beheben
- [x] Task 3: `noUnusedLocals`/`noUnusedParameters` in `website/tsconfig.json` reaktivieren (Abweichung: nur `noUnusedParameters` aktiviert, siehe Hinweis unten)
- [x] Task 4: ESLint-Regeln auf `error` + `--max-warnings 0` wiederherstellen
- [x] Task 5 (Final): Verifikation + Commit/PR

## Deviation note (Task 3)

`noUnusedLocals: true` was **not** enabled. Empirically confirmed (minimal `.astro` repro) that
Astro's `check` compiler has a false-positive bug: any identifier whose only usage is inside a
frontmatter-level `return <expr>;` (the standard early-redirect-guard pattern, e.g.
`if (!session) return Astro.redirect(getLoginUrl(...));`) is reported as `error ts(6133)
declared but never read`, even though it is genuinely read. This pattern is used in 76 files
across `website/src/pages/` for auth guards. Enabling `noUnusedLocals` turned this into 91 hard
errors in the separate "Astro TypeScript Check" CI job (REQ-ASTRO-TC-004) — a job this plan's
own proposal explicitly states is "Out of scope / not affected". `noUnusedParameters: true` alone
does not trigger the bug (verified) and surfaced exactly one genuine unused parameter
(`src/pages/admin/termine.astro:388`, fixed). Final state: `noUnusedLocals: false`,
`noUnusedParameters: true`, `astro check` → 0 errors/0 warnings/115 hints (all 115 are the
known false-positive pattern, non-blocking).

---

# website-strict-lint-gate-regression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans — execute tasks in
> order, RED before GREEN, verify each gate before moving on.

**Goal:** Die in G-CQ03 (T001204) bereits gebaute, aber durch PR #2296 (commit `02eb3da8`)
wieder entschärfte ESLint-`--max-warnings 0`-Gate in `website/` wiederherstellen — ohne
Verhaltensänderung am ausgelieferten Code, nur Code-Hygiene und Config.

**Architecture:** Kein neues Tooling, keine neuen ESLint-Regeln — ausschließlich die bereits in
`website/eslint.config.js` und `website/tsconfig.json` konfigurierten, aber teils auf `warn`
bzw. `false` gedrosselten Regeln auf ihre ursprünglich beabsichtigte Schärfe zurücksetzen. Die
separate `astro-check`-CI-Job ("Astro TypeScript Check", REQ-ASTRO-TC-004) deckt bereits echte
TS-Fehler ab und bleibt unverändert — dieser Plan fasst sie nicht an.

**Reihenfolge ist bewusst gewählt:** zuerst der Code-Cleanup (Task 1-2, kein Gate-Wechsel,
`main` bleibt während der Umsetzung grün lintbar mit der aktuell laufenden Konfiguration), dann
erst die Konfiguration scharf stellen (Task 3-4). Würde man zuerst die Konfiguration
verschärfen, wäre der Branch zwischen den Schritten lokal nicht mehr grün lintbar, was die
Zwischenverifikation nach jeder Datei erschwert.

**Tech Stack:** ESLint 9 (`typescript-eslint`, bereits installiert), TypeScript 6 (`astro
check`), BATS (bestehender Regressionstest), pnpm (`website/pnpm-lock.yaml`).

## Global Constraints

- Geltungsbereich ausschließlich `website/`. Keine andere Datei außerhalb von `website/`
  anfassen (insbesondere `.github/workflows/ci.yml` NICHT ändern — der Gate-Schritt dort ist
  bereits korrekt verdrahtet, nur das von ihm aufgerufene `pnpm lint`-Script war entschärft).
- Paket-Manager im `website/`-Verzeichnis ist **pnpm** (Lockfile `website/pnpm-lock.yaml`) —
  niemals `npm install` dort ausführen.
- Kein API-/Runtime-Verhalten ändert sich — jede Änderung ist entweder das Entfernen
  nachweislich ungenutzten Codes oder das Verengen eines `any`-Typs auf einen konkreten Typ
  bzw. `unknown` anhand der tatsächlichen Verwendung. Die bestehende Test-Suite
  (`pnpm exec vitest run`) muss nach jedem bearbeiteten Verzeichnis grün bleiben — ein roter
  Test bedeutet, eine "ungenutzte" Variable hatte doch einen Seiteneffekt; in diesem Fall die
  Änderung an dieser Stelle zurücknehmen statt den Test anzupassen.
- `website/eslint.config.js` (.js, S1-Limit 600 Zeilen) und `website/tsconfig.json` (.json,
  S1-ungated) sind bestehende, kleine Dateien — Restbudget unkritisch, keine Split-Maßnahme
  nötig.
- Fälle, in denen die Ersatz-Typisierung für ein `any` nicht eindeutig aus dem unmittelbaren
  Funktionskontext ableitbar ist: nicht raten. Solche Fälle sammeln und vor dem Commit dem
  Menschen vorlegen statt einen falschen Typ zu erfinden.

## File Structure

```
website/eslint.config.js     ← MODIFY: no-explicit-any/no-unused-vars 'warn' → 'error'
website/tsconfig.json        ← MODIFY: noUnusedLocals/noUnusedParameters false → true
website/package.json         ← MODIFY: lint/lint:fix Scripts bekommen --max-warnings 0 zurück
website/src/**                ← MODIFY: nur von ESLint/astro check markierte Dateien
website/tests/**              ← MODIFY: nur von ESLint/astro check markierte Dateien
```

---

## Task 0: Bestehenden Regressionstest bestätigen (RED)

**Files:** keine — der Test existiert bereits (`tests/spec/ci-cd.bats`), wird hier nur erneut
ausgeführt, um den Ausgangszustand zu bestätigen.

### Step 1: Regressionstest laufen lassen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
```

**Expected: FAIL** — die Fälle `"G-CQ03: website package.json has a lint script with
--max-warnings 0"` und `"G-CQ03: ESLint runs clean (0 warnings) when deps are installed"`
müssen rot sein. Run the test to verify it fails before any further change in diesem Branch.
Alle anderen `@test`-Fälle in dieser Datei (G-CD01/G-CD02/G-CI01/G-SIZE04) dürfen bereits grün
sein — sie gehören zu anderen, unabhängigen SSOT-Specs.

---

## Task 1: `@typescript-eslint/no-unused-vars`-Befunde beheben

**Files:** nur Dateien, die im Report aus Step 1 unten auftauchen (Pfade vorab nicht bekannt —
Umfang wird zur Laufzeit über den ESLint-Report ermittelt, nicht hier aufgezählt).

### Step 1: Aktuellen Stand ermitteln

```bash
cd website && pnpm lint --format json > /tmp/lint-report.json
node -e "
const d = require('/tmp/lint-report.json');
let errors=0, warnings=0; const byRule = {};
for (const f of d) { errors+=f.errorCount; warnings+=f.warningCount;
  for (const m of f.messages) byRule[m.ruleId] = (byRule[m.ruleId]||0)+1; }
console.log('errors:', errors, 'warnings:', warnings); console.log(byRule);
"
```

Erwartung: 0 errors, Warnings ganz überwiegend in `@typescript-eslint/no-unused-vars` und
`@typescript-eslint/no-explicit-any`. Taucht eine dritte Regel mit nennenswerter Anzahl auf,
die hier nicht behandelt wird: Umsetzung an dieser Stelle pausieren und dem Menschen vorlegen,
statt eigenmächtig zu entscheiden.

### Step 2: Entscheidungsbaum je Fund anwenden

Für jede Meldung der Regel `@typescript-eslint/no-unused-vars` an `message.line`/`column`:

| Fall | Aktion |
|---|---|
| Named Import, einziger Specifier in der Zeile, nirgends sonst referenziert | Ganze `import`-Zeile löschen |
| Named Import, einer von mehreren Specifiers | Nur diesen Specifier (samt Komma) entfernen |
| Lokale Deklaration ohne weitere Verwendung, Initializer ohne erkennbaren Seiteneffekt (Literal, reiner Property-Read, einfacher interner Funktionsaufruf ohne I/O) | Ganze Zeile löschen |
| Lokale Deklaration, Initializer mit möglichem Seiteneffekt (I/O, DB-Query, Logging, externer Aufruf) | NICHT löschen — Bezeichner zu `_` umbenennen, Aufruf bleibt stehen |
| Funktionsparameter, der nicht der letzte in der Signatur ist | Wird vom Default (`args: 'after-used'`) meist gar nicht gemeldet; taucht er trotzdem auf: zu `_<name>` umbenennen und `argsIgnorePattern: '^_'` zur Regel-Option in `website/eslint.config.js` ergänzen |
| Letzter/einziger Parameter, ersatzlos entfernbar (kein externer Signatur-Constraint) | Aus der Signatur entfernen |
| Letzter/einziger Parameter, durch Interface/Callback-Typ erzwungen | `_`-Präfix + `argsIgnorePattern` wie oben |
| Destrukturierte Variable aus Objekt, nur ein Feld ungenutzt | Nur dieses Feld aus der Destrukturierung entfernen |
| `catch (e)` mit ungenutztem `e` | `catch {` ohne Parameter (gültiges modernes JS/TS) |

Nach jeder Datei sofort prüfen, dass nichts kaputt ist:

```bash
npx tsc --noEmit -p website/tsconfig.json 2>&1 | grep "error TS"
```

### Step 3: Verzeichnisweise verifizieren

Reihenfolge: `website/src/lib/` → `website/src/pages/` → `website/src/components/` →
`website/tests/`. Nach jedem abgeschlossenen Verzeichnis:

```bash
cd website && pnpm lint --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);let w=0,e=0;for(const f of d){w+=f.warningCount;e+=f.errorCount;}console.log('errors:',e,'warnings:',w);})"
pnpm exec vitest run --testTimeout=30000
```

Die Warning-Zahl muss sinken, darf nie steigen. Tests müssen grün bleiben — ein roter Test
bedeutet einen übersehenen Seiteneffekt; Änderung an dieser Stelle zurücknehmen.

---

## Task 2: `@typescript-eslint/no-explicit-any`-Befunde beheben

**Files:** nur Dateien aus dem Report (siehe Task 1, Step 1).

### Step 1: Entscheidungsbaum je Fund anwenden

| Fall | Aktion |
|---|---|
| `catch (e: any)` | Ersetzen durch `catch (e)` (TS strict gibt `e` automatisch `unknown`); Folgenutzung mit `e instanceof Error ? e.message : String(e)` absichern |
| Wert wird nur durchgereicht, nie selbst gelesen (generischer Wrapper/Logging-Helper) | Generisches Typparameter `<T>` einführen, sonst `unknown` |
| Wert aus `JSON.parse(...)` oder `await res.json()`, danach mit `.prop`-Zugriffen gelesen | `unknown` deklarieren, lokales `interface`/`type` mit genau den nachfolgend gelesenen Properties definieren, direkt danach `as <NeuerTypName>` casten mit kurzem Kommentar zur Quelle |
| Mock-HTTP-Response/Mock-DB-Row in einer Testdatei | `Record<string, unknown>` falls nur durchgereicht, sonst lokales `interface Mock<Name>` mit den genutzten Feldern |
| Drittanbieter-Callback ohne Typdeklaration, aber `@types/<paket>` bereits installiert (`grep '"@types/' website/package.json`) | Korrekten Typ aus der Lib importieren |
| Generisches Utility, das absichtlich beliebige Eingaben akzeptiert | Generisches Typparameter `<T>` statt `any` |
| Shape nicht eindeutig aus dem unmittelbaren Funktionskontext ableitbar | Nicht raten — Fall sammeln und vor dem Commit dem Menschen vorlegen |

Nach jeder Datei:

```bash
npx tsc --noEmit -p website/tsconfig.json 2>&1 | grep "error TS"
```

### Step 2: Gesamtstand nach Task 1+2

```bash
cd website && pnpm lint
```

**Erwartung:** `0 problems` (0 errors, 0 warnings) mit der aktuell noch unveränderten
Konfiguration (Task 3/4 verschärfen die Konfiguration erst danach).

---

## Task 3: `noUnusedLocals`/`noUnusedParameters` reaktivieren

**Files:** Modify: `website/tsconfig.json`

### Step 1: Flags umstellen

In `website/tsconfig.json` die beiden Zeilen

```json
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```

ändern zu

```json
    "noUnusedLocals": true,
    "noUnusedParameters": true,
```

### Step 2: Neu auftauchende Hints beheben

```bash
cd website && npx astro check
```

Verbleibende Hints nach derselben Entscheidungstabelle wie Task 1, Step 2 beheben (Astro
meldet unused locals/params als Hints, nicht als Errors — `astro check` selbst bricht dadurch
nicht ab; die eigentliche Durchsetzung erfolgt über die ESLint-Regel `no-unused-vars` aus
Task 1, weshalb hier nur noch wenige Restfälle erwartet werden, die ESLint nicht erfasst hat,
z. B. reine `.astro`-Frontmatter-Spezialfälle).

**Erwartung:** `0 errors, 0 warnings, 0 hints`.

---

## Task 4: ESLint-Regeln auf `error` + `--max-warnings 0` wiederherstellen

**Files:** Modify: `website/eslint.config.js`, `website/package.json`

### Step 1: Regel-Severity in `website/eslint.config.js`

Im `rules`-Block die beiden Zeilen

```js
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
```

ändern zu

```js
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
```

Falls in Task 1 der Fall "Parameter mit `_`-Präfix" aufgetreten ist, stattdessen:

```js
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
```

### Step 2: `--max-warnings 0` in `website/package.json`

```json
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --max-warnings 0 --fix",
```

### Step 3: Verifizieren

```bash
cd website && pnpm lint
```

**Erwartung:** Exit 0, `0 problems`. Taucht hier noch ein Fund auf: Task 1/2 hat einen Fall
übersehen — dorthin zurück, betroffene Datei nach der jeweiligen Tabelle nachbehandeln, dann
hier erneut prüfen.

---

## Task 5 (Final): Verifikation, Freshness, Commit + PR

**Files:** keine neuen — nur Verifikation und Commit der bisherigen Änderungen.

### Step 1: Regressionstest GREEN bestätigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
```

Alle `G-CQ03`-Fälle aus Task 0 müssen jetzt grün sein.

### Step 2: Vollständige Verifikation

```bash
cd website && pnpm lint && npx astro check && pnpm exec vitest run --testTimeout=30000
```

Alle drei müssen grün sein (lint exit 0, astro check 0/0/0, Tests grün).

### Step 3: Pflicht-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei müssen exit 0 liefern. `task freshness:regenerate` regeneriert ggf. generierte
Artefakte (z. B. Test-Inventar) — etwaige Änderungen mitcommitten.

### Step 4: Commit, Push, PR

```bash
git add website/eslint.config.js website/tsconfig.json website/package.json website/src website/tests
git commit -m "fix(website): restore G-CQ03 --max-warnings 0 lint gate [T001337]"
git push -u origin fix/website-strict-lint-gate-regression
bash scripts/preflight-pr-scope.sh "fix(website): restore G-CQ03 --max-warnings 0 lint gate [T001337]"
gh pr create --title "fix(website): restore G-CQ03 --max-warnings 0 lint gate [T001337]" \
  --body "Regression fix: PR #2296 silently dropped the --max-warnings 0 gate that G-CQ03/T001204 shipped. Restores it, fixes the 431 warnings that had accumulated unenforced, and re-enables noUnusedLocals/noUnusedParameters. No CI workflow changes — the existing gate step already calls the right script, it just needed the script itself fixed. tests/spec/ci-cd.bats G-CQ03 cases go from RED to GREEN."
gh pr merge --auto --squash --delete-branch
```

**Definition of Done:**
- `tests/spec/ci-cd.bats` — alle `G-CQ03`-Fälle grün.
- `cd website && pnpm lint` → exit 0, `0 problems`.
- `cd website && npx astro check` → `0 errors, 0 warnings, 0 hints`.
- `website/eslint.config.js`: `no-explicit-any`/`no-unused-vars` auf `error`.
- `website/tsconfig.json`: `noUnusedLocals`/`noUnusedParameters` auf `true`.
- `website/package.json`: `lint`-Script enthält `--max-warnings 0`.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` grün.
- Keine Datei außerhalb von `website/` verändert.
