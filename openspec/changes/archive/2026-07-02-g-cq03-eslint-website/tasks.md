---
title: "G-CQ03: ESLint in website/ einrichten + Warnings auf 0"
ticket_id: T001204
domains: [cq, lint, website, ci]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: g-cq03-eslint-website (T001204)

- [ ] Task 0: Failing-Test schreiben — BATS `tests/spec/ci-cd.bats` (RED)
- [ ] Task 1: ESLint installieren und Flat-Config `website/eslint.config.js` erstellen
- [ ] Task 2: ESLint ausführen, auto-fixen, alle verbleibenden Warnings/Errors auf 0 bringen
- [ ] Task 3: Fail-closed CI-Gate in `.github/workflows/ci.yml` ergänzen
- [ ] Task 4 (Final): test:changed + freshness:regenerate + freshness:check + Commit/PR

---

# G-CQ03 — ESLint in website/ einrichten + Warnings auf 0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans — execute tasks in
> order, RED before GREEN, verify each gate before moving on.

**Goal:** Eine ESLint-9-Flat-Config für das `website/`-Paket einrichten (TypeScript + Svelte +
Astro), alle Findings auf **0** bringen und ein fail-closed CI-Gate ergänzen, das die Null-
Warnings-Schwelle bei jedem PR erzwingt.

**Architecture:** Flat config (`eslint.config.js`, ESLint 9+) ist der heutige Standard und der
einzige Weg, `eslint-plugin-svelte` v3 und `eslint-plugin-astro` v1 mit `typescript-eslint` v8
sauber zu kombinieren. ESLint läuft auf den drei Quell-Dimensionen über getrennte Config-Blöcke
(TS/JS, Svelte, Astro), damit die Parser sich nicht überschneiden. Warnings werden in EINEM
Change auf 0 gebracht (kein eingefrorenes Schulden-Baseline), weil es noch keinen Linter-
Baseline-Stand gibt — das Ziel ist explizit "0 Warnings", nicht "0 neue Warnings".

**CI-Gate — Architekturentscheidung (Trade-off):** Der Gate-Schritt wird in den **`vitest-website`-Job**
von `ci.yml` eingehängt, NICHT in `offline-tests`. Begründung: `vitest-website` richtet bereits
`pnpm` ein und installiert die `website/`-Dependencies (`pnpm install --frozen-lockfile`) — der
Lint-Schritt wiederverwendet diese Umgebung kostenlos. Der `offline-tests`-Job nutzt dagegen
root-`npm ci` ohne website-Deps; dort einzuhängen würde einen kompletten zweiten pnpm-Install
bedeuten und die CI-Zeit verdoppeln. `vitest-website` ist zudem bereits ein required Branch-
Protection-Check (`Vitest (website)`), wodurch ein Lint-Fehlschlag den Merge automatisch
blockiert — ohne eine neue required-Check-Registrierung in der Branch-Protection. Der Job-Name
`Vitest (website)` bleibt unverändert (Branch-Protection hängt am Namen).

**Tech Stack:** ESLint 9, `typescript-eslint` v8, `eslint-plugin-svelte` v3,
`eslint-plugin-astro` v1, `globals`; pnpm (website-Lockfile ist `website/pnpm-lock.yaml`);
BATS; GitHub Actions.

## Global Constraints

- Paket-Manager im `website/`-Verzeichnis ist **pnpm** (Lockfile `website/pnpm-lock.yaml`) —
  niemals `npm install` dort ausführen, sonst entsteht ein konkurrierendes `package-lock.json`.
- `website/eslint.config.js` ist eine **neue** Datei. S1-Limit für `.js` = 600 Zeilen; die
  Config wird unter **500 Zeilen** geplant (realistisch < 120). Da die Datei neu ist, greift der
  plan-lint-Budget-Check (B1a) nicht.
- `.github/workflows/ci.yml` (.yml) und `website/package.json` (.json) sind **nicht** S1-gated —
  keine Zeilen-Budget-Beschränkung. `tests/spec/ci-cd.bats` (.bats) ist ebenfalls nicht S1-gated.
- ESLint-Befunde werden in den jeweils betroffenen TypeScript-/Svelte-/Astro-Quelldateien
  behoben; reine Whitespace-/Reformatierung unbeteiligter Dateien ist NICHT erlaubt.
- **Peer-Range-Risiko:** `typescript-eslint` deklariert ggf. eine TypeScript-Range unter 6.x und
  `eslint-plugin-svelte` eine Svelte-Range — beim Install die neuesten stabilen Releases pinnen
  und prüfen, dass pnpm ohne `ERR_PNPM_PEER_DEP_ISSUES`-Abbruch auflöst. Falls nötig: minimale
  `pnpm.overrides`/`peerDependencyRules.allowedVersions` in `website/package.json` ergänzen statt
  Plugins zu downgraden.
