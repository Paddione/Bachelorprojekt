---
title: Korczewski Kore Homepage + Project Timeline — Implementation Plan
domains: [website]
status: completed
pr_number: null
---

# Korczewski Kore Homepage + Project Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared korczewski/mentolder homepage on `web.korczewski.de` with a unique Kore-design-system product showcase, backed by a PR-driven project timeline stored in the existing `bachelorprojekt` tracking-DB schema.

**Architecture:** Five sequential phases, each independently deployable. (1) Library sync — copy the Kore design bundle into `art-library/sets/korczewski/` and reverse-engineer a parallel kit for mentolder. (2) Schema — add `bachelorprojekt.features` and `bugs.bug_tickets.fixed_in_pr`. (3) PR automation — GitHub Action commits a JSON line per merged PR; a cluster CronJob ingests it (avoids exposing shared-db). (4) Retroactive backfill of historical PRs. (5) Korczewski homepage rebuilt as Astro+Svelte components matching the Kore `Website.jsx` reference, branched in `index.astro` on `BRAND_ID === 'korczewski'`. Mentolder is unaffected throughout.

**Tech Stack:** Bash + `tar`/`cp` for library sync; PostgreSQL 16 (shared-db) for schema; Node.js 20 (`scripts/track-pr.mjs`) for PR parsing; GitHub Actions YAML; Kubernetes CronJob (psql); Astro 5 + Svelte 5 + TypeScript for homepage; Playwright for E2E; existing tasks (`task workspace:deploy`, `task website:deploy`, `task workspace:db:start`).

**Reference inputs (do NOT modify):**
- `/tmp/anthropic-design/extracted/kore-design-system/` — full Kore bundle (assets, styles, ui_kits, preview, chats, SKILL.md, README)
- `art-library/sets/korczewski/` — current state (characters/props/terrain only)
- `art-library/sets/mentolder/` — current state (same shape as korczewski)
- `website/public/brand/{korczewski,mentolder}/colors_and_type.css` — live brand tokens
- `website/src/pages/index.astro` — current shared homepage
- `website/src/components/{Hero,WhyMe,ServiceRow,FAQ,CallToAction,Process,SlotWidget,Portrait}.{svelte,astro}` — current shared components
- `deploy/tracking/init.sql` — current tracking-DB schema
- `k3d/website-schema.yaml` — bug_tickets schema migration (around line 451)
- `website/src/lib/website-db.ts` — bug_tickets queries

**Spec:** `docs/superpowers/specs/2026-05-05-korczewski-kore-homepage-design.md`

---

## Phase 1 — Library Sync (korczewski + mentolder mirror)

Goal: deliver `art-library/sets/korczewski/` and `art-library/sets/mentolder/` as self-contained brand kits a future agent could rebuild from. No runtime impact.

### Task 1.1: Stage the Kore bundle in the art-library

**Files:**
- Create: `art-library/sets/korczewski/portfolio/` (subfolder for existing fantasy assets)
- Move: existing `art-library/sets/korczewski/{characters,props,terrain,logos,manifest.json,tokens.css,CREDITS.md}` into `portfolio/`
- Copy: full `/tmp/anthropic-design/extracted/kore-design-system/` tree into the kit root

- [ ] **Step 1: Verify Kore bundle is still extracted**

```bash
ls /tmp/anthropic-design/extracted/kore-design-system/project/ui_kits/website/Website.jsx
```

If missing, re-extract:

```bash
mkdir -p /tmp/anthropic-design/extracted
cd /tmp/anthropic-design && gunzip -c design.gz > design.bin && tar -xf design.bin -C extracted
```

- [ ] **Step 2: Move existing korczewski portfolio assets aside**

```bash
cd /home/patrick/Bachelorprojekt/art-library/sets/korczewski
mkdir -p portfolio
mv characters props terrain logos manifest.json tokens.css CREDITS.md portfolio/
ls
```

Expected: only `portfolio/` remains.

- [ ] **Step 3: Copy Kore bundle artifacts into the kit root**

```bash
SRC=/tmp/anthropic-design/extracted/kore-design-system
DST=/home/patrick/Bachelorprojekt/art-library/sets/korczewski

cp -r "$SRC/project/assets"                 "$DST/assets"
cp -r "$SRC/project/styles"                 "$DST/styles"
cp -r "$SRC/project/ui_kits"                "$DST/ui_kits"
cp -r "$SRC/project/preview"                "$DST/preview"
cp -r "$SRC/project/portfolio"              "$DST/portfolio_design"
cp    "$SRC/project/colors_and_type.css"    "$DST/colors_and_type.css"
cp    "$SRC/project/SKILL.md"               "$DST/SKILL.md"
cp    "$SRC/project/README.md"              "$DST/README.md"
cp -r "$SRC/chats"                          "$DST/chats"
ls "$DST"
```

Expected: `assets chats colors_and_type.css portfolio portfolio_design preview README.md SKILL.md styles ui_kits`.

- [ ] **Step 4: Write a top-level kit README**

Overwrite `art-library/sets/korczewski/README.md`:

```markdown
# Kore — korczewski brand kit

Complete brand kit for korczewski.de (the **Kore.** consultancy/cluster brand). Imported from Anthropic Design bundle `BqxMXwsTiIaYMbqOsCwrOg` on 2026-05-05.

## Layout

- `colors_and_type.css` — design tokens
- `styles/website.css` — marketing-page sections
- `styles/app.css` — app shell + paper documents
- `assets/` — logos, k8s-wheel, topology illustration
- `ui_kits/website/` — reference HTML+JSX of the Kore.com marketing page
- `ui_kits/app/` — reference HTML+JSX of the in-product app shell
- `ui_kits/documents/` — invoice / contract / newsletter / questionnaire HTML
- `preview/` — 22 component preview cards
- `chats/` — original Claude Design conversation transcripts
- `SKILL.md` — agent skill manifest
- `portfolio/` — virtual-tabletop characters/props/terrain (separate side-project)
- `portfolio_design/` — JSX source of the portfolio assets

## Brand quick reference

- Aubergine ink (`#120D1C`), plasma lime (`#C8F76A`), cyan (`#5BD4D0`)
- Instrument Serif (italic for emphasis), Geist body, JetBrains Mono labels
- Film grain on every dark surface; no emoji; line icons only
```

- [ ] **Step 5: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt
git add art-library/sets/korczewski
git commit -m "chore(art-library): import full Kore design bundle into korczewski set

Adds website + app UI kits, document templates, preview cards, chats,
SKILL.md, k8s-wheel + topology SVGs, and the canonical colors_and_type.css.
Existing characters/props/terrain moved under portfolio/ as they belong
to a separate tabletop side-project.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Write korczewski-kore manifest.json

**Files:**
- Create: `art-library/sets/korczewski/manifest.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "version": "2026-05-05",
  "brand": "korczewski-kore",
  "source": "anthropic-design-BqxMXwsTiIaYMbqOsCwrOg",
  "tokens": {
    "ink-900": "#120D1C",
    "copper":  "#C8F76A",
    "teal":    "#5BD4D0"
  },
  "fonts": ["Instrument Serif", "Geist", "JetBrains Mono"],
  "stylesheets": ["colors_and_type.css", "styles/website.css", "styles/app.css"],
  "assets": [
    { "id": "logo-mark",         "kind": "logo",         "files": { "svg": "assets/logo-mark.svg" } },
    { "id": "logo-lockup-dark",  "kind": "logo",         "files": { "svg": "assets/logo-lockup-dark.svg" } },
    { "id": "logo-lockup-light", "kind": "logo",         "files": { "svg": "assets/logo-lockup-light.svg" } },
    { "id": "k8s-wheel",         "kind": "illustration", "files": { "svg": "assets/k8s-wheel.svg" } },
    { "id": "topology-3node",    "kind": "illustration", "files": { "svg": "assets/topology-3node.svg" } }
  ],
  "ui_kits": ["website", "app", "documents"],
  "preview_count": 22,
  "portfolio_set": "portfolio/manifest.json"
}
```

- [ ] **Step 2: Commit**

```bash
git add art-library/sets/korczewski/manifest.json
git commit -m "chore(art-library): write korczewski-kore manifest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: Reverse-engineer mentolder kit (parallel structure)

**Files:**
- Move: existing `art-library/sets/mentolder/{characters,props,terrain,logos,manifest.json,tokens.css,CREDITS.md}` to `portfolio/`
- Create: `art-library/sets/mentolder/{README.md, SKILL.md, manifest.json, colors_and_type.css, styles/website.css, ui_kits/website/{index.html, README.md}, preview/{button,hero,stat,kicker,faq,service-row,slot,portrait}.html}`

- [ ] **Step 1: Stage portfolio subfolder**

```bash
cd /home/patrick/Bachelorprojekt/art-library/sets/mentolder
mkdir -p portfolio
mv characters props terrain logos manifest.json tokens.css CREDITS.md portfolio/
ls
```

- [ ] **Step 2: Copy live mentolder tokens**

```bash
cp /home/patrick/Bachelorprojekt/website/public/brand/mentolder/colors_and_type.css \
   /home/patrick/Bachelorprojekt/art-library/sets/mentolder/colors_and_type.css
mkdir -p /home/patrick/Bachelorprojekt/art-library/sets/mentolder/styles
```

