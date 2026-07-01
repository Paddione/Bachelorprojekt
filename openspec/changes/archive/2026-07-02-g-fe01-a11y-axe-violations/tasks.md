---
title: "G-FE01: a11y axe-Violations (Kern-Routen beider Marken) auf 0 crit/serious"
ticket_id: T001206
domains: [fe, a11y, accessibility, website]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: g-fe01-a11y-axe-violations (T001206)

- [x] Task 0: Failing a11y-Spec + `@axe-core/playwright` devDep (RED)
- [x] Task 1: a11y-Suite ausbauen — alle Kern-Routen, beide Marken, testMatch
- [ ] Task 2: mentolder Kern-Routen — critical/serious Violations beheben
- [ ] Task 3: korczewski Kore-Homepage — critical/serious Violations beheben
- [ ] Task 4: CI-Anbindung — nightly e2e + `task a11y:axe` Wrapper
- [ ] Task 5: Final — test:changed + freshness:regenerate + freshness:check + PR

---

# G-FE01 — a11y axe-Violations (Kern-Routen beider Marken) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** axe-core-Violations der Impact-Klassen `critical` und `serious` auf
**0** für alle Kern-Routen beider Marken (`web.mentolder.de`,
`web.korczewski.de`). WCAG 2.1 AA / BFSG-konform, automatisiert per Playwright.

**Architecture:** Test-Driven. Zuerst eine Playwright-Spec, die mit
`@axe-core/playwright` die Kern-Routen scannt und auf 0 critical/serious prüft
(RED — die Verstöße existieren). Brand-Auswahl rein über `PROD_DOMAIN` (env,
keine Domain-Literale im Code → S3). Danach die gemeldeten Verstöße marken-weise
beheben (Task 2 mentolder, Task 3 korczewski), bevorzugt netto-neutral an
bestehenden Elementen (Attribute statt neuer Zeilen). Die Spec lebt im
Playwright-Runner `tests/e2e/` — **nicht** unter `website/tests/`, weil
`website/vitest.config.ts` (node-Projekt) `tests/**/*.{test,spec}.ts` einsammelt
und eine Playwright-Spec dort vom Vitest-Lauf gegriffen würde und bräche.

**Tech Stack:** Playwright 1.6x (`@playwright/test`), `@axe-core/playwright`,
Astro 6.x, Svelte 5.x, Node 22, go-task. CI: GitHub Actions `e2e.yml`
(nightly, `website`-Projekt, beide Marken).

## Global Constraints

- Gate-Schwelle: **0** Violations mit `impact ∈ {critical, serious}` je
  Kern-Route. `minor`/`moderate` sind nicht Teil dieses Gates.
- **S3 — keine Brand-Domain-Literale im Code.** Brand-Erkennung im Test über
  `process.env.PROD_DOMAIN` / `process.env.WEBSITE_URL`; Routen-Listen
  env-abgeleitet.
- **S1 — `Navigation.svelte` hat Restbudget 0** (538 Zeilen, Baseline 538):
  a11y-Fixes dort **netto-neutral** (Attribute an bestehende Tags, keine neuen
  Zeilen) oder gar nicht. Alle anderen berührten Dateien haben Luft (Tabelle
  unten).
- Die neue Spec `tests/e2e/specs/a11y-axe.spec.ts` bleibt unter 400 Zeilen
  (.ts-Limit 600).
- Jede Code-Änderung muss `task test:changed` bestehen; nach Abschluss
  `task freshness:regenerate` + `task freshness:check`.
- Fixes nur an den von axe **tatsächlich** gemeldeten Stellen — keine
  spekulativen Umbauten. Die Komponenten-Liste unten ist die Kandidatenmenge
  der Kern-Routen; berührt wird nur, was axe flaggt.

## File Structure