- Kein API-/Runtime-Verhalten ändert sich — Linting ist build-time-only.

## File Structure

```
website/eslint.config.js          ← NEU: ESLint 9 Flat-Config (TS + Svelte + Astro), < 120 Zeilen
website/package.json              ← MODIFY: devDeps (eslint, typescript-eslint, plugins) + lint-Scripts
website/pnpm-lock.yaml            ← MODIFY: Lockfile-Update durch pnpm add -D
website/src/**                    ← MODIFY: nur die von ESLint markierten Befund-Dateien
.github/workflows/ci.yml          ← MODIFY: Lint-Schritt im vitest-website-Job
tests/spec/ci-cd.bats             ← NEU: RED→GREEN Regression (config exists, lint script, CI gate, 0 warnings)
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/ci-cd.bats`

**Rationale:** Die BATS-Datei ist offline-sicher: die ersten drei Tests prüfen nur
Datei-Existenz und Inhalt (laufen ohne installierte website-Deps in `task test:changed`). Der
vierte Test führt ESLint nur aus, wenn `website/node_modules/.bin/eslint` vorhanden ist, und
überspringt sonst — die echte Null-Warnings-Durchsetzung passiert im CI-Job (wo pnpm installiert).

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-eslint-website/tests/spec/ci-cd.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/g-cq03-eslint-website/proposal.md
# G-CQ03: ESLint in website/ + 0 warnings + fail-closed CI-Gate

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ03: website/eslint.config.js exists" {
  [ -f "$REPO_ROOT/website/eslint.config.js" ]
}

@test "G-CQ03: website package.json has a lint script with --max-warnings 0" {
  run jq -r '.scripts.lint // ""' "$REPO_ROOT/website/package.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"eslint"* ]]
  [[ "$output" == *"--max-warnings 0"* ]]
}

@test "G-CQ03: ci.yml wires an ESLint gate step" {
  grep -Eq 'eslint|lint' "$REPO_ROOT/.github/workflows/ci.yml"
  grep -q -- '--max-warnings 0' "$REPO_ROOT/.github/workflows/ci.yml"
}

@test "G-CQ03: ESLint runs clean (0 warnings) when deps are installed" {
  if [ ! -x "$REPO_ROOT/website/node_modules/.bin/eslint" ]; then
    skip "website deps not installed in this context — enforced by CI vitest-website job"
  fi
  run bash -c "cd '$REPO_ROOT/website' && ./node_modules/.bin/eslint . --max-warnings 0"
  [ "$status" -eq 0 ]
}
BATS
```

### Step 2: Test laufen lassen — RED bestätigen

```bash
cd /tmp/wt-eslint-website && bats tests/spec/ci-cd.bats
```

**Expected: FAIL** — `website/eslint.config.js` existiert noch nicht, das `lint`-Script fehlt
und `ci.yml` hat kein Gate. Run the test to verify it fails before any implementation exists.
Mindestens die ersten drei `@test`-Fälle müssen rot sein (RED).

---

## Task 1: ESLint installieren und Flat-Config erstellen

**Files:**
- Modify: `website/package.json`, `website/pnpm-lock.yaml`
- Create: `website/eslint.config.js`

### Step 1: Dev-Dependencies installieren (pnpm, im website/-Verzeichnis)

```bash
cd /tmp/wt-eslint-website/website
pnpm add -D eslint typescript-eslint eslint-plugin-svelte eslint-plugin-astro \
  svelte-eslint-parser astro-eslint-parser globals
