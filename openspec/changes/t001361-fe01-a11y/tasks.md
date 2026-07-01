---
title: "G-FE01: Accessibility-Tooling einrichten + axe-Core-Baseline"
ticket_id: T001361
domains: [quality, frontend]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: t001361-fe01-a11y (T001361)

- [ ] Task 1: `@axe-core/playwright` installieren + Baseline-Spec anlegen (RED)
- [ ] Task 2: Spec auf alle Kern-Routen + CI/playwright.config.ts-Anbindung
- [ ] Task 3: CI-Anbindung (nightly e2e) + `task a11y:axe` Wrapper + Final Gate

---

# G-FE01 — Accessibility-Tooling einrichten + axe-Core-Baseline

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Automatisierte Accessibility-Prüfung mit axe-core für die Website beider
Marken aufsetzen. `@axe-core/playwright` installiert, Playwright-Spec scannt
Kern-Routen, CI läuft nightly, `task a11y:axe` erlaubt manuelle Vor-Merge-Scans.
Die Baseline (Ist-Violation-Inventar `critical`/`serious`) wird im ersten Lauf
dokumentiert — das Beheben ist NICHT Teil dieses Changes (siehe T001206).

**Architecture:** Test-Driven. Zuerst eine Playwright-Spec (`@axe-core/playwright`),
die Kern-Routen scannt und auf 0 critical/serious prüft (RED — die Verstöße
existieren). Brand-Auswahl rein über `PROD_DOMAIN` (env, keine Domain-Literale
im Code → S3). Die Spec lebt im Playwright-Runner `tests/e2e/` — nicht unter
`website/tests/`, weil `website/vitest.config.ts` (node-Projekt) `tests/**/*.{test,spec}.ts`
einsammelt und eine Playwright-Spec dort vom Vitest-Lauf gegriffen würde und bräche.

**Tech Stack:** Playwright (`@playwright/test`), `@axe-core/playwright`,
Astro/Svelte (Website), Node 22, go-task. CI: GitHub Actions `e2e.yml`.

## Global Constraints

- Gate-Schwelle ist **0** Violations mit `impact ∈ {critical, serious}`.
  `minor`/`moderate` sind nicht Teil dieses Gates.
- **S3 — keine Brand-Domain-Literale im Code.** Brand-Erkennung im Test über
  `process.env.PROD_DOMAIN`.
- Neue Spec `tests/e2e/specs/a11y-axe.spec.ts` bleibt unter 400 Zeilen.
- Jede Code-Änderung muss `task test:changed` bestehen.
- **Dieser Change behebt keine Violations** — nur Tooling + Baseline-Inventar.
  Fixes sind T001206 (g-fe01-a11y-axe-violations) vorbehalten, das diesen Change
  voraussetzt.

## File Structure

```
tests/e2e/package.json                  ← MODIFY: @axe-core/playwright devDep
tests/e2e/specs/a11y-axe.spec.ts        ← CREATE: axe-Scan je Marke/Route
tests/e2e/playwright.config.ts          ← MODIFY: testMatch '**/a11y-axe.spec.ts'
Taskfile.yml                            ← MODIFY: task a11y:axe Wrapper
.github/workflows/e2e.yml               ← MODIFY (cond.): nightly a11y testMatch ggf. erwähnen
```

---

## Task 1: `@axe-core/playwright` installieren + Baseline-Spec anlegen (RED)

**Files:**
- Modify: `tests/e2e/package.json`
- Create: `tests/e2e/specs/a11y-axe.spec.ts`

### Step 1: devDependency installieren

```bash
cd /tmp/wt-T001361-fe01/tests/e2e
npm install --save-dev @axe-core/playwright
```

Erwartung: `@axe-core/playwright` erscheint in `devDependencies`,
`package-lock.json` aktualisiert.

### Step 2: Minimal-Spec anlegen (scannt mentolder `/`)

```bash
cat > /tmp/wt-T001361-fe01/tests/e2e/specs/a11y-axe.spec.ts <<'TS'
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROD_DOMAIN = process.env.PROD_DOMAIN ?? 'mentolder.de';
const isKore = PROD_DOMAIN === 'korczewski.de';

const CORE_ROUTES = isKore
  ? ['/']
  : ['/', '/ueber-mich', '/kontakt', '/coaching'];

const SERIOUS = new Set(['critical', 'serious']);

for (const route of CORE_ROUTES) {
  test(`a11y: ${PROD_DOMAIN} ${route} hat 0 critical/serious`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ''));
    const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`);
    expect(blocking, summary.join('\n')).toHaveLength(0);
  });
}
TS
```

### Step 3: Spec gegen mentolder laufen lassen — Expected fail (Baseline erfassen)

```bash
cd /tmp/wt-T001361-fe01/tests/e2e
WEBSITE_URL=https://web.mentolder.de PROD_DOMAIN=mentolder.de \
  SKIP_DB_PURGE=1 ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website || true