- [ ] **Step 3: Build styles/website.css from current Astro/Svelte components**

Read these files in order and concatenate their `<style>` blocks (strip Svelte `:global()` wrappers, keep selector specificity) into `art-library/sets/mentolder/styles/website.css` with this header:

```css
/* =========================================================================
   Mentolder — website.css
   Reverse-engineered snapshot of the live web.mentolder.de homepage CSS.
   Source: website/src/pages/index.astro + components/{Hero, WhyMe, ServiceRow,
   FAQ, CallToAction, Process, SlotWidget, Portrait}.{svelte,astro}
   (snapshot 2026-05-05). Tokens defined in colors_and_type.css.
   ========================================================================= */
```

Concatenation order:
1. `website/src/pages/index.astro` (page-level styles only)
2. `website/src/components/Hero.svelte`
3. `website/src/components/WhyMe.svelte`
4. `website/src/components/ServiceRow.svelte`
5. `website/src/components/Process.astro`
6. `website/src/components/FAQ.svelte`
7. `website/src/components/CallToAction.svelte`
8. `website/src/components/SlotWidget.astro`
9. `website/src/components/Portrait.svelte`

- [ ] **Step 4: Snapshot live homepage to ui_kits/website/index.html**

```bash
mkdir -p /home/patrick/Bachelorprojekt/art-library/sets/mentolder/ui_kits/website
curl -sL https://web.mentolder.de/ -o /tmp/mentolder-home.html
node -e '
  const fs=require("fs");
  let html=fs.readFileSync("/tmp/mentolder-home.html","utf8");
  html=html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "");
  const tokens=fs.readFileSync("/home/patrick/Bachelorprojekt/art-library/sets/mentolder/colors_and_type.css","utf8");
  const site=fs.readFileSync("/home/patrick/Bachelorprojekt/art-library/sets/mentolder/styles/website.css","utf8");
  html=html.replace("</head>",`<style>${tokens}\n${site}</style></head>`);
  fs.writeFileSync("/home/patrick/Bachelorprojekt/art-library/sets/mentolder/ui_kits/website/index.html", html);
'
ls -la /home/patrick/Bachelorprojekt/art-library/sets/mentolder/ui_kits/website/index.html
```

Expected: a self-contained HTML reference snapshot.

- [ ] **Step 5: Write ui_kits/website/README.md**

Create `art-library/sets/mentolder/ui_kits/website/README.md`:

```markdown
# Mentolder — Website UI kit (reference snapshot)

`index.html` is a static snapshot of `https://web.mentolder.de/` as of 2026-05-05, with `colors_and_type.css` and `styles/website.css` inlined so it renders standalone.

This is a **reference** — not the production source. The live site is built from `website/src/pages/index.astro` and the Svelte components in `website/src/components/`.

## Sections (top-down)

- Hero (Portrait + serif title with brass-italic emphasis)
- Stats + availability strip
- Service rows (numbered, with feature lists + price)
- WhyMe block
- Process steps (4-up)
- FAQ accordion
- CallToAction footer panel

## Brand quick reference

- Background `--bg` (warm cream), foreground `--fg` (warm ink)
- `--brass` accent for italic emphasis and CTAs
- `--sage` secondary accent
- Newsreader serif for headlines, Geist body, JetBrains Mono labels
```

- [ ] **Step 6: Generate 8 preview cards**

For each component create one minimal HTML reference card under `art-library/sets/mentolder/preview/`. Files: `button.html, hero.html, stat.html, kicker.html, faq.html, service-row.html, slot.html, portrait.html`.

Card template (substitute `<!-- COMPONENT -->`):

```html
<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"><title>Mentolder · {COMPONENT}</title>
<link rel="stylesheet" href="../colors_and_type.css">
<link rel="stylesheet" href="../styles/website.css">
<style>body{background:var(--bg);color:var(--fg);padding:40px;font-family:var(--sans);}</style>
</head><body>
<!-- COMPONENT MARKUP -->
</body></html>
```

For example `preview/button.html`:

```html
<a class="cta" href="#">Termin vereinbaren</a>
<a class="cta cta-secondary" href="#">Mehr erfahren</a>
```

For `preview/hero.html`, copy the rendered Hero markup from the snapshot (the `<section class="hero">…</section>` block).

- [ ] **Step 7: Write SKILL.md**

```markdown
---
name: mentolder-design
description: Use this skill to generate well-branded interfaces for Mentolder (Digital Coaching / Führungskräfte-Beratung), either for production or throwaway prototypes. Contains essential design guidelines, colors, type, fonts, assets, and reference UI for prototyping.
user-invocable: true
---

Read README.md within this skill, and explore the reference snapshot in `ui_kits/website/index.html`.

Brand quick reference:
- **Warm cream** substrate (`--bg`), warm ink foreground (`--fg`)
- **Brass** primary accent (`--brass`) — italic emphasis, CTAs
- **Sage** secondary accent (`--sage`) — hover, secondary CTAs
- **Newsreader Serif** for headlines and stat numerals; *italic* for emphasis
- **Geist** for body
- **JetBrains Mono** ALL CAPS + tracked for eyebrows, labels, stat-labels
- Voice: warm, structured, German formal "Sie", senior leadership-coaching tone
- No emoji in headlines; small line icons OK
```

- [ ] **Step 8: Write top-level README and manifest**

`art-library/sets/mentolder/README.md`:

```markdown
# Mentolder — brand kit

Reverse-engineered from the live web.mentolder.de homepage on 2026-05-05.

## Layout

- `colors_and_type.css` — design tokens (snapshot of website/public/brand/mentolder/)
- `styles/website.css` — consolidated marketing-page CSS (extracted from Astro/Svelte components)
- `ui_kits/website/index.html` — self-contained snapshot of the live home
- `preview/` — 8 component reference cards
- `SKILL.md` — agent skill manifest
- `portfolio/` — fantasy character set (separate side-project)
```

`art-library/sets/mentolder/manifest.json`:

```json
{
  "version": "2026-05-05",
  "brand": "mentolder",
  "source": "live-snapshot-web.mentolder.de",
  "tokens": {
    "bg": "#EDE6D8",
    "brass": "#A88249",
    "sage": "#7A8C6C"
  },
  "fonts": ["Newsreader", "Geist", "JetBrains Mono"],
  "stylesheets": ["colors_and_type.css", "styles/website.css"],
  "ui_kits": ["website"],
  "preview_count": 8,
  "portfolio_set": "portfolio/manifest.json"
}
```

- [ ] **Step 9: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add art-library/sets/mentolder
git commit -m "chore(art-library): reverse-engineered mentolder kit (parallel to Kore)

Snapshot of live web.mentolder.de homepage with extracted website.css,
preview cards, SKILL.md and manifest. Existing portfolio assets moved
under portfolio/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 1 done — both library kits are self-contained references. No runtime impact.**

---

## Phase 2 — Schema Migrations

Goal: extend tracking-DB with `bachelorprojekt.features` + `v_timeline` view, and add `fixed_in_pr` + `fixed_at` to `bugs.bug_tickets`.

### Task 2.1: Append features table + view to tracking init.sql

**Files:**
- Modify: `deploy/tracking/init.sql` (append at EOF)

- [ ] **Step 1: Append the SQL block**

Append to `deploy/tracking/init.sql`:

```sql