```

- Neueste stabile Releases nehmen. Bei `ERR_PNPM_PEER_DEP_ISSUES` (TS 6 / Svelte 5 Ranges):
  `pnpm.peerDependencyRules.allowedVersions` in `package.json` minimal erweitern, Plugins
  NICHT downgraden. Install muss reproduzierbar sein (Lockfile committen).

### Step 2: lint-Scripts in package.json ergänzen

```jsonc
// website/package.json -> "scripts"
"lint": "eslint . --max-warnings 0",
"lint:fix": "eslint . --max-warnings 0 --fix"
```

### Step 3: Flat-Config schreiben (website/eslint.config.js)

Aufbau (getrennte Config-Blöcke pro Quell-Dimension):

```js
// website/eslint.config.js (Skizze — Zielgröße < 120 Zeilen)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'node_modules/', '**/*.generated.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  ...astro.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Svelte-Dateien brauchen den svelte-Parser mit TS als Sub-Parser:
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
);
```

- `ignores` deckt Build-Output (`dist/`, `.astro/`) und generierte Artefakte ab, damit der
  Linter nur echten Quellcode prüft.
- Datei unter 500 Zeilen halten (Ist-Ziel < 120).

### Step 3-verify: Erste zwei BATS-Tests werden grün

```bash
cd /tmp/wt-eslint-website && bats tests/spec/ci-cd.bats
```

Die Tests "config exists" und "lint script" müssen jetzt grün sein; der ESLint-Lauf-Test läuft
nach `pnpm install` mit (oder bleibt skip, falls Deps nicht im BATS-Kontext).

---

## Task 2: ESLint ausführen, auto-fixen, alle Findings auf 0 bringen

**Files:**
- Modify: `website/src/**` (nur von ESLint markierte Dateien)

### Step 1: Auto-fix laufen lassen

```bash
cd /tmp/wt-eslint-website/website && pnpm exec eslint . --fix
```

### Step 2: Verbleibende Findings sichten und gruppieren

```bash
cd /tmp/wt-eslint-website/website && pnpm exec eslint . --format stylish || true
```

- Befunde nach Regel gruppieren (z.B. `no-unused-vars`, `no-undef`,
  `@typescript-eslint/no-explicit-any`, Svelte-/Astro-spezifische Regeln).
- Echte Bugs (ungenutzte Variablen, tote Pfade, falsche Reaktivität) korrigieren.
- Für bewusste Ausnahmen: zeilengenaue `// eslint-disable-next-line <rule> -- <Begründung>`
  mit Begründung — NIE pauschales Disable ganzer Dateien.
- Falls eine Recommended-Regel für dieses Projekt unpassend laut ist: gezielt in
  `eslint.config.js` als `'off'`/`'warn'` justieren und kurz kommentieren (statt flächig
  `disable`-Kommentare zu streuen).

### Step 3: Null-Warnings-Schwelle erreichen

```bash
cd /tmp/wt-eslint-website/website && pnpm exec eslint . --max-warnings 0; echo "exit=$?"
```

**Akzeptanz:** `exit=0` — keine Errors, keine Warnings.

---

## Task 3: Fail-closed CI-Gate in ci.yml ergänzen

**Files:**
- Modify: `.github/workflows/ci.yml`

### Step 1: Lint-Schritt in den vitest-website-Job einhängen

Im Job `vitest-website` (Name bleibt `Vitest (website)` — Branch-Protection hängt am Namen),
nach dem Schritt "Install website dependencies", einen neuen Schritt ergänzen:

```yaml
      - name: ESLint (website, 0 warnings gate)
        run: |
          cd website
          pnpm exec eslint . --max-warnings 0
```

- Der Schritt läuft VOR oder NACH dem vitest-Schritt — Reihenfolge egal, beide müssen grün
  sein, damit der Check `Vitest (website)` grün wird.
- Keine `continue-on-error`-Klausel: das Gate ist fail-closed.

### Step 2: BATS-Gate-Test verifizieren (grün)

```bash
cd /tmp/wt-eslint-website && bats tests/spec/ci-cd.bats
```

Der Test "ci.yml wires an ESLint gate step" muss jetzt grün sein.

---

## Task 4 (Final): Verifikation, Freshness, Commit + PR

**Files:**
- Keine neuen — nur Verifikation und Commit der bisherigen Änderungen.

### Step 1: Vollständige BATS-Suite für diese Spec grün

```bash
cd /tmp/wt-eslint-website && bats tests/spec/ci-cd.bats
```

Alle vier `@test`-Fälle grün (ESLint-Lauf-Test grün, sofern Deps installiert).

### Step 2: Pflicht-Gates ausführen

```bash
cd /tmp/wt-eslint-website
task test:changed
task freshness:regenerate
task freshness:check
```

- `task test:changed` muss grün sein.
- `task freshness:regenerate` regeneriert generierte Artefakte; etwaige Änderungen committen.
- `task freshness:check` muss grün sein (fail-closed Quality-Gate).

### Step 3: Commit + Push + PR + Auto-Merge

```bash
cd /tmp/wt-eslint-website
git add website/eslint.config.js website/package.json website/pnpm-lock.yaml \
        website/src .github/workflows/ci.yml tests/spec/ci-cd.bats \
        openspec/changes/g-cq03-eslint-website/
git commit -m "feat(website): add ESLint flat-config + 0-warnings CI gate [T001204]"
git push -u origin feature/eslint-website
gh pr create --fill --base main
gh pr merge --squash --auto
```

**Definition of Done:**
- `website/eslint.config.js` vorhanden, `lint`-Script in `package.json`.
- `pnpm exec eslint . --max-warnings 0` exit 0 im `website/`-Verzeichnis.
- CI-Gate im `vitest-website`-Job aktiv (fail-closed).
- `tests/spec/ci-cd.bats` vollständig grün.
- `task test:changed` und `task freshness:check` grün.