```
tests/e2e/specs/a11y-axe.spec.ts        ← NEU: axe-Scan je Marke/Route
tests/e2e/package.json                  ← MODIFY: @axe-core/playwright devDep
tests/e2e/playwright.config.ts          ← MODIFY: testMatch '**/a11y-axe.spec.ts'
Taskfile.yml                            ← MODIFY: task a11y:axe Wrapper
website/src/layouts/Layout.astro        ← MODIFY (cond.): lang/title/landmarks
website/src/components/Navigation.svelte ← MODIFY (cond., netto-neutral): button-name/aria
website/src/components/Hero.svelte       ← MODIFY (cond.): Kontrast/alt
website/src/components/Footer.astro      ← MODIFY (cond.): link-name/Kontrast
website/src/components/ServiceRow.svelte ← MODIFY (cond.): alt/Kontrast
website/src/components/FAQ.svelte        ← MODIFY (cond.): aria/Heading-Order
website/src/components/CallToAction.svelte ← MODIFY (cond.): button-name/Kontrast
website/src/components/WhyMe.svelte      ← MODIFY (cond.): Kontrast/alt
website/src/components/kore/KoreHomepage.svelte ← MODIFY (cond.): Kore-Homepage Fixes
```

### S1 Pre-flight — Restbudget je berührter Datei (Wide-Format, nicht-claim)

| Datei | Ext/Limit (+Baseline) | aktuell | frei | Strategie |
|---|---|---|---|---|
| `tests/e2e/specs/a11y-axe.spec.ts` | .ts/600 (neu) | 0 | <400 | Neuanlage, kompakt |
| `tests/e2e/playwright.config.ts` | .ts/600 | 334 | 266 | +1 testMatch-Zeile |
| `website/src/layouts/Layout.astro` | .astro/400 | 104 | 296 | Attribute |
| `website/src/components/Navigation.svelte` | .svelte/500 (baseline 538) | 538 | 0 | netto-neutral |
| `website/src/components/Hero.svelte` | .svelte/500 | 274 | 226 | Attribute |
| `website/src/components/Footer.astro` | .astro/400 | 151 | 249 | Attribute |
| `website/src/components/ServiceRow.svelte` | .svelte/500 | 305 | 195 | Attribute |
| `website/src/components/FAQ.svelte` | .svelte/500 | 175 | 325 | Attribute |
| `website/src/components/CallToAction.svelte` | .svelte/500 | 206 | 294 | Attribute |
| `website/src/components/WhyMe.svelte` | .svelte/500 | 223 | 277 | Attribute |
| `website/src/components/kore/KoreHomepage.svelte` | .svelte/500 | 389 | 111 | Attribute/Kontrast |

`tests/e2e/package.json` und `Taskfile.yml`/`.github/workflows/e2e.yml` sind
nicht S1-gated (.json/.yml).

---

## Task 0: Failing a11y-Spec + `@axe-core/playwright` devDep (RED)

**Files:**
- Modify: `tests/e2e/package.json`
- Create: `tests/e2e/specs/a11y-axe.spec.ts`

### Step 1: devDependency installieren

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
npm install --save-dev @axe-core/playwright
```

Erwartung: `@axe-core/playwright` erscheint in `devDependencies`,
`package-lock.json` aktualisiert.

### Step 2: Minimal-Spec anlegen (scannt mentolder `/`)

```bash
cat > /tmp/wt-a11y-axe-violations/tests/e2e/specs/a11y-axe.spec.ts <<'TS'
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Brand-Erkennung env-basiert (S3: keine Domain-Literale im Code).
const PROD_DOMAIN = process.env.PROD_DOMAIN ?? 'mentolder.de';
const isKore = PROD_DOMAIN === 'korczewski.de';

// Kern-Routen je Marke.
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

### Step 3: Spec gegen mentolder laufen lassen — Expected fail

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
WEBSITE_URL=https://web.mentolder.de PROD_DOMAIN=mentolder.de \
  SKIP_DB_PURGE=1 ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website