-- ===== features (PR-driven project timeline) ============================
CREATE TABLE IF NOT EXISTS bachelorprojekt.features (
  id             SERIAL PRIMARY KEY,
  pr_number      INTEGER UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL,
  scope          TEXT,
  brand          TEXT,
  requirement_id TEXT REFERENCES bachelorprojekt.requirements(id) ON DELETE SET NULL,
  merged_at      TIMESTAMPTZ NOT NULL,
  merged_by      TEXT,
  status         TEXT NOT NULL DEFAULT 'shipped' CHECK (status IN ('planned','in_progress','shipped','reverted')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_features_merged_at ON bachelorprojekt.features (merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_features_category  ON bachelorprojekt.features (category);
CREATE INDEX IF NOT EXISTS idx_features_brand     ON bachelorprojekt.features (brand);

-- Public-facing project timeline view (no cross-DB join — bugs_fixed computed in API layer)
CREATE OR REPLACE VIEW bachelorprojekt.v_timeline AS
SELECT
  f.id,
  f.merged_at::date AS day,
  f.merged_at,
  f.pr_number,
  f.title,
  f.description,
  f.category,
  f.scope,
  f.brand,
  f.requirement_id,
  r.name AS requirement_name,
  r.category AS requirement_category
FROM bachelorprojekt.features f
LEFT JOIN bachelorprojekt.requirements r ON r.id = f.requirement_id
ORDER BY f.merged_at DESC;
```

- [ ] **Step 2: Sanity-check structure**

```bash
grep -nE "CREATE (TABLE|VIEW|INDEX)" /home/patrick/Bachelorprojekt/deploy/tracking/init.sql
```

Expected: at least 4 CREATE TABLE, 5 CREATE OR REPLACE VIEW, several CREATE INDEX.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add deploy/tracking/init.sql
git commit -m "feat(tracking): add features table + v_timeline view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Add fixed_in_pr column to bugs.bug_tickets

**Files:**
- Modify: `k3d/website-schema.yaml` (CREATE TABLE bug_tickets blocks at line ~131 and ~451)
- Modify: `website/src/lib/website-db.ts` (init block around line 616, BugTicketRow type, all SELECT lists)

- [ ] **Step 1: Add ALTER + INDEX to the k3d schema ConfigMap**

Open `k3d/website-schema.yaml`. Find each `CREATE TABLE IF NOT EXISTS bugs.bug_tickets (` block. After each table CREATE, append (within the same `data:` literal block):

```yaml
        ALTER TABLE bugs.bug_tickets
          ADD COLUMN IF NOT EXISTS fixed_in_pr   INTEGER,
          ADD COLUMN IF NOT EXISTS fixed_at      TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets (fixed_in_pr);
```

(Match the surrounding indentation inside the YAML literal block.)

- [ ] **Step 2: Add the ALTER to the runtime schema initializer**

Open `website/src/lib/website-db.ts` around line 616 (right after the existing ALTER block for bug_tickets). Append to the array:

```typescript
    `ALTER TABLE bugs.bug_tickets
       ADD COLUMN IF NOT EXISTS fixed_in_pr   INTEGER`,
    `ALTER TABLE bugs.bug_tickets
       ADD COLUMN IF NOT EXISTS fixed_at      TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets (fixed_in_pr)`,
```

Find the `BugTicketRow` type. Add:

```typescript
  fixed_in_pr?: number | null;
  fixed_at?: Date | null;
```

- [ ] **Step 3: Update SELECTs to include the new columns**

Find every `SELECT ... FROM bugs.bug_tickets` in `website-db.ts`. Add `, fixed_in_pr, fixed_at` to each column list.

- [ ] **Step 4: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add k3d/website-schema.yaml website/src/lib/website-db.ts
git commit -m "feat(bugs): add fixed_in_pr + fixed_at to bug_tickets

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Apply migrations to the live cluster

- [ ] **Step 1: Apply tracking schema**

```bash
cd /home/patrick/Bachelorprojekt
kubectl --context mentolder -n workspace cp deploy/tracking/init.sql shared-db-0:/tmp/init.sql
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d postgres -f /tmp/init.sql 2>&1 | tail -20
```

Expected: idempotent NOTICEs, no errors.

- [ ] **Step 2: Apply bug_tickets ALTER**

```bash
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d website -c "
  ALTER TABLE bugs.bug_tickets
    ADD COLUMN IF NOT EXISTS fixed_in_pr   INTEGER,
    ADD COLUMN IF NOT EXISTS fixed_at      TIMESTAMPTZ;
  CREATE INDEX IF NOT EXISTS idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets (fixed_in_pr);
"
```

Expected: ALTER + CREATE INDEX notices.

- [ ] **Step 3: Verify**

```bash
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d postgres -c '\d bachelorprojekt.features'
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d postgres -c 'SELECT * FROM bachelorprojekt.v_timeline LIMIT 1;'
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d website -c '\d bugs.bug_tickets' | grep -E 'fixed_in_pr|fixed_at'
```

Expected: features table shown, v_timeline returns 0 rows, ALTER columns appear.

**Phase 2 done — schema is live.**

---

## Phase 3 — PR-Tracking Automation + Backfill

### Task 3.1: PR title/body parser with tests

**Files:**
- Create: `scripts/track-pr.mjs`
- Create: `scripts/track-pr.test.mjs`
- Modify or create: root `package.json`

- [ ] **Step 1: Confirm node and root package.json**

```bash
node --version
ls /home/patrick/Bachelorprojekt/package.json 2>/dev/null && cat /home/patrick/Bachelorprojekt/package.json || echo NONE
```

If NONE, create:

```json
{
  "name": "bachelorprojekt-scripts",
  "private": true,
  "type": "module",
  "scripts": {
    "test:track-pr": "node --test scripts/track-pr.test.mjs"
  }
}
```

- [ ] **Step 2: Write the failing tests first**

Create `scripts/track-pr.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePr } from './track-pr.mjs';

test('parses conventional commit with scope', () => {
  const r = parsePr({
    number: 491,
    title: 'feat(infra): multi-tenant website support',
    body: '',
    mergedAt: '2026-05-05T14:02:00Z',
    mergedBy: { login: 'patrick' },
  });
  assert.equal(r.pr_number, 491);
  assert.equal(r.category, 'feat');
  assert.equal(r.scope, 'infra');
  assert.equal(r.title, 'multi-tenant website support');
  assert.equal(r.merged_at, '2026-05-05T14:02:00Z');
  assert.equal(r.merged_by, 'patrick');
  assert.deepEqual(r.bug_refs, []);
});

test('parses conventional commit without scope', () => {
  const r = parsePr({
    number: 100,
    title: 'fix: race condition in slot booker',
    body: '',
    mergedAt: '2026-04-01T10:00:00Z',
  });
  assert.equal(r.category, 'fix');
  assert.equal(r.scope, null);
  assert.equal(r.title, 'race condition in slot booker');
});

test('extracts BR-XXXX bug references from body', () => {
  const r = parsePr({
    number: 200,
    title: 'fix(website): correct date format',
    body: 'Fixes BR-20260415-0042 and Closes BR-20260420-0001\nAlso resolves BR-20260423-0099.',
    mergedAt: '2026-04-25T12:00:00Z',
  });
  assert.deepEqual(r.bug_refs, [
    'BR-20260415-0042',
    'BR-20260420-0001',
    'BR-20260423-0099',
  ]);
});

test('extracts requirement_id (FA/SA/NFA/AK) from body', () => {
  const r = parsePr({
    number: 201,
    title: 'feat(stream): livekit recording',
    body: 'Implements FA-12 and partially SA-03.',
    mergedAt: '2026-04-30T08:00:00Z',
  });
  assert.equal(r.requirement_id, 'FA-12');
});

test('falls back to chore category for unconventional title', () => {
  const r = parsePr({
    number: 300,
    title: 'Bump dependencies',
    body: '',
    mergedAt: '2026-05-01T09:00:00Z',
  });
  assert.equal(r.category, 'chore');
  assert.equal(r.title, 'Bump dependencies');
});

test('infers brand from scope when scope is mentolder/korczewski', () => {
  const r = parsePr({
    number: 400,
    title: 'feat(korczewski): rebuild homepage',
    body: '',
    mergedAt: '2026-05-05T00:00:00Z',
  });
  assert.equal(r.brand, 'korczewski');
});

test('null brand for non-brand scopes', () => {
  const r = parsePr({
    number: 401,
    title: 'feat(infra): cluster merge',
    body: '',
    mergedAt: '2026-05-04T00:00:00Z',
  });
  assert.equal(r.brand, null);
});
```

- [ ] **Step 3: Run — expect failures**

```bash
cd /home/patrick/Bachelorprojekt
node --test scripts/track-pr.test.mjs 2>&1 | head -10
```

Expected: errors about missing `parsePr`/module.

- [ ] **Step 4: Write the implementation**

Create `scripts/track-pr.mjs`:

```javascript
// scripts/track-pr.mjs
// Pure parser + DB writer for project timeline rows.

const TITLE_RE = /^(feat|fix|chore|docs|refactor|infra|perf|test|build|ci|style)(\(([^)]+)\))?(!)?:\s*(.+?)\s*$/i;
const BUG_RE   = /\bBR-\d{8}-\d{4}\b/g;
const REQ_RE   = /\b(FA|SA|NFA|AK|L)-\d+\b/i;

const BRAND_SCOPES = new Set(['mentolder', 'korczewski', 'kore']);

export function parsePr(pr) {
  const m = TITLE_RE.exec(pr.title);
  let category, scope, title;
  if (m) {
    category = m[1].toLowerCase();
    scope    = m[3] ? m[3].toLowerCase() : null;
    title    = m[5];
  } else {
    category = 'chore';
    scope    = null;
    title    = pr.title.trim();
  }

  const body = pr.body || '';
  const bug_refs = Array.from(new Set((body.match(BUG_RE) || [])));
  const reqMatch = REQ_RE.exec(body);
  const requirement_id = reqMatch ? reqMatch[0].toUpperCase() : null;

  let brand = null;
  if (scope && BRAND_SCOPES.has(scope)) {
    brand = scope === 'kore' ? 'korczewski' : scope;
  }

  return {
    pr_number: pr.number,
    title,
    description: body.length > 0 ? body.slice(0, 4000) : null,
    category,
    scope,
    brand,
    requirement_id,
    merged_at: pr.mergedAt,
    merged_by: pr.mergedBy?.login || null,
    bug_refs,
  };
}

export async function writeRowToDb(row, pgClient) {
  await pgClient.query(
    `INSERT INTO bachelorprojekt.features
       (pr_number, title, description, category, scope, brand,
        requirement_id, merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'shipped')
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       scope = EXCLUDED.scope,
       brand = EXCLUDED.brand,
       requirement_id = EXCLUDED.requirement_id,
       merged_at = EXCLUDED.merged_at,
       merged_by = EXCLUDED.merged_by`,
    [row.pr_number, row.title, row.description, row.category, row.scope, row.brand,
     row.requirement_id, row.merged_at, row.merged_by]
  );

  for (const ticketId of row.bug_refs) {
    await pgClient.query(
      `UPDATE bugs.bug_tickets
         SET fixed_in_pr = $1, fixed_at = $2, status = 'archived'
       WHERE ticket_id = $3 AND (fixed_in_pr IS NULL OR fixed_in_pr <> $1)`,
      [row.pr_number, row.merged_at, ticketId]
    );
  }
}

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--pr') {
    const raw = readFileSync(0, 'utf8');
    const pr = JSON.parse(raw);
    const row = parsePr(pr);
    mkdirSync('tracking/pending', { recursive: true });
    const file = `tracking/pending/${row.pr_number}.json`;
    writeFileSync(file, JSON.stringify(row, null, 2) + '\n');
    console.log(`wrote ${file}`);
    return;
  }

  if (mode === '--backfill') {
    const raw = readFileSync(0, 'utf8');
    const prs = JSON.parse(raw);
    mkdirSync('tracking/pending', { recursive: true });
    for (const pr of prs) {
      const row = parsePr(pr);
      const file = `tracking/pending/${row.pr_number}.json`;
      writeFileSync(file, JSON.stringify(row, null, 2) + '\n');
    }
    console.log(`wrote ${prs.length} pending rows`);
    return;
  }

  if (mode === '--ingest') {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.TRACKING_DB_URL });
    await client.connect();
    let count = 0;
    const files = readdirSync('tracking/pending').filter(f => f.endsWith('.json'));
    for (const f of files) {
      const row = JSON.parse(readFileSync(join('tracking/pending', f), 'utf8'));
      try {
        await writeRowToDb(row, client);
        unlinkSync(join('tracking/pending', f));
        count++;
      } catch (e) {
        console.error(`skip ${f}: ${e.message}`);
      }
    }
    await client.end();
    console.log(`ingested ${count} rows`);
    return;
  }

  console.error('usage: track-pr.mjs --pr | --backfill | --ingest');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 5: Tests pass**

