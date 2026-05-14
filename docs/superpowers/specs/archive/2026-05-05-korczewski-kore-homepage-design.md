# Korczewski.de — Kore homepage + project timeline

**Date:** 2026-05-05
**Brand:** korczewski (mentolder unaffected)
**Status:** spec for review

## Goal

Replace the shared mentolder/korczewski homepage on `web.korczewski.de` with a unique **product-showcase** site built on the **Kore design system** (delivered as the Anthropic Design bundle `BqxMXwsTiIaYMbqOsCwrOg`). The new site advertises the workspace-MVP cluster itself — what runs in it, what features ship, what's broken, what's been fixed — backed by live data from the existing tracking-DB and bug-tickets DB.

## Why now

- `web.korczewski.de` and `web.mentolder.de` currently render the same `index.astro` and `Hero.svelte`; only text and accent color differ. Korczewski.de has no distinctive identity.
- A complete brand kit ("Kore Design System") was produced by Claude Design and is now sitting in `art-library/sets/korczewski/` only as the partial portfolio handoff. The full bundle (website CSS, app shell, document templates, k8s-wheel + topology illustrations, 22 preview cards, SKILL.md) is not yet imported.
- The project's history (PRs, features, bugs) lives in two separate places (git, `bugs.bug_tickets`) and is not surfaced anywhere user-visible. The bachelor thesis benefits from a public-facing timeline that shows what was built and when.

## Scope

### In scope (this spec)

1. **Library sync** — full bundle import into `art-library/sets/korczewski/`; reverse-engineered structurally identical bundle for `art-library/sets/mentolder/`.
2. **Schema** — `bachelorprojekt.features` table in tracking-DB (new); `fixed_in_pr` column on `bugs.bug_tickets` (alter).
3. **PR-tracking automation** — GitHub Action on `pull_request: closed && merged == true` that writes feature/bugfix rows.
4. **Retroactive backfill** — one-shot script that reads all closed PRs via `gh` and populates features/bugfix data with idempotent upserts.
5. **Korczewski homepage redesign** — adapt `kore-design-system/project/ui_kits/website/Website.jsx` to Astro components, populated with live data from tracking-DB + bug-tickets DB.
6. **Brand resolver** — homepage forks at the layout level by `process.env.BRAND_ID`. Mentolder keeps its current homepage intact.

### Out of scope (kept as library references for future)

- Implementation of the app shell (`AppShell.jsx`), document templates (invoice/contract/newsletter/questionnaire), tweaks panel.
- Migrating other korczewski pages (`/leistungen`, `/ueber-mich`, etc.) to the Kore aesthetic — those continue using the shared template until a follow-up spec.
- Auth/admin tooling for editing features/bugs (existing admin/bugs page already works; features are mostly populated by the PR hook).
- App shell + portfolio characters being used on the public site (they stay in the library as reference assets only).

## Architecture

### Library sync

```
art-library/sets/korczewski/
├── README.md                 (NEW — bundle README + provenance)
├── SKILL.md                  (NEW — agent skill manifest, copied verbatim)
├── colors_and_type.css       (UPDATE — copy bundle root, supersedes existing tokens.css)
├── tokens.css                (DELETE — replaced by colors_and_type.css)
├── manifest.json             (UPDATE — extend with bundle assets)
├── CREDITS.md                (KEEP)
├── styles/
│   ├── website.css           (NEW)
│   └── app.css               (NEW)
├── assets/
│   ├── k8s-wheel.svg         (NEW)
│   ├── topology-3node.svg    (NEW)
│   ├── logo-mark.svg         (UPDATE — replace; bundle version is canonical)
│   ├── logo-lockup-dark.svg  (UPDATE)
│   └── logo-lockup-light.svg (UPDATE)
├── ui_kits/
│   ├── website/              (NEW — full HTML+JSX kit, kept as reference)
│   ├── app/                  (NEW — app shell kit, reference only)
│   ├── documents/            (NEW — invoice/contract/newsletter/questionnaire HTML)
│   └── tweaks-panel.jsx      (NEW)
├── preview/                  (NEW — 22 component preview cards)
├── chats/                    (NEW — original Claude Design transcripts)
└── portfolio/                (RENAMED from existing root — characters/props/terrain stay here)
    ├── characters/
    ├── props/
    ├── terrain/
    ├── logos/
    ├── characters.jsx
    ├── assets.jsx
    └── Portfolio.html
```

