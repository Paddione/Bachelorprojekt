# website/CLAUDE.md

Full standards in `website/WEBSITE-STANDARDS.md`. This file is the quick reference for agents.

## Dev Quick-Start

```bash
cd website
pnpm install
pnpm dev          # http://localhost:4321
```

Requires a local Postgres with the `bachelorprojekt` database (or `DATABASE_URL` pointing to dev cluster via port-forward on 15432).

## Two-Group Content Model

**Group A — Central** (change once, applies everywhere):
- Contact: email, phone, city → Admin → Kontakt-Tab → `site_settings key='kontakt'`
- Footer tagline, copyright → same tab (`kontaktOverride.*`)
- SEO titles + meta-descriptions → Admin → SEO-Tab → `site_settings key='seo_title_*'`
- Footer service order → Admin → Angebote-Tab (arrow order = `getEffectiveServices()`)

**Group B — Page-specific**: each service page has its own Admin tab.

## Data-Flow Priority Chain

```
DB-Override (Admin saved)
  > pageContent in service_config
    > config.services[].pageContent (mentolder.ts static fallback)
```

Kontakt/Footer: `getEffectiveKontakt()` → `site_settings` → `config.contact` fallback.

## Key Files

| Purpose | File |
|---------|------|
| All static fallbacks | `src/config/brands/mentolder.ts` |
| Universal service template | `src/pages/[service].astro` |
| Content merge helpers | `src/lib/content.ts` |
| DB read/write | `src/lib/website-db.ts` |
| Admin tab router | `src/components/admin/InhalteEditor.svelte` |
| Universal service admin | `src/components/admin/inhalte/ServicePageSection.svelte` |
| Universal save API | `src/pages/api/admin/service-page/save.ts` |

## `__introNote__` Pattern

A section with `title: '__introNote__'` renders as an italic personal note block **before** the "Für wen" grid — filtered out of the normal sections list in `[service].astro`.

## Adding a New Service Page

1. Add entry to `services[]` in `mentolder.ts` (slug, title, pageContent with seoTitle/seoDescription)
2. After deploy: Admin → tab → Speichern (creates DB-override)
3. Admin → SEO-Tab: verify title/description
4. Admin → Angebote-Tab: adjust card order (= Footer order)
5. Ensure `hidden !== true`

## Footguns

- **First save after deploy**: new pages in `mentolder.ts` need one Admin save to activate DB-override
- **CONTACT_CITY in workflow**: `.github/workflows/build-website.yml` must have `"Lüneburg, Hamburg und Umgebung"` — not just `"Hamburg"`
- **Brand name**: always `mentolder` (lowercase m), never `Mentolder` except at sentence start
- **Runtime vs admin values**: `CONTACT_EMAIL`, `LEGAL_*` etc. are read at runtime from `process.env` (ConfigMap, envsubst'd in the deploy step) — `website/Dockerfile` has no `ARG` line, so the workflow `--build-arg`s are no-ops and nothing is baked at build time; `footerCity`, tagline, copyright stay admin-overridable at runtime
- **New image takes ~3-4 min** after merge; check in incognito to avoid cache

## Content Standards

- Location: `Lüneburg, Hamburg und Umgebung` (with `· DE` in header/footer)
- Copyright: `© 2026 mentolder — Alle Rechte vorbehalten`
- Führungserfahrung: **30+ Jahre** (not 40+); IT/Sicherheit: **40 Jahre**
- SEO title: 50–70 chars, format `{Description} | mentolder.de`
- SEO description: 120–160 chars, include location