```

**Expected fail:** Mindestens eine Route meldet `critical`/`serious`-Violations
(`> 0`) → der Test ist RED. Die Fehlermeldung listet `<rule-id> (impact) xN` je
verletzter Regel. Diese Liste ist die Arbeitsgrundlage für Task 2/3. (Wenn die
Live-Seite nicht erreichbar ist, alternativ gegen einen lokalen Dev-Server
`WEBSITE_URL=http://localhost:4321 PROD_DOMAIN=mentolder.de` scannen.)

### Step 4: Commit (RED)

```bash
cd /tmp/wt-a11y-axe-violations
git add tests/e2e/specs/a11y-axe.spec.ts tests/e2e/package.json tests/e2e/package-lock.json
git commit -m "test(a11y): failing axe-core scan für mentolder Kern-Route [T001206]"
```

---

## Task 1: a11y-Suite ausbauen — alle Kern-Routen, beide Marken, testMatch

**Files:**
- Modify: `tests/e2e/specs/a11y-axe.spec.ts`
- Modify: `tests/e2e/playwright.config.ts`

### Step 1: Spec vervollständigen

Die in Task 0 angelegte `CORE_ROUTES`-Logik deckt beide Marken bereits ab
(korczewski → `['/']`, sonst der mentolder-Satz). In diesem Schritt:

- pro Route die gemeldeten Regeln strukturiert ausgeben (Regel-ID, Impact,
  Knotenanzahl, betroffener Selektor) — erleichtert das Fixen.
- optionalen `A11Y_ROUTES`-Override (kommagetrennt aus env) ergänzen, damit man
  während des Fixens gezielt eine einzelne Route scannen kann.

Die Datei bleibt unter 400 Zeilen (Restbudget gemäß Pre-flight-Tabelle).

### Step 2: Spec in das `website`-Projekt aufnehmen

In `tests/e2e/playwright.config.ts` im `projects[]`-Eintrag `name: 'website'`
das `testMatch`-Array um einen Eintrag ergänzen:

```typescript
'**/a11y-axe.spec.ts',   // axe-core a11y-Scan der Kern-Routen (G-FE01, T001206)
```

Damit läuft die Spec automatisch im nächtlichen `e2e.yml` gegen beide Marken
(siehe Task 4).

### Step 3: Beide Marken einmal scannen — Violation-Inventar erstellen

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
for B in "https://web.mentolder.de mentolder.de" "https://web.korczewski.de korczewski.de"; do
  set -- $B
  echo "=== $2 ==="
  WEBSITE_URL=$1 PROD_DOMAIN=$2 SKIP_DB_PURGE=1 \
    ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website || true