**Rationale for `portfolio/` subfolder:** the figures/props/terrain came from a separate Claude Design conversation about a virtual tabletop board; they are not part of the consultancy-brand identity (the Kore README explicitly says *no emoji, no fantasy figures*). Keeping them under `portfolio/` makes the separation clear without losing the assets.

### Mentolder mirror

Reverse-engineered from the live mentolder homepage (`website/src/pages/index.astro`, `website/src/components/*.svelte`, `website/public/brand/mentolder/`):

```
art-library/sets/mentolder/
├── README.md                 (NEW — describe brand voice, casing, color, type rules)
├── SKILL.md                  (NEW — agent skill manifest)
├── colors_and_type.css       (UPDATE — copy from website/public/brand/mentolder/)
├── manifest.json             (UPDATE)
├── styles/
│   ├── website.css           (NEW — extracted from current Astro/Svelte styles)
│   └── app.css               (NEW — extracted from admin layout styles)
├── assets/
│   └── (logos already present — keep)
├── ui_kits/
│   └── website/
│       ├── index.html        (NEW — static snapshot of current home)
│       └── README.md
├── preview/                  (NEW — 8–10 component preview cards: button, hero, stat, FAQ, service-row, kicker-row, slot widget, portrait)
└── portfolio/                (RENAMED — characters/props/terrain from existing root)
```

The mentolder kit doesn't need to be 1:1 with the Kore bundle — it just needs to be a *self-contained reference* a future agent (or designer) can use to recreate the brand from the library alone.

### Schema additions

**`bachelorprojekt.features`** (tracking-DB, shared-db postgres):

```sql
CREATE TABLE bachelorprojekt.features (
  id            SERIAL PRIMARY KEY,
  pr_number     INTEGER UNIQUE,             -- nullable for manual entries
  title         TEXT NOT NULL,              -- German, ≤ 120 chars, used as headline
  description   TEXT,                       -- markdown allowed
  category      TEXT NOT NULL,              -- 'feat' | 'fix' | 'chore' | 'docs' | 'infra'
  scope         TEXT,                       -- conventional-commit scope: 'website', 'infra', 'stream', etc.
  brand         TEXT,                       -- nullable; if set: 'mentolder' | 'korczewski' (timeline filter)
  requirement_id TEXT REFERENCES bachelorprojekt.requirements(id) ON DELETE SET NULL,
  merged_at     TIMESTAMPTZ NOT NULL,
  merged_by     TEXT,
  status        TEXT NOT NULL DEFAULT 'shipped' CHECK (status IN ('planned','in_progress','shipped','reverted')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_features_merged_at ON bachelorprojekt.features (merged_at DESC);
CREATE INDEX idx_features_category  ON bachelorprojekt.features (category);
CREATE INDEX idx_features_brand     ON bachelorprojekt.features (brand);

-- Public-facing timeline view (joins to bug fixes for context)
CREATE OR REPLACE VIEW bachelorprojekt.v_timeline AS
SELECT
  f.merged_at::date AS day,
  f.pr_number, f.title, f.description, f.category, f.scope, f.brand,
  f.requirement_id, r.name AS requirement_name, r.category AS requirement_category,
  (SELECT COUNT(*) FROM bugs.bug_tickets bt WHERE bt.fixed_in_pr = f.pr_number) AS bugs_fixed
FROM bachelorprojekt.features f
LEFT JOIN bachelorprojekt.requirements r ON r.id = f.requirement_id
ORDER BY f.merged_at DESC;
```

**`bugs.bug_tickets`** (website-db) — additive:

```sql
ALTER TABLE bugs.bug_tickets
  ADD COLUMN IF NOT EXISTS fixed_in_pr   INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets (fixed_in_pr);
```

The schema migration files live next to the existing schema:
- `deploy/tracking/init.sql` — append the new `features` table + view
- `k3d/website-schema.yaml` — extend the bug_tickets ConfigMap migration

Both schemas are applied via existing tooling (`task workspace:deploy` runs `psql`-based init jobs); no new deploy mechanics needed.

### PR-tracking GitHub Action