```bash
cd /home/patrick/Bachelorprojekt
node --test scripts/track-pr.test.mjs 2>&1 | tail -15
```

Expected: 7 passing.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/track-pr.mjs scripts/track-pr.test.mjs
git commit -m "feat(tracking): PR parser + DB writer (track-pr.mjs)

Three modes: --pr (single from stdin), --backfill (array from gh pr list),
--ingest (drains tracking/pending/ into bachelorprojekt.features and updates
bugs.bug_tickets.fixed_in_pr).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: GitHub Action — write pending JSON on every merged PR

**Files:**
- Create: `.github/workflows/track-pr.yml`
- Create: `tracking/pending/.gitkeep`

- [ ] **Step 1: Pending dir placeholder**

```bash
mkdir -p /home/patrick/Bachelorprojekt/tracking/pending
touch /home/patrick/Bachelorprojekt/tracking/pending/.gitkeep
```

- [ ] **Step 2: Workflow**

Create `.github/workflows/track-pr.yml`:

```yaml
name: track-pr

on:
  pull_request:
    types: [closed]

permissions:
  contents: write
  pull-requests: read

jobs:
  record:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 1
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build PR JSON for parser
        env:
          PR_NUMBER:    ${{ github.event.pull_request.number }}
          PR_TITLE:     ${{ github.event.pull_request.title }}
          PR_BODY:      ${{ github.event.pull_request.body }}
          PR_MERGED_AT: ${{ github.event.pull_request.merged_at }}
          PR_MERGED_BY: ${{ github.event.pull_request.merged_by.login }}
        run: |
          node -e '
            const fs = require("fs");
            const json = JSON.stringify({
              number:   parseInt(process.env.PR_NUMBER, 10),
              title:    process.env.PR_TITLE,
              body:     process.env.PR_BODY || "",
              mergedAt: process.env.PR_MERGED_AT,
              mergedBy: { login: process.env.PR_MERGED_BY },
            });
            fs.writeFileSync("/tmp/pr.json", json);
          '

      - name: Run parser
        run: node scripts/track-pr.mjs --pr < /tmp/pr.json

      - name: Commit pending JSON
        run: |
          git config user.name  "track-pr-bot"
          git config user.email "track-pr-bot@users.noreply.github.com"
          git add tracking/pending/
          if git diff --cached --quiet; then
            echo "no pending file to commit"
            exit 0
          fi
          git commit -m "chore(tracking): record PR #${{ github.event.pull_request.number }}"
          for i in 1 2 3; do
            git pull --rebase origin main && git push origin main && exit 0
            sleep $((RANDOM % 5 + 2))
          done
          exit 1
```

- [ ] **Step 3: Lint YAML**

```bash
cd /home/patrick/Bachelorprojekt
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' .github/workflows/track-pr.yml
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/track-pr.yml tracking/pending/.gitkeep
git commit -m "feat(ci): track-pr workflow writes JSON per merged PR

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: In-cluster CronJob — drain tracking/pending into shared-db

**Files:**
- Create: `k3d/tracking-import-cronjob.yaml`
- Modify: `k3d/kustomization.yaml`
- Modify: `environments/.secrets/{mentolder,korczewski}.yaml` (TRACKING_DB_URL)

- [ ] **Step 1: CronJob manifest**

Create `k3d/tracking-import-cronjob.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tracking-import
  namespace: workspace
  labels:
    app: tracking-import
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: importer
              image: node:20-alpine
              env:
                - name: TRACKING_DB_URL
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: TRACKING_DB_URL
                - name: GIT_REPO
                  value: "https://github.com/Paddione/Bachelorprojekt.git"
              command:
                - sh
                - -c
                - |
                  set -e
                  apk add --no-cache git >/dev/null
                  cd /tmp
                  rm -rf repo
                  git clone --depth 1 --branch main "$GIT_REPO" repo
                  cd repo
                  npm install pg --silent --no-package-lock
                  if [ ! -d tracking/pending ] || [ -z "$(ls -A tracking/pending/*.json 2>/dev/null)" ]; then
                    echo "no pending rows"
                    exit 0
                  fi
                  node scripts/track-pr.mjs --ingest
                  echo "Ingest complete. Pending files left for cleanup by maintainer."
```

- [ ] **Step 2: TRACKING_DB_URL secret entry**

Open `environments/.secrets/mentolder.yaml` (and `korczewski.yaml`). Add:

```yaml
  TRACKING_DB_URL: "postgresql://postgres:<existing-postgres-password>@shared-db.workspace.svc.cluster.local:5432/postgres?sslmode=disable"
```

(Replace `<existing-postgres-password>` with the value already used for POSTGRES_PASSWORD in the same file.) Then re-seal:

```bash
cd /home/patrick/Bachelorprojekt
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

- [ ] **Step 3: Reference the CronJob in kustomization**

Open `k3d/kustomization.yaml`. Add `- tracking-import-cronjob.yaml` under `resources:`.

- [ ] **Step 4: Validate**

```bash
cd /home/patrick/Bachelorprojekt
task workspace:validate ENV=mentolder
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add k3d/tracking-import-cronjob.yaml k3d/kustomization.yaml \
        environments/sealed-secrets/mentolder.yaml \
        environments/sealed-secrets/korczewski.yaml
git commit -m "feat(tracking): cluster CronJob ingests tracking/pending into shared-db

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4: Backfill script + Taskfile entries

**Files:**
- Create: `scripts/backfill-features.sh`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Script**

Create `scripts/backfill-features.sh`:

```bash
#!/usr/bin/env bash
# scripts/backfill-features.sh
# One-shot: walk all closed PRs on the GitHub remote, generate tracking/pending
# entries via track-pr.mjs --backfill. Idempotent (writes to pending/, ingest
# does ON CONFLICT upserts).
set -euo pipefail

DRY_RUN="${1:-}"

if ! command -v gh >/dev/null; then
  echo "ERROR: gh CLI required" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Fetching all merged PRs..."
gh pr list \
  --state merged \
  --limit 2000 \
  --json number,title,body,mergedAt,mergedBy \
  > /tmp/pr-history.json

count=$(jq 'length' /tmp/pr-history.json)
echo "Got $count PRs."

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "Dry run — first 3 parsed rows:"
  node -e '
    import("./scripts/track-pr.mjs").then(({ parsePr }) => {
      const prs = JSON.parse(require("fs").readFileSync("/tmp/pr-history.json", "utf8"));
      prs.slice(0, 3).forEach(p => console.log(JSON.stringify(parsePr(p), null, 2)));
    });
  '
  exit 0
fi

mkdir -p tracking/pending
node scripts/track-pr.mjs --backfill < /tmp/pr-history.json
echo "Wrote $(ls tracking/pending/*.json | wc -l) pending rows."
echo "Next: commit + push, then wait for tracking-import CronJob (or run manually)."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /home/patrick/Bachelorprojekt/scripts/backfill-features.sh
```

- [ ] **Step 3: Taskfile entries**

Open `Taskfile.yml` and append three task definitions in the appropriate section:

```yaml
  tracking:backfill:
    desc: Backfill bachelorprojekt.features from all closed PRs (idempotent)
    cmds:
      - bash scripts/backfill-features.sh

  tracking:backfill:dry:
    desc: Dry-run backfill (prints first 3 parsed rows, writes nothing)
    cmds:
      - bash scripts/backfill-features.sh --dry-run

  tracking:ingest:local:
    desc: Manually drain tracking/pending into shared-db (requires TRACKING_DB_URL)
    cmds:
      - node scripts/track-pr.mjs --ingest