done
```

Erwartung: Liste aller `critical`/`serious`-Regeln je Marke/Route (z. B.
`color-contrast`, `image-alt`, `button-name`, `link-name`, `html-has-lang`,
`document-title`, `aria-required-attr`). Diese Liste in den Task-2/3-Notizen
festhalten.

### Step 4: Commit

```bash
cd /tmp/wt-a11y-axe-violations
git add tests/e2e/specs/a11y-axe.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(a11y): axe-suite über beide Marken + testMatch-Anbindung [T001206]"
```

---

## Task 2: mentolder Kern-Routen — critical/serious Violations beheben

**Files (nur die von axe geflaggten):**
- Modify: `website/src/layouts/Layout.astro`
- Modify: `website/src/components/Navigation.svelte` (netto-neutral)
- Modify: `website/src/components/Hero.svelte`
- Modify: `website/src/components/Footer.astro`
- Modify: `website/src/components/ServiceRow.svelte`
- Modify: `website/src/components/FAQ.svelte`
- Modify: `website/src/components/CallToAction.svelte`
- Modify: `website/src/components/WhyMe.svelte`

### Step 1: Mapping Regel → Datei

Aus dem Violation-Inventar (Task 1) jede Regel der verursachenden Komponente
zuordnen. Übliche Zuordnung:

- `html-has-lang` / `document-title` / `landmark-*` → `Layout.astro`
- `button-name` / `aria-expanded` am Mobil-Menü → `Navigation.svelte`
- `image-alt` / `role-img-alt` → die Komponente mit dem `<img>`/Icon
- `color-contrast` → CSS/Tailwind-Klasse der jeweiligen Komponente
- `link-name` → Icon-Links im `Footer.astro`

### Step 2: Fixes anwenden (bevorzugt netto-neutral)

Regelbezogene Standard-Fixes:

- `html-has-lang`: `<html lang="de">` in `Layout.astro` sicherstellen.
- `document-title`: jede Route hat einen nicht-leeren `<title>` (über das
  bestehende SEO-Title-Prop des Layouts).
- `button-name`: Icon-Buttons (Mobil-Menü) erhalten `aria-label="Menü"` und
  `aria-expanded={open}` **an die bestehende `<button>`-Zeile** — in
  `Navigation.svelte` netto-neutral (kein Zeilenzuwachs).
- `image-alt`: dekorative Bilder `alt=""`, informative ein beschreibendes
  `alt`.
- `color-contrast`: Tailwind-Farbklasse auf eine kontrastreichere Variante
  heben (Wert in bestehender Klasse ersetzen → netto-neutral).
- `link-name`: Icon-Links erhalten `aria-label` mit dem Ziel.

### Step 3: Gezielt re-scannen bis grün

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
WEBSITE_URL=http://localhost:4321 PROD_DOMAIN=mentolder.de SKIP_DB_PURGE=1 \
  ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website
```

(Lokaler Dev-Server `cd website && pnpm dev` in einem zweiten Terminal; setzt
eine erreichbare `bachelorprojekt`-DB voraus, vgl. `website/CLAUDE.md`.)

Erwartung: alle mentolder-Routen melden 0 critical/serious.

### Step 4: TypeScript-/Svelte-Check + Tests

```bash
cd /tmp/wt-a11y-axe-violations/website && pnpm run check 2>&1 | grep -iE "error" | head -20
cd /tmp/wt-a11y-axe-violations && task test:changed
```

Erwartung: 0 TypeScript-Fehler, `test:changed` Exit 0.

### Step 5: Commit

```bash
cd /tmp/wt-a11y-axe-violations
git add website/src/
git commit -m "fix(a11y): mentolder Kern-Routen — 0 critical/serious axe-Violations [T001206]"
```

---

## Task 3: korczewski Kore-Homepage — critical/serious Violations beheben

**Files (nur die von axe geflaggten):**
- Modify: `website/src/components/kore/KoreHomepage.svelte`
- Modify: `website/src/layouts/Layout.astro` (falls Layout-Verstoß marken-übergreifend)

### Step 1: Kore-Homepage scannen

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
WEBSITE_URL=https://web.korczewski.de PROD_DOMAIN=korczewski.de SKIP_DB_PURGE=1 \
  ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website || true
```

### Step 2: Fixes in `KoreHomepage.svelte`

Die Kore-Homepage nutzt ein eigenes Design-System (`components/kore/`). Übliche
Verstöße hier: `color-contrast` (Kore-Farbpalette), `image-alt`,
`heading-order`. Fixes regelbezogen anwenden (Restbudget 111 Zeilen — Attribute
und Klassen-Ersetzungen reichen aus). Layout-übergreifende Verstöße (`lang`,
`title`) wurden bereits in Task 2 in `Layout.astro` adressiert.

### Step 3: Re-scan bis grün

```bash
cd /tmp/wt-a11y-axe-violations/tests/e2e
WEBSITE_URL=http://localhost:4321 PROD_DOMAIN=korczewski.de SKIP_DB_PURGE=1 \
  BRAND_ID=korczewski ./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website