`.github/workflows/track-pr.yml` triggers on `pull_request: types: [closed]` (only acts when `merged == true`). Steps:

1. Parse `${{ github.event.pull_request.title }}`. Match conventional-commit prefix: `^(feat|fix|chore|docs|refactor|infra)(\(([^)]+)\))?: (.+)$`.
2. From the body, scan for `Fixes BR-\d{8}-\d{4}` / `Closes BR-…` / `Resolves BR-…` references.
3. From the body, scan for `Resolves FA-\d+` / `SA-\d+` etc. for requirement links.
4. Open a temporary connection to shared-db via the existing `shared-db` Service exposed for ops, using a Kubernetes-style sealed PG password stored in repo secrets (`TRACKING_DB_URL`).
5. `INSERT ... ON CONFLICT (pr_number) DO UPDATE` into `bachelorprojekt.features`.
6. For each `BR-XXXX` referenced: `UPDATE bugs.bug_tickets SET fixed_in_pr = $1, fixed_at = now(), status = 'archived' WHERE ticket_id = $2`.
7. Step is `continue-on-error: true` so a tracking failure never blocks PR merges.

A small Node script `scripts/track-pr.mjs` does the parsing + DB writes; the workflow just invokes it. The script is idempotent and can also be run locally.

### Retroactive backfill

`scripts/backfill-features.sh` (Bash + `gh` + `psql`):

```bash
#!/usr/bin/env bash
# Walks all closed PRs on origin and populates bachelorprojekt.features
# + bugs.bug_tickets.fixed_in_pr. Idempotent (uses ON CONFLICT upserts).
set -euo pipefail
gh pr list --state merged --limit 1000 \
  --json number,title,body,mergedAt,mergedBy,labels \
  | node scripts/track-pr.mjs --backfill
```

Re-uses the same parsing/writing module as the live hook. Running it once after deploy seeds the historical timeline; running it again does nothing.

### Korczewski homepage

New entry: `website/src/pages/index.korczewski.astro` (or branched in existing `index.astro` based on `process.env.BRAND_ID === 'korczewski'`). Decision: **branch in existing index.astro** to keep the routing simple — the file selects which Astro components to render. Components live in `website/src/components/kore/`.

**Page sections** (top-down):

| # | Section    | Component                                | Data source                                   |
|---|------------|------------------------------------------|-----------------------------------------------|
| — | SubNav     | `KoreSubNav.astro`                       | static                                         |
| — | Hero       | `KoreHero.svelte` (live ticker)          | `/api/cluster/status` (live cluster stats)    |
| 01| Pillars    | `KorePillars.astro` (4 tiles)            | static config (Auth, Files, Vault, Stream/KI) |
| 02| Timeline   | `KoreTimeline.svelte` (paginated list)   | `bachelorprojekt.v_timeline` view             |
| 03| Known issues| `KoreBugs.astro`                        | `bugs.bug_tickets WHERE status='open'`        |
| 04| Operator   | `KoreTeam.astro` (Patrick Korczewski)    | static + portrait                              |
| — | Contact    | `KoreContact.svelte` (CalDAV slots)      | existing `getAvailableSlots()`                |
| — | Footer     | `KoreFooter.astro`                       | static + last-deploy timestamp                 |

**Brand wordmark:** `Kore.` in Instrument Serif with the period in `var(--copper)`. The string `Korczewski` only appears in the legal section of the footer.

**Styles:** `import '../../public/brand/korczewski/colors_and_type.css'` plus the bundle's `styles/website.css` copied to `website/src/styles/kore-website.css`. App.css is *not* needed for the marketing page; it stays in the library only.

**Live ticker:** small WebSocket-or-poll component reading `/api/cluster/status` (new endpoint) which calls `kubectl get nodes,pods` via the existing `mcp__kubernetes` ServiceAccount the dashboard already uses. Reports active node count + workload count. Falls back to a static "Verfügbar" pill if the endpoint fails.

**Hero copy** (locked):