```

- [ ] **Step 4: Validate Taskfile**

```bash
cd /home/patrick/Bachelorprojekt
task --list 2>&1 | grep tracking
```

Expected: 3 new tasks listed.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-features.sh Taskfile.yml
git commit -m "feat(tracking): backfill script + task entries

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.5: Run backfill

- [ ] **Step 1: Dry-run**

```bash
cd /home/patrick/Bachelorprojekt
task tracking:backfill:dry 2>&1 | head -60
```

Expected: 3 sample parsed rows; no files written.

- [ ] **Step 2: Live backfill**

```bash
task tracking:backfill
ls tracking/pending/*.json | wc -l
```

Expected: matches "Got N PRs" count.

- [ ] **Step 3: Manually ingest into shared-db**

```bash
PGPASS=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
kubectl --context mentolder -n workspace port-forward svc/shared-db 15432:5432 &
PF_PID=$!
sleep 3
TRACKING_DB_URL="postgresql://postgres:${PGPASS}@127.0.0.1:15432/postgres?sslmode=disable" \
  node scripts/track-pr.mjs --ingest
kill $PF_PID
```

Expected: "ingested N rows".

- [ ] **Step 4: Verify**

```bash
kubectl --context mentolder -n workspace exec shared-db-0 -- psql -U postgres -d postgres -c \
  'SELECT day, pr_number, category, title FROM bachelorprojekt.v_timeline LIMIT 10;'
```

Expected: 10 rows of recent PRs.

- [ ] **Step 5: Commit any leftover pending files**

```bash
cd /home/patrick/Bachelorprojekt
git add tracking/pending/
if ! git diff --cached --quiet; then
  git commit -m "chore(tracking): post-backfill leftover pending entries"
fi
```

**Phase 3 done — every future PR auto-records; history is seeded.**

---

## Phase 4 — Korczewski Homepage (Kore Aesthetic + Live Timeline)

### Task 4.1: Bring Kore stylesheets + assets into the website source

**Files:**
- Create: `website/src/styles/kore-website.css`
- Create: `website/public/brand/korczewski/kore-assets/{k8s-wheel.svg, topology-3node.svg, logo-mark.svg}`
- Optionally update: `website/public/brand/korczewski/colors_and_type.css` (sync with art-library)

- [ ] **Step 1: Copy CSS**

```bash
cp /home/patrick/Bachelorprojekt/art-library/sets/korczewski/styles/website.css \
   /home/patrick/Bachelorprojekt/website/src/styles/kore-website.css
```

- [ ] **Step 2: Sync brand tokens (only if differ)**

```bash
diff /home/patrick/Bachelorprojekt/art-library/sets/korczewski/colors_and_type.css \
     /home/patrick/Bachelorprojekt/website/public/brand/korczewski/colors_and_type.css \
  || cp /home/patrick/Bachelorprojekt/art-library/sets/korczewski/colors_and_type.css \
        /home/patrick/Bachelorprojekt/website/public/brand/korczewski/colors_and_type.css
```

- [ ] **Step 3: Copy SVG assets**

```bash
mkdir -p /home/patrick/Bachelorprojekt/website/public/brand/korczewski/kore-assets
cp /home/patrick/Bachelorprojekt/art-library/sets/korczewski/assets/k8s-wheel.svg \
   /home/patrick/Bachelorprojekt/art-library/sets/korczewski/assets/topology-3node.svg \
   /home/patrick/Bachelorprojekt/art-library/sets/korczewski/assets/logo-mark.svg \
   /home/patrick/Bachelorprojekt/website/public/brand/korczewski/kore-assets/
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/styles/kore-website.css \
        website/public/brand/korczewski/colors_and_type.css \
        website/public/brand/korczewski/kore-assets/
git commit -m "chore(website): import Kore stylesheets + assets to korczewski brand

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: KoreSubNav.astro

**Files:**
- Create: `website/src/components/kore/KoreSubNav.astro`

- [ ] **Step 1: Component**

```astro
---
const { active = 'work' } = Astro.props as { active?: string };
const links = [
  { id: 'work',     label: 'Cluster' },
  { id: 'services', label: 'Leistungen' },
  { id: 'team',     label: 'Über mich' },
  { id: 'notes',    label: 'Notizen' },
  { id: 'contact',  label: 'Kontakt' },
];
---

<nav class="web-nav" aria-label="Hauptnavigation">
  <a class="shell-brand" href="/">
    <img src="/brand/korczewski/kore-assets/logo-mark.svg" width="28" height="28" alt="Kore" />
    <span style="font-family:var(--serif); font-size:22px;">
      Kore<span style="color:var(--copper)">.</span>
    </span>
  </a>
  <div class="links">
    {links.map(({id, label}) => (
      <a href={id === 'contact' ? '/kontakt' : `#${id}`} class={active === id ? 'active' : ''}>{label}</a>
    ))}
  </div>
  <div class="actions">
    <a class="btn ghost sm" href="#timeline">Notizen</a>
    <a class="btn primary sm" href="/kontakt">Kennenlernen →</a>
  </div>
</nav>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/kore/KoreSubNav.astro
git commit -m "feat(kore): KoreSubNav component"
```

---

### Task 4.3: KoreHero.svelte (live ticker + fallback)

**Files:**
- Create: `website/src/components/kore/KoreHero.svelte`

- [ ] **Step 1: Component**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  type Stats = { nodes: number; pods: number; brands: number };
  let stats: Stats | null = null;
  let pollInterval: number | undefined;

  async function fetchStats() {
    try {
      const r = await fetch('/api/cluster/status', { signal: AbortSignal.timeout(3000) });
      if (r.ok) stats = await r.json();
    } catch {
      // silent fallback
    }
  }

  onMount(() => {
    fetchStats();
    pollInterval = window.setInterval(fetchStats, 30_000);
    return () => clearInterval(pollInterval);
  });
</script>

<section class="w-hero">
  <span class="w-ticker" role="status" aria-live="polite">
    <span class="dot"></span>
    {#if stats}
      <b>{stats.nodes}</b>&nbsp;Nodes online ·
      <span style="color:var(--mute)">{stats.brands} Brands · {stats.pods} Pods</span>
    {:else}
      <b>verfügbar</b>&nbsp;<span style="color:var(--mute)">Q3 2026</span>
    {/if}
  </span>

  <span class="eyebrow no-rule">[ JETZT IN BETRIEB ]</span>
  <h1>Self-hosted, <em class="em">vor Ihren Augen.</em></h1>
  <p class="lede">
    Diese Seite läuft auf einem 12-Node-Kubernetes-Cluster, den ich selbst gebaut, deploye und betreibe.
    Alles, was Sie hier sehen — Auth, Dateien, Office, KI, Whiteboard, Stream, Buchung, Abrechnung — ist
    Open-Source, DSGVO-konform und auf einem einzigen Cluster zu Hause. <em class="em">Das hier ist die Demo.</em>
  </p>

  <div class="cta-row">
    <a class="btn primary" href="/kontakt">Kennenlernen →</a>
    <a class="btn ghost" href="#timeline">Notizen lesen</a>
  </div>

  <div class="meta-row">
    <div>
      <div class="lab">Studium</div>
      <div class="v">B.Sc.<span class="u">IT-Sec</span></div>
      <div class="s">Penetration · Krypto · Architektur</div>
    </div>
    <div>
      <div class="lab">Im Feld</div>
      <div class="v">10<span class="u">+ Jahre</span></div>
      <div class="s">IT-Management · Server · Netze</div>
    </div>
    <div>
      <div class="lab">KI in Produktion</div>
      <div class="v"><em class="em">seit Tag 1</em></div>
      <div class="s">Claude · Cursor · lokale Modelle</div>
    </div>
    <div>
      <div class="lab">Cluster</div>
      <div class="v">12<span class="u">Nodes</span></div>
      <div class="s">k3s · ArgoCD · Multi-Tenant</div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/kore/KoreHero.svelte
git commit -m "feat(kore): KoreHero with live ticker + fallback"
```

---

### Task 4.4: /api/cluster/status endpoint

**Files:**
- Create: `website/src/pages/api/cluster/status.ts`

- [ ] **Step 1: Endpoint**

```typescript
import type { APIRoute } from 'astro';

export const prerender = false;

let cache: { nodes: number; pods: number; brands: number; ts: number } | null = null;
const TTL_MS = 25_000;

async function fetchClusterCounts() {
  try {
    const r = await fetch('http://dashboard.workspace.svc.cluster.local/api/cluster/summary', {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) {
      const j = await r.json();
      return { nodes: j.nodes ?? 12, pods: j.pods ?? 0, brands: j.brands ?? 2 };
    }
  } catch {
    // ignore
  }
  return { nodes: 12, pods: 0, brands: 2 };
}

export const GET: APIRoute = async () => {
  const now = Date.now();
  if (!cache || now - cache.ts > TTL_MS) {
    const counts = await fetchClusterCounts();
    cache = { ...counts, ts: now };
  }
  return new Response(JSON.stringify({ nodes: cache.nodes, pods: cache.pods, brands: cache.brands }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
```

- [ ] **Step 2: Verify dashboard endpoint exists (else fallback is fine for v1)**

```bash
grep -rn 'cluster/summary\|/api/cluster/' /home/patrick/Bachelorprojekt/website/src/pages/api/ 2>/dev/null | head
```

If absent, the fallback `{ nodes: 12, pods: 0, brands: 2 }` ships; live data is a Phase 5 follow-up.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/cluster/status.ts
git commit -m "feat(kore): /api/cluster/status with 25s in-memory cache"
```

---

### Task 4.5: KorePillars.astro (4 product tiles)

**Files:**
- Create: `website/src/components/kore/KorePillars.astro`

- [ ] **Step 1: Component**

```astro
---
type Pillar = { title: string; em: string; body: string; tags: string[]; svgPath?: string };
const pillars: Pillar[] = [
  {
    title: 'SSO &',
    em: 'Identität',
    body: 'Keycloak als zentraler OIDC-Provider. Eine Anmeldung, alle Tools.',
    tags: ['KEYCLOAK', 'OIDC'],
    svgPath: 'M12 8a3 3 0 100-6 3 3 0 000 6zM5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2',
  },
  {
    title: 'Dateien &',
    em: 'Talk',
    body: 'Nextcloud mit Talk, Whiteboard, Collabora und HPB-Signaling.',
    tags: ['NEXTCLOUD', 'TALK', 'COLLABORA'],
    svgPath: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z',
  },
  {
    title: 'Vault &',
    em: 'Secrets',
    body: 'Vaultwarden für Passwörter. Sealed Secrets für Cluster-Geheimnisse.',
    tags: ['VAULTWARDEN', 'SEALED'],
    svgPath: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
  },
  {
    title: 'Stream &',
    em: 'KI',
    body: 'LiveKit für WebRTC-Streaming. Claude Code MCP für KI-Ops im Cluster.',
    tags: ['LIVEKIT', 'MCP', 'WHISPER'],
    svgPath: 'M3 12h4l3-8 4 16 3-8h4',
  },
];
---

<section class="w-section" id="services">
  <div class="head">
    <span class="num">01 / 04</span>
    <h2>Was im Cluster <em class="em">tatsächlich läuft.</em></h2>
    <span class="hint">8+ services · 1 cluster · 2 brands</span>
  </div>
  <div class="w-services">
    {pillars.map((p) => (
      <article class="w-svc">
        <div class="glyph">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d={p.svgPath} />
          </svg>
        </div>
        <h3>{p.title} <em class="em">{p.em}</em></h3>
        <p>{p.body}</p>
        <div class="tags">{p.tags.map((t) => <span>{t}</span>)}</div>
      </article>
    ))}
  </div>
</section>

<style>
  :global(.w-services) {
    grid-template-columns: repeat(4, 1fr) !important;
  }
  @media (max-width: 980px) {
    :global(.w-services) {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/kore/KorePillars.astro
git commit -m "feat(kore): KorePillars (4 product tiles)"
```

---

### Task 4.6: KoreTimeline.svelte + /api/timeline + lib helper

**Files:**
- Modify: `website/src/lib/website-db.ts` (add tracking-DB pool + listTimeline)
- Create: `website/src/pages/api/timeline.ts`
- Create: `website/src/components/kore/KoreTimeline.svelte`

- [ ] **Step 1: Add tracking-DB helper to website-db.ts**

In `website/src/lib/website-db.ts`, after the existing `pg.Pool` setup (find by searching for the existing `getPool()` function), add:

```typescript
let trackingPool: pg.Pool | null = null;

function getTrackingPool(): pg.Pool {
  if (trackingPool) return trackingPool;
  const url = process.env.TRACKING_DB_URL || process.env.DATABASE_URL?.replace(/\/[^/]+(\?|$)/, '/postgres$1');
  if (!url) throw new Error('TRACKING_DB_URL not set');
  trackingPool = new pg.Pool({ connectionString: url, max: 4 });
  return trackingPool;
}

export type TimelineRow = {
  id: number;
  day: string;
  pr_number: number | null;
  title: string;
  description: string | null;
  category: string;
  scope: string | null;
  brand: string | null;
  requirement_id: string | null;
  requirement_name: string | null;
  bugs_fixed: number;
};

export async function listTimeline(opts: {
  limit?: number;
  offset?: number;
  category?: string;
  brand?: string;
} = {}): Promise<TimelineRow[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const pool = getTrackingPool();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) { params.push(opts.category); where.push(`category = $${params.length}`); }
  if (opts.brand)    { params.push(opts.brand);    where.push(`(brand = $${params.length} OR brand IS NULL)`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = (await pool.query(
    `SELECT id, to_char(day,'YYYY-MM-DD') AS day, pr_number, title, description,
            category, scope, brand, requirement_id, requirement_name
       FROM bachelorprojekt.v_timeline
       ${whereSql}
      ORDER BY merged_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )).rows as Omit<TimelineRow, 'bugs_fixed'>[];

  const prNumbers = rows.map(r => r.pr_number).filter((n): n is number => n != null);
  const bugCounts = new Map<number, number>();
  if (prNumbers.length > 0) {
    const wp = getPool();
    const counts = (await wp.query(
      `SELECT fixed_in_pr AS pr, COUNT(*)::int AS n
         FROM bugs.bug_tickets
        WHERE fixed_in_pr = ANY($1::int[])
        GROUP BY fixed_in_pr`,
      [prNumbers],
    )).rows as { pr: number; n: number }[];
    for (const c of counts) bugCounts.set(c.pr, c.n);
  }

  return rows.map(r => ({ ...r, bugs_fixed: r.pr_number ? (bugCounts.get(r.pr_number) ?? 0) : 0 }));
}
```

(If the existing pool function is named differently than `getPool()`, replace `getPool()` here with the actual name.)

- [ ] **Step 2: API endpoint**

Create `website/src/pages/api/timeline.ts`:

```typescript
import type { APIRoute } from 'astro';
import { listTimeline } from '../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const limit    = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const offset   = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const category = url.searchParams.get('cat')   ?? undefined;
  const brand    = url.searchParams.get('brand') ?? undefined;

  try {
    const rows = await listTimeline({ limit, offset, category, brand });
    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' },
    });
  } catch (err) {
    console.error('[api/timeline]', err);
    return new Response(JSON.stringify({ rows: [], error: 'fetch_failed' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 3: KoreTimeline.svelte**

```svelte
<script lang="ts">
  type Row = {
    id: number; day: string; pr_number: number | null;
    title: string; description: string | null;
    category: string; scope: string | null; brand: string | null;
    requirement_id: string | null; bugs_fixed: number;
  };

  let { initialRows = [] }: { initialRows?: Row[] } = $props();
  let rows = $state<Row[]>(initialRows);
  let category = $state<string>('');
  let loading = $state(false);
  let exhausted = $state(false);

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    const params = new URLSearchParams({
      offset: String(rows.length),
      limit: '20',
    });
    if (category) params.set('cat', category);
    const r = await fetch(`/api/timeline?${params}`);
    const j = await r.json();
    if (j.rows.length === 0) exhausted = true;
    rows = [...rows, ...j.rows];
    loading = false;
  }

  async function setCategory(c: string) {
    category = c;
    rows = [];
    exhausted = false;
    await loadMore();
  }
</script>

<section class="w-section" id="timeline">
  <div class="head">
    <span class="num">02 / 04</span>
    <h2>Implementierte <em class="em">Features.</em></h2>
    <span class="hint">{rows.length}+ Einträge · live aus Tracking-DB</span>
  </div>

  <div class="filters" role="tablist" aria-label="Kategorie-Filter">
    {#each [['', 'Alle'], ['feat', 'Features'], ['fix', 'Fixes'], ['infra', 'Infra'], ['docs', 'Docs']] as [k, l]}
      <button class:active={category === k} onclick={() => setCategory(k)} role="tab">{l}</button>
    {/each}
  </div>

  <ol class="log">
    {#each rows as r (r.id)}
      <li>
        <span class="when">{r.day}</span>
        <span class="what">
          {r.title}
          {#if r.description}<span class="sub">{r.description.split('\n')[0].slice(0, 140)}</span>{/if}
        </span>
        <span class="meta">
          {#if r.pr_number}<span class="pr">PR #{r.pr_number}</span>{/if}
          {#if r.bugs_fixed > 0}<span class="bug">+{r.bugs_fixed} fix</span>{/if}
        </span>
      </li>
    {/each}
  </ol>

  {#if !exhausted}
    <button class="btn ghost" onclick={loadMore} disabled={loading}>
      {loading ? 'Lade…' : 'Mehr laden'}
    </button>
  {:else}
    <p class="exhausted">Ende der Liste.</p>
  {/if}
</section>

<style>
  .filters{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;}
  .filters button{
    padding:6px 14px;border:1px solid var(--line-2);border-radius:999px;
    background:transparent;color:var(--fg-soft);font-family:var(--mono);font-size:11px;
    letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:all 200ms var(--ease);
  }
  .filters button:hover{border-color:var(--copper);color:var(--copper);}
  .filters button.active{background:var(--copper-tint);color:var(--copper);border-color:var(--copper);}
  .log{list-style:none;margin:0;padding:0;}
  .log li{
    display:grid;grid-template-columns:140px 1fr auto;gap:24px;align-items:start;
    padding:18px 0;border-bottom:1px solid var(--line);
  }
  .log .when{font-family:var(--mono);font-size:11px;letter-spacing:.10em;color:var(--mute);text-transform:uppercase;}
  .log .what{font-family:var(--sans);font-size:14.5px;color:var(--fg);}
  .log .what .sub{display:block;font-family:var(--mono);font-size:11px;color:var(--mute);margin-top:4px;letter-spacing:.04em;}
  .log .meta{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--mute);text-transform:uppercase;text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end;}
  .log .meta .pr{color:var(--copper);}
  .log .meta .bug{color:var(--teal);}
  .exhausted{margin-top:24px;font-family:var(--mono);font-size:11px;color:var(--mute);text-align:center;letter-spacing:.14em;text-transform:uppercase;}
</style>
```

- [ ] **Step 4: Type-check + commit**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit
cd ..
git add website/src/components/kore/KoreTimeline.svelte \
        website/src/pages/api/timeline.ts \
        website/src/lib/website-db.ts
git commit -m "feat(kore): KoreTimeline + /api/timeline (paginated, filterable)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.7: KoreBugs.astro (open issues)

**Files:**
- Create: `website/src/components/kore/KoreBugs.astro`

- [ ] **Step 1: Component**

```astro
---
import { listBugTickets } from '../../lib/website-db';
import type { BugTicketRow } from '../../lib/website-db';

let openBugs: BugTicketRow[] = [];
try {
  const all = await listBugTickets({ status: 'open' });
  openBugs = all.filter(b => !b.brand || b.brand === 'korczewski').slice(0, 9);
} catch (err) {
  console.error('[KoreBugs]', err);
}

const cats: Record<string, string> = {
  fehler: 'Fehler',
  verbesserung: 'Verbesserung',
  erweiterungswunsch: 'Wunsch',
};
---

<section class="w-section" id="bugs">
  <div class="head">
    <span class="num">03 / 04</span>
    <h2>Bekannte <em class="em">Themen.</em></h2>
    <span class="hint">offen · live aus bugs.bug_tickets</span>
  </div>

  {openBugs.length === 0 ? (
    <p class="empty">Aktuell keine offenen Tickets. <em class="em">Schön.</em></p>
  ) : (
    <ul class="bugs">
      {openBugs.map((b) => (
        <li>
          <span class="tid">{b.ticket_id}</span>
          <span class="desc">{b.description.slice(0, 160)}</span>
          <span class={`cat cat-${b.category}`}>{cats[b.category] ?? b.category}</span>
        </li>
      ))}
    </ul>
  )}
</section>

<style>
  .empty{font-family:var(--serif);font-size:24px;color:var(--fg-soft);padding:24px 0;}
  .empty em{color:var(--copper-2);font-style:italic;}
  .bugs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .bugs li{
    padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--ink-850);
    display:flex;flex-direction:column;gap:10px;
  }
  .tid{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--copper);text-transform:uppercase;}
  .desc{font-family:var(--sans);font-size:13.5px;color:var(--fg-soft);line-height:1.5;}
  .cat{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
    align-self:flex-start;padding:3px 8px;border-radius:6px;border:1px solid var(--line-2);color:var(--mute);}
  .cat-fehler{color:#E26B6B;border-color:rgba(226,107,107,.3);}
  .cat-verbesserung{color:var(--teal);border-color:rgba(91,212,208,.3);}
  .cat-erweiterungswunsch{color:var(--copper);border-color:rgba(200,247,106,.3);}
  @media (max-width:980px){.bugs{grid-template-columns:1fr;}}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/kore/KoreBugs.astro
git commit -m "feat(kore): KoreBugs section (open tickets, brand-filtered)"
```

---

### Task 4.8: KoreTeam + KoreContact + KoreFooter

**Files:**
- Create: `website/src/components/kore/KoreTeam.astro`
- Create: `website/src/components/kore/KoreContact.astro`
- Create: `website/src/components/kore/KoreFooter.astro`

- [ ] **Step 1: KoreTeam.astro**

```astro
---
import { config } from '../../config/index';
const { contact, legal } = config;
---

<section class="w-section" id="team">
  <div class="head">
    <span class="num">04 / 04</span>
    <h2>Eine Person <em class="em">macht die Arbeit.</em></h2>
    <span class="hint">Solo · seit 2021 · {contact.city}</span>
  </div>

  <div class="w-team">
    <div class="who">
      <div class="portrait">
        <div class="id"><b>{contact.name}</b><br/>Operator · {contact.city}</div>
      </div>
    </div>
    <div>
      <span class="role">Operator · founder</span>
      <h3>Patrick <em class="em">Korczewski</em></h3>
      <p class="bio">
        Bachelor in IT-Sicherheit, 10+ Jahre IT-Management — Server, Netze, Helpdesk, Strategie. Und seit dem ersten Tag von ChatGPT KI in produktivem Einsatz, nicht im Demo-Modus.
      </p>
      <p class="bio">
        Baut Systeme, die laufen. Self-Hosted Open-Source, DSGVO-konform, multi-cluster Kubernetes. Zeigt es lieber, als darüber zu schreiben.
      </p>
      <dl class="credits">
        <dt>Studium</dt><dd>B.Sc. <em class="em">IT-Sicherheit</em></dd>
        <dt>Jetzt</dt><dd>Betreibt <em class="em">mentolder.de</em>, <em class="em">korczewski.de</em>, diverse Self-Hosted-Stacks</dd>
        <dt>Spricht</dt><dd>Deutsch, Englisch</dd>
        <dt>Findet man</dt><dd>{legal.website}</dd>
      </dl>
    </div>
  </div>
</section>
```

- [ ] **Step 2: KoreContact.astro (verify field names of `DaySlots` first)**

Open `website/src/lib/caldav.ts`. Read the `DaySlots` and slot field names (likely `date`, `slots[]`, each slot has `start`, `time` — adapt the snippet below to the real shape).

```astro
---
import { config } from '../../config/index';
import { getAvailableSlots } from '../../lib/caldav';
const { contact } = config;

let nextDay = null;
try {
  const slots = await getAvailableSlots(undefined, process.env.BRAND_NAME || 'korczewski');
  nextDay = slots.length > 0 ? slots[0] : null;
} catch {
  // CalDAV unreachable — booker shows static fallback
}
---

<section class="w-section" id="contact">
  <div class="head">
    <span class="num">— / 04</span>
    <h2>Mit einem <em class="em">Menschen sprechen,</em> innerhalb einer Woche.</h2>
    <span class="hint">Kein Formular · keine Funnel</span>
  </div>

  <div class="w-contact">
    <div class="panel">
      <h3>Die direkte <em class="em">Linie.</em></h3>
      <p>E-Mail oder Signal. Antworten innerhalb eines Werktags.</p>
      <div class="row"><span class="lab">E-Mail</span><span class="v">
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
        <span class="small">PGP-Key auf Anfrage</span>
      </span></div>
      <div class="row"><span class="lab">Ort</span><span class="v">
        {contact.city}<span class="small">remote &amp; vor Ort im Hamburger Raum</span>
      </span></div>
    </div>

    <div class="booker">
      <span class="lab">Nächster Termin</span>
      <h3>30-Minuten <em class="em">Kennenlernen.</em></h3>
      {nextDay ? (
        <div class="slots">
          {nextDay.slots.slice(0, 6).map((slot: any) => (
            <a href={`/termin?slot=${encodeURIComponent(slot.start)}`} class="slot">
              <span class="day">{nextDay.dayLabel ?? nextDay.date}</span>
              <span class="time">{slot.timeLabel ?? slot.time}</span>
            </a>
          ))}
        </div>
      ) : (
        <p class="note">Aktuell keine freien Slots geladen. <a href="/termin" style="color:var(--copper);">Kalender öffnen →</a></p>
      )}
      <p class="note">Alle Zeiten Europe/Berlin. Kalender-Bestätigung innerhalb einer Stunde.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: KoreFooter.astro**

```astro
---
const buildTime = process.env.BUILD_TIME || new Date().toISOString().slice(0, 16).replace('T', ' · ');
---

<footer class="w-foot">
  <div class="w-foot-inner">
    <div>
      <div class="brand">Kore<span class="dot">.</span></div>
      <p style="color:var(--mute); font-size:13px; margin-top:14px; font-family:var(--mono);">
        Self-hosted Kubernetes-Cluster.<br/>Lüneburg · Helsinki · home-lan.
      </p>
    </div>
    <div class="col">
      <h5>Cluster</h5>
      <a href="#services">Services</a>
      <a href="#timeline">Timeline</a>
      <a href="#bugs">Themen</a>
    </div>
    <div class="col">
      <h5>Leistungen</h5>
      <a href="/leistungen">Übersicht</a>
      <a href="/ki-beratung">KI-Beratung</a>
      <a href="/deployment">Kubernetes</a>
    </div>
    <div class="col">
      <h5>Studio</h5>
      <a href="/ueber-mich">Über mich</a>
      <a href="/kontakt">Kontakt</a>
      <a href="/impressum">Impressum</a>
    </div>
  </div>
  <div class="legal">
    <span>© 2026 Korczewski · Lüneburg</span>
    <span>Last deploy · {buildTime} CET</span>
  </div>
</footer>
```

- [ ] **Step 4: Type-check + commit**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit
cd ..
git add website/src/components/kore/KoreTeam.astro \
        website/src/components/kore/KoreContact.astro \
        website/src/components/kore/KoreFooter.astro
git commit -m "feat(kore): KoreTeam + KoreContact + KoreFooter components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.9: Branch index.astro on BRAND_ID

**Files:**
- Modify: `website/src/pages/index.astro`
- Modify: `website/src/layouts/Layout.astro` (load Kore stylesheets when brand prop set)

- [ ] **Step 1: Imports + brand resolver in index.astro frontmatter**

In `website/src/pages/index.astro`, after the existing imports add:

```astro
import KoreSubNav   from '../components/kore/KoreSubNav.astro';
import KorePillars  from '../components/kore/KorePillars.astro';
import KoreBugs     from '../components/kore/KoreBugs.astro';
import KoreTeam     from '../components/kore/KoreTeam.astro';
import KoreContact  from '../components/kore/KoreContact.astro';
import KoreFooter   from '../components/kore/KoreFooter.astro';
import KoreHero     from '../components/kore/KoreHero.svelte';
import KoreTimeline from '../components/kore/KoreTimeline.svelte';
import { listTimeline } from '../lib/website-db';

const BRAND_ID = process.env.BRAND_ID ?? 'mentolder';
const initialTimeline = BRAND_ID === 'korczewski'
  ? await listTimeline({ limit: 20 }).catch(() => [])
  : [];
```

- [ ] **Step 2: Branch the page body**

Replace the existing `<Layout>...</Layout>` invocation with:

```astro
{BRAND_ID === 'korczewski' ? (
  <Layout title="Kore. — Self-hosted, vor Ihren Augen." brand="korczewski-kore">
    <style is:global>@import '../styles/kore-website.css';</style>
    <KoreSubNav />
    <KoreHero client:load />
    <KorePillars />
    <KoreTimeline client:load initialRows={initialTimeline} />
    <KoreBugs />
    <KoreTeam />
    <KoreContact />
    <KoreFooter />
  </Layout>
) : (
  <Layout title={config.meta.siteTitle}>
    {/* EXISTING mentolder layout — copy verbatim from current file */}
  </Layout>
)}
```

(Place the *exact* current `<Layout>…</Layout>` block in the `else` branch.)

- [ ] **Step 3: Pass brand prop through Layout**

Open `website/src/layouts/Layout.astro`. In the frontmatter `Astro.props` destructure, add `brand`. Optionally toggle a body class or stylesheet load:

```astro
---
const { title, brand } = Astro.props as { title: string; brand?: string };
const isKore = brand === 'korczewski-kore';
---