```

**Expected fail:** Mindestens eine Route meldet `critical`/`serious`-Violations.
Die Ausgabe ist die Baseline — dokumentiere sie im Ticket-Kommentar oder in einer
Notiz (`tests/e2e/specs/a11y-baseline.md`, optional). Falls keine Live-Seite
erreichbar ist, gegen lokalen Dev-Server scannen:
`WEBSITE_URL=http://localhost:4321 PROD_DOMAIN=mentolder.de`.

### Step 4: Commit (RED — Baseline erfasst)

```bash
cd /tmp/wt-T001361-fe01
git add tests/e2e/specs/a11y-axe.spec.ts tests/e2e/package.json tests/e2e/package-lock.json
git commit -m "test(a11y): axe-core installiert + Baseline-Spec mentolder Kern-Route [T001361]"
```

---

## Task 2: Spec auf alle Kern-Routen + CI/playwright.config.ts-Anbindung

**Files:**
- Modify: `tests/e2e/specs/a11y-axe.spec.ts`
- Modify: `tests/e2e/playwright.config.ts`

### Step 1: Spec vervollständigen

Die in Task 1 angelegte Spec deckt beide Marken bereits ab. In diesem Schritt
wird die Spec finalisiert: pro Route werden die gemeldeten Regeln strukturiert
ausgegeben (Regel-ID, Impact, Knotenanzahl). Optionaler `A11Y_ROUTES`-Override
(kommagetrennt aus env) für gezielte Einzel-Routen-Scans.

Die Datei bleibt unter 400 Zeilen.

### Step 2: Spec in das `website`-Projekt aufnehmen

In `tests/e2e/playwright.config.ts` im `projects[]`-Eintrag `name: 'website'`
das `testMatch`-Array ergänzen:

```typescript
'**/a11y-axe.spec.ts',   // axe-core a11y-Scan der Kern-Routen (G-FE01, T001361)
```

### Step 3: Baseline-Inventar für beide Marken erfassen

```bash
cd /tmp/wt-T001361-fe01/tests/e2e
for B in "https://web.mentolder.de mentolder.de" "https://web.korczewski.de korczewski.de"; do
  set -- $B
  echo "=== $2 ==="
  WEBSITE_URL=$1 PROD_DOMAIN=$2 SKIP_DB_PURGE=1 \
    ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website || true
done
```

Erwartung: Liste aller `critical`/`serious`-Regeln je Marke/Route. Diese Liste
wird im Ticket-Kommentar als Baseline dokumentiert.

### Step 4: Commit

```bash
cd /tmp/wt-T001361-fe01
git add tests/e2e/specs/a11y-axe.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(a11y): Spec vervollständigt + testMatch-Anbindung beide Marken [T001361]"
```

---

## Task 3: CI-Anbindung (nightly e2e) + `task a11y:axe` Wrapper + Final Gate

**Files:**
- Modify: `Taskfile.yml`
- Modify: `.github/workflows/e2e.yml` (optional — testMatch reicht meist)

### Step 1: `task a11y:axe` Wrapper in Taskfile.yml

```yaml
  a11y:axe:
    desc: "axe-core a11y-Scan der Kern-Routen gegen ENV=mentolder|korczewski"
    dir: tests/e2e
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        case "{{.ENV}}" in
          mentolder)  WEBSITE_URL=https://web.mentolder.de  PROD_DOMAIN=mentolder.de ;;
          korczewski) WEBSITE_URL=https://web.korczewski.de PROD_DOMAIN=korczewski.de ;;
          *) echo "ENV=mentolder|korczewski erforderlich"; exit 1 ;;
        esac
        export WEBSITE_URL PROD_DOMAIN SKIP_DB_PURGE=1
        [ -d node_modules ] || npm ci
        ./node_modules/.bin/playwright install chromium >/dev/null 2>&1 || true
        ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website
```

### Step 2: Nightly-CI verifizieren

Durch das `testMatch` in Task 2 läuft `a11y-axe.spec.ts` automatisch im
nächtlichen `e2e.yml`-Lauf — solange der Workflow `npx playwright test` ohne
Projekt-Filter ruft und das `website`-Projekt einschließt. Verifizieren:

```bash
cd /tmp/wt-T001361-fe01
grep -n "a11y-axe" tests/e2e/playwright.config.ts
```

Erwartung: `a11y-axe.spec.ts` ist im `website`-`testMatch`.

### Step 3: Wrapper smoke-testen

```bash
cd /tmp/wt-T001361-fe01
task a11y:axe ENV=mentolder || true
```

Erwartung: Läuft durch (kann failen, weil Violations existieren — das ist der
RED-Zustand). Hauptsache der Wrapper funktioniert.

### Step 4: Final Gate — test:changed + freshness

```bash
cd /tmp/wt-T001361-fe01
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: alle Exit 0. Falls `freshness:regenerate` Artefakte ändert, diese
mit-committen.

### Step 5: Commit

```bash
cd /tmp/wt-T001361-fe01
git add Taskfile.yml
git add -A
git diff --cached --quiet || git commit -m "ci(a11y): task a11y:axe + nightly e2e + freshnesh-Gate [T001361]"
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-T001361-fe01
task test:changed
task freshness:regenerate
task freshness:check
```

Alle müssen grün sein, bevor der PR auf Auto-Merge gestellt wird.