- Eyebrow: `[ JETZT IN BETRIEB ]`
- Headline: "Self-hosted, *vor Ihren Augen.*"
- Lede: "Diese Seite läuft auf einem 12-Node-Kubernetes-Cluster, den ich selbst gebaut, deploye und betreibe. Alles, was Sie hier sehen — Auth, Dateien, Office, KI, Whiteboard, Stream, Buchung, Abrechnung — ist Open-Source, DSGVO-konform und auf einem einzigen Cluster zu Hause. *Das hier ist die Demo.*"
- CTAs: `Kennenlernen →` (links to `/kontakt`), `Notizen lesen` (links to `/notes` if exists, else `#timeline`)
- Meta-row: `B.Sc. IT-Sec` · `10+ Jahre IT` · `KI seit Tag 1` · `12 Nodes`

**Pillar tiles** (4 tiles, glyphs from `art-library/sets/korczewski/assets/k8s-wheel.svg` + Lucide line-icons substitutes):

1. **SSO & Identität** — Keycloak, OIDC. Tags: `KEYCLOAK`, `OIDC`.
2. **Dateien & Talk** — Nextcloud + Talk + Whiteboard + Collabora. Tags: `NEXTCLOUD`, `TALK`, `COLLABORA`.
3. **Vault & Secrets** — Vaultwarden + Sealed Secrets. Tags: `VAULTWARDEN`, `SEALED`.
4. **Stream & KI** — LiveKit + Claude Code MCP + Whisper. Tags: `LIVEKIT`, `MCP`, `WHISPER`.

**Timeline** (most recent 20 features, paginated):
- Each row: `[date, mono]` `[title with one italic phrase, serif]` `[PR# pill, mono]`.
- If `bugs_fixed > 0`, append a small cyan pill `+1 fix` (or however many).
- Filter chips: `Alle / feat / fix / infra / website` driven by URL query (`?cat=…`).
- "Show more" loads next page via API.

**Known issues** (open bug_tickets, brand=korczewski OR brand IS NULL):
- 3-column compact grid: `[ticket_id, mono]` `[title]` `[status pill]`.
- Read-only on the public homepage. Filing new ones still happens through the existing `/admin/bugs` flow (auth-gated).

**Operator section:** keeps the Kore team layout — portrait card (gradient placeholder + ID label "P. Korczewski · Lüneburg / Hamburg"), bio paragraphs, credits dl. Real photo can be dropped in later.

**Contact section:** straight-line panel + booker. Booker reuses the existing `SlotWidget.astro` rendering but in Kore styling.

**Footer:** 4 columns (Kore. / Cluster / Services / Studio). Legal rule shows `© 2026 Korczewski. Lüneburg` left, `Last deploy · YYYY-MM-DD · HH:MM` right. The deploy timestamp comes from `process.env.BUILD_TIME` injected at build (already set by `task website:deploy`).

### Data flow

```
GitHub PR merged
   └→ Action: track-pr.yml
        └→ scripts/track-pr.mjs (parses title + body)
             └→ INSERT INTO bachelorprojekt.features
             └→ UPDATE bugs.bug_tickets SET fixed_in_pr = …

Korczewski homepage build
   └→ Astro reads bachelorprojekt.v_timeline + bugs.bug_tickets
        └→ Renders timeline + known-issues sections (SSR per request)

Browser opens web.korczewski.de
   └→ Hero ticker polls /api/cluster/status every 30s
   └→ Timeline "Show more" hits /api/timeline?offset=N
```

## Testing

- **Schema migrations:** apply via `task workspace:db:start` then run init.sql; idempotent re-application succeeds.
- **PR hook:** unit tests for the parser (`scripts/track-pr.mjs.test.mjs`) covering ~10 PR title variations, including ones with no scope, no prefix, and `Fixes BR-…` references.
- **Backfill:** dry-run mode (`--dry-run`) prints what would be inserted without writing. Verified manually against 5–10 known PRs before running for real.
- **Homepage:** Playwright spec `tests/e2e/services/korczewski-home.spec.ts` covering hero render, pillar tiles visible, timeline loads ≥1 row, known-issues section renders.
- **Manifest validation:** `task workspace:validate ENV=korczewski` after manifest edits.

## Migration plan