```

Erwartung: `/` (Kore) meldet 0 critical/serious.

### Step 4: Check + Tests + Commit

```bash
cd /tmp/wt-a11y-axe-violations/website && pnpm run check 2>&1 | grep -iE "error" | head -20
cd /tmp/wt-a11y-axe-violations && task test:changed
git add website/src/
git commit -m "fix(a11y): korczewski Kore-Homepage — 0 critical/serious axe-Violations [T001206]"
```

---

## Task 4: CI-Anbindung — nightly e2e + `task a11y:axe` Wrapper

**Files:**
- Modify: `Taskfile.yml`

### Step 1: Nightly-Anbindung verifizieren (kein Workflow-Edit nötig)

Durch das in Task 1 ergänzte `testMatch` läuft `a11y-axe.spec.ts` automatisch im
`website`-Projekt — also im nächtlichen `e2e.yml`-Lauf gegen beide Marken
(`web.mentolder.de`, `web.korczewski.de`). Das ist die CI-Abdeckung; `e2e.yml`
braucht keine Änderung. Verifizieren:

```bash
cd /tmp/wt-a11y-axe-violations
grep -n "a11y-axe" tests/e2e/playwright.config.ts
grep -n "website:\|playwright test" .github/workflows/e2e.yml | head
```

Erwartung: `a11y-axe.spec.ts` ist im `website`-`testMatch`; `e2e.yml` ruft
`npx playwright test` ohne Projekt-Filter → die Spec ist eingeschlossen.

### Step 2: Lokaler/manueller Wrapper `task a11y:axe`

In `Taskfile.yml` einen Task ergänzen, der nur die a11y-Spec gegen eine Marke
fährt (für die Vor-Merge-Verifikation):

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

### Step 3: Wrapper smoke-testen

```bash
cd /tmp/wt-a11y-axe-violations
task a11y:axe ENV=mentolder
task a11y:axe ENV=korczewski
```

Erwartung: beide Exit 0 (0 critical/serious nach Task 2/3).

### Step 4: Commit

```bash
cd /tmp/wt-a11y-axe-violations
git add Taskfile.yml
git commit -m "ci(a11y): task a11y:axe Wrapper + nightly e2e-Anbindung [T001206]"
```

---

## Task 5: Final — test:changed + freshness + PR

**Files:** keine neuen — Verifikation + Release.

### Step 1: Vollständige Gate-Kette lokal

```bash
cd /tmp/wt-a11y-axe-violations
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: alle Exit 0. Falls `freshness:regenerate` Artefakte ändert, diese
mit-committen.

### Step 2: a11y-Endabnahme beide Marken

```bash
cd /tmp/wt-a11y-axe-violations
task a11y:axe ENV=mentolder
task a11y:axe ENV=korczewski
```

Erwartung: 0 critical/serious auf allen Kern-Routen beider Marken.

### Step 3: Freshness-Artefakte committen (falls geändert)

```bash
cd /tmp/wt-a11y-axe-violations
git add -A
git diff --cached --quiet || git commit -m "chore(a11y): freshness-Artefakte nach G-FE01 aktualisieren [T001206]"
```

### Step 4: PR-Scope-Preflight + Push + PR + Auto-Merge

```bash
cd /tmp/wt-a11y-axe-violations
bash scripts/preflight-pr-scope.sh "fix(a11y): G-FE01 — Kern-Routen beider Marken auf 0 critical/serious axe-Violations [T001206]" || { echo "preflight failed"; exit 1; }
git push -u origin feature/a11y-axe-violations
gh pr create \
  --title "fix(a11y): G-FE01 — Kern-Routen beider Marken auf 0 critical/serious axe-Violations [T001206]" \
  --base main \
  --body "Closes T001206. @axe-core/playwright-Scan der Kern-Routen (beide Marken), critical/serious Violations behoben, nightly e2e + task a11y:axe angebunden."
gh pr merge --auto --squash --delete-branch
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-a11y-axe-violations
task test:changed
task freshness:regenerate
task freshness:check
task a11y:axe ENV=mentolder
task a11y:axe ENV=korczewski
```

Alle müssen grün sein (insbesondere 0 critical/serious je Marke), bevor der PR
auf Auto-Merge gestellt wird.