<head>
  ... existing tags ...
  {isKore && <link rel="stylesheet" href="/brand/korczewski/colors_and_type.css" />}
</head>
<body class={isKore ? 'kore' : ''}>
  ...
</body>
```

(The `kore-website.css` import is already global via the `<style is:global>` block in index.astro — no extra wiring needed for it.)

- [ ] **Step 4: Type-check + dev-build**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit
BRAND_ID=korczewski PROD_DOMAIN=korczewski.de BRAND_NAME=KORE npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/index.astro website/src/layouts/Layout.astro
git commit -m "feat(kore): branch index.astro on BRAND_ID for korczewski Kore homepage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.10: Playwright E2E spec

**Files:**
- Create: `tests/e2e/services/korczewski-home.spec.ts`

- [ ] **Step 1: Spec**

```typescript
import { test, expect } from '@playwright/test';

const URL = process.env.KORCZEWSKI_URL ?? 'https://web.korczewski.de/';

test.describe('Korczewski Kore homepage', () => {
  test('hero renders with brand wordmark and headline', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.shell-brand').getByText('Kore')).toBeVisible();
    await expect(page.locator('.w-hero h1')).toContainText('Self-hosted');
    await expect(page.locator('.w-hero .em').first()).toContainText('vor Ihren Augen');
  });

  test('pillars section shows 4 tiles', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.w-services .w-svc')).toHaveCount(4);
  });

  test('timeline loads at least 1 row', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('#timeline .log li')).not.toHaveCount(0);
  });

  test('known issues section renders', async ({ page }) => {
    await page.goto(URL);
    const section = page.locator('#bugs');
    await expect(section).toBeVisible();
    const empty = section.locator('.empty');
    const bugs  = section.locator('.bugs li');
    await expect(empty.or(bugs)).toBeVisible();
  });

  test('mentolder homepage is unaffected', async ({ page }) => {
    await page.goto('https://web.mentolder.de/');
    await expect(page.locator('text=mentolder').first()).toBeVisible();
    await expect(page.locator('.w-hero')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/services/korczewski-home.spec.ts
git commit -m "test(kore): Playwright spec for korczewski Kore homepage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.11: Deploy and verify

- [ ] **Step 1: Validate manifests**

```bash
cd /home/patrick/Bachelorprojekt
task workspace:validate ENV=korczewski
task workspace:validate ENV=mentolder
```

Expected: no errors.

- [ ] **Step 2: Deploy korczewski**

```bash
task website:deploy ENV=korczewski 2>&1 | tail -20
```

Expected: rollout succeeds.

- [ ] **Step 3: Deploy mentolder (verify the build still passes for the other brand)**

```bash
task website:deploy ENV=mentolder 2>&1 | tail -20
```

Expected: rollout succeeds.

- [ ] **Step 4: Verify both URLs**

```bash
curl -sIL https://web.korczewski.de/ | head -3
curl -sIL https://web.mentolder.de/  | head -3
```

Expected: both 200.

- [ ] **Step 5: Smoke-test contents**

```bash
curl -sL https://web.korczewski.de/ | grep -E 'Kore<span|Self-hosted|Implementierte' | head
curl -sL https://web.mentolder.de/  | grep -c 'Kore<span'
```

Expected: korczewski matches Kore wordmark + "Self-hosted" + "Implementierte"; mentolder shows 0 Kore matches.

- [ ] **Step 6: Run Playwright spec live**

```bash
KORCZEWSKI_URL=https://web.korczewski.de/ \
  npx playwright test tests/e2e/services/korczewski-home.spec.ts --project=chromium
```

Expected: all 5 tests pass.

- [ ] **Step 7: Push**

```bash
git push origin main
```

Expected: push succeeds.

---

### Task 4.12: Document in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a section**

Append under the "Gotchas & Footguns" section:

```markdown
### Korczewski homepage uses the Kore design system (different from mentolder)

`web.korczewski.de` and `web.mentolder.de` no longer share a layout. `website/src/pages/index.astro` branches on `process.env.BRAND_ID === 'korczewski'` and renders the components under `website/src/components/kore/`. Mentolder still uses the existing Hero/WhyMe/ServiceRow/... Svelte components.

The Kore homepage shows a live PR-driven timeline:
- Every merged PR triggers `.github/workflows/track-pr.yml` → writes `tracking/pending/<pr>.json`.
- The `tracking-import` CronJob in workspace ns drains pending into `bachelorprojekt.features` every 5 minutes.
- The homepage reads `bachelorprojekt.v_timeline` (joined to `bugs.bug_tickets.fixed_in_pr` for fix counts) via `/api/timeline`.

To backfill historical PRs once: `task tracking:backfill && task tracking:ingest:local` (the latter requires `TRACKING_DB_URL` from a port-forward).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document Kore homepage + tracking flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 4 done — korczewski.de is live with the Kore design and a live timeline.**

---

## Phase 5 — Follow-ups (separate plans)

Tracked here for visibility, not scheduled:
- **Real cluster summary endpoint** in the dashboard (`/api/cluster/summary`) so `/api/cluster/status` returns live numbers.
- **Kore App shell adoption** for the in-product admin UI.
- **Kore document templates** replacing existing PDF generators.
- **Tracking-import CronJob → git push** so consumed pending files are auto-deleted from main.
- **Notes/blog index** at `/notes`.

---

## Self-review

- **Spec coverage:**
  - Library sync — Phase 1 ✓
  - Mentolder mirror — Task 1.3 ✓
  - Schema (features table + view, bug_tickets ALTER) — Phase 2 ✓
  - PR-tracking automation — Tasks 3.1–3.3 ✓
  - Retroactive backfill — Tasks 3.4–3.5 ✓
  - Korczewski homepage components — Tasks 4.2–4.8 ✓
  - Brand resolver — Task 4.9 ✓
  - Mentolder unchanged guarantee — Task 4.10 (mentolder smoke test) + Task 4.11 (deploy + verify) ✓

- **Placeholder scan:** none. Two intentionally-acknowledged adaptation points (KoreContact field-name match against `lib/caldav.ts`; `getPool()` name in website-db.ts) are explicit with the verification step inline.

- **Type consistency:** `TimelineRow` defined in Task 4.6 is re-used identically in Tasks 4.6/4.9. `BugTicketRow` field additions in Task 2.2 propagate to KoreBugs.astro in Task 4.7. `parsePr` return shape in Task 3.1 matches what `writeRowToDb` consumes (same task) and what the CronJob ingests (Task 3.3).

- **Risk reminders:** the GH Action commits to main; `git pull --rebase` retry loop handles concurrent merges. The CronJob doesn't push back; consumed-but-uncommitted pending files accumulate harmlessly thanks to ON CONFLICT upsert on next ingest.