1. Library sync (no runtime impact — pure file copies).
2. Mentolder kit reverse-engineering (no runtime impact).
3. Schema migrations applied to mentolder cluster (single shared cluster post-merge).
4. Backfill script run once locally with `--dry-run`, then live.
5. PR hook deployed (`.github/workflows/track-pr.yml`); first live PR merge populates one row.
6. Build new Astro components behind a feature flag (`BRAND_ID === 'korczewski'`).
7. Deploy via `task website:deploy ENV=korczewski` then `ENV=mentolder` (mentolder needs the new build to compile cleanly — its homepage path doesn't change).
8. Verify `web.korczewski.de` renders the new design and `web.mentolder.de` is unchanged.

## Risks

- **DB connection from GitHub Actions** — shared-db is not internet-exposed. Solution: PR hook writes to a *small queue file in the repo* (commit a JSON line), and a CronJob in the cluster pulls and applies it; or run the script via a self-hosted runner inside the cluster. **Decision:** self-hosted runner is overkill; pick the simpler approach — commit a JSON line to `tracking/pending/<pr>.json`, and a CronJob (`tracking-import`, every 5 min) ingests + deletes them. Already-merged PRs without a queue entry are caught by the next backfill run.
- **PR title parsing brittleness** — titles that don't follow conventional commits get categorized as `chore` with a warning. Backfill emits a CSV report of skipped PRs for manual triage.
- **Live cluster ticker latency / failure** — falls back to a static pill, no error shown to user.
- **Mentolder regression risk** — homepage stays at `index.astro` for mentolder; korczewski branch only activates when `BRAND_ID === 'korczewski'`. Smoke test both URLs after deploy.

## Open decisions for review

- Pillar count: locked at 4 (Auth, Files, Vault, Stream+KI) — the live cluster has 8+ services but 4 reads cleanly. Override if you want 3 or 6.
- Timeline pagination size: 20 per page.
- Live ticker poll interval: 30 s (low-traffic site, no need for WebSocket).
- Whether the timeline shows mentolder PRs too: yes by default (everything in this repo); filter via `?brand=korczewski` if needed.

## File touch-list (deltas only)

```
NEW:
  art-library/sets/korczewski/{README.md, SKILL.md, styles/, assets/k8s-wheel.svg, assets/topology-3node.svg, ui_kits/, preview/, chats/}
  art-library/sets/mentolder/{README.md, SKILL.md, styles/, ui_kits/, preview/}
  website/src/components/kore/{KoreSubNav, KoreHero, KorePillars, KoreTimeline, KoreBugs, KoreTeam, KoreContact, KoreFooter}.{astro,svelte}
  website/src/pages/api/timeline.ts
  website/src/pages/api/cluster/status.ts
  website/src/styles/kore-website.css
  scripts/track-pr.mjs
  scripts/backfill-features.sh
  .github/workflows/track-pr.yml
  k3d/tracking-import-cronjob.yaml
  tracking/pending/.gitkeep
  tests/e2e/services/korczewski-home.spec.ts

CHANGED:
  art-library/sets/korczewski/{characters,props,terrain,logos,*.json,*.css}  → moved under portfolio/
  deploy/tracking/init.sql                          → append features table + view
  k3d/website-schema.yaml                            → ALTER bugs.bug_tickets
  website/src/pages/index.astro                      → branch on BRAND_ID
  website/src/lib/website-db.ts                      → bug_tickets.fixed_in_pr in row type + queries
  Taskfile.yml                                       → task tracking:backfill task
  CLAUDE.md                                          → mention tracking auto-import flow

UNCHANGED (explicitly):
  website/src/components/Hero.svelte and other shared components — mentolder still uses them
  prod/, prod-mentolder/, prod-korczewski/ — no manifest changes beyond the schema/cronjob YAML
```

## Approval needed

Please review and confirm. Specific points worth your attention:

1. **GitHub Action → DB write strategy** — I picked "commit JSON to repo + cronjob ingests" over "self-hosted runner." Does that fit how you usually do this? If you'd prefer the runner path, I'll switch.
2. **Schema lives in `bachelorprojekt`** — extending the existing thesis-tracking schema vs. creating a new `tracking` schema. I picked the former (continuity).
3. **Homepage forks via `BRAND_ID` in `index.astro`** vs. a new `index.korczewski.astro` file. Either works; chose the env-branch for fewer files.
4. **Pillar choices** — Auth / Files / Vault / Stream+KI. Want a different cut?

Once you confirm or redirect on those four, I'll move to writing the implementation plan.
