# Content-Hub: Price Single-Source-of-Truth & Full Homepage Editability — Design

**Date:** 2026-05-29
**Branch:** `feature/content-hub-editability`
**Ticket:** T000305 (grilling/feature) · out-of-scope follow-up: T000306
**Depends on:** T000304 (`fix/admin-save-schema-init-race`) — must merge first; this branch rebases onto it.

## Problem

The mentolder/korczewski homepage content is DB-backed (`website` DB) and edited via `/admin/inhalte` (`InhalteEditor.svelte`). Two structural problems:

1. **Price redundancy.** A single price is entered in up to **four** independent places with no shared source of truth, no FK, and no dedup. Changing one silently drifts from the others:
   - Service **card** headline — `service_config.services_json[].price` (free text, e.g. `"Ab 60 € / Stunde"`)
   - Service **detail-page** tiers — `service_config.services_json[].pageContent.pricing[]`
   - **Leistungskatalog** — `leistungen_config.categories_json[].services[].price` (the richest/most structured store: categories → priced rows, each with a stable `key`)
   - **Highlight table** — `leistungenPricingHighlight[]` (e.g. "Einzelstunde 50+ Digital — 60 € — Netto gem. §19 UStG")

2. **Editability gaps.** Several homepage elements render only from static `config/brands/*.ts` or build-time env vars, so they require a code redeploy to change and are **not in the daily DB backup** (only in git): navigation menu, footer structure + copyright, hero name/role (`CONTACT_NAME`/`LEGAL_JOBTITLE`), Kore avatar initials, Kore timeline toggle, and contact master-data (`CONTACT_*`/`LEGAL_*`).

## Goal

Editing a price **once** propagates everywhere it appears, the **whole homepage** is editable in the admin UI without a redeploy, and **all** editable content lives in the `website` DB so it is captured by the nightly `db-backup`. Editors include non-technical staff: no JSON, no hidden coupling, clearly labelled fields, mobile-usable. Free-text prices remain valid. Zero data loss on migration. No new external calls (DSGVO). Static fallbacks remain for empty DB rows.

## Non-goals (deferred to T000306)

- Rechtstexte editor (Impressum/Datenschutz/AGB) — already has its own editor; here we only re-wire its **data source**, we do not build/extend its editor.
- Service-detail-page body text (only prices are consolidated; other `pageContent` fields unchanged).
- Editability of non-homepage pages beyond what already exists (Über-mich, Kontakt, SEO, service-page full content).
- Visual redesign of the admin editor.
- Content versioning / undo history.

## Approach

**Chosen: (A) clean SSOT — cards/detail/highlight become read-only projections of the catalog.** The Leistungskatalog (`leistungen_config`) is the single price store; every other price surface *reads* from it. Rejected alternatives: (B) add catalog links but keep old price fields as back-compat overrides — leaves escape-hatch fields that drift again; (C) keep all surfaces editable with a save-time sync engine — retains the redundant UI and adds fragile copy logic. Only (A) structurally prevents double-entry.

The catalog's categories already map **1:1** to the homepage service cards by title (*Führungskräfte-Coaching*, *50+ Digital*, *Unternehmensberatung*), which is what makes "catalog wins" feasible without fuzzy matching.

## Design

### 1 · Canonical price store + projections

**Canonical:** `leistungen_config.categories_json` — `LeistungCategoryOverride[]` with `services: LeistungServiceOverride[]` (each `{ key, name, price, unit, desc, highlight }`). `price` stays free text. This is the *only* place a price is entered.

**Service card** (`ServiceOverride` in `website/src/lib/website-db.ts`):
- **Add:** `leistungCategoryId: string` (FK-by-value to a catalog category `id`), `headlineKey: string` (the catalog row whose price is the card headline), `headlinePrefix?: boolean` (render `"ab "` before the price).
- **Remove from editing:** `price` and `pageContent.pricing[]` are no longer editable. They are retained in the type as optional/legacy for back-compat read fallback during/after migration, but the admin UI no longer exposes them and the resolver prefers the catalog projection.

**Card headline render:** `headlinePrefix ? "ab " : "") + catalogRow(headlineKey).price` (+ `unit` if present). Free-text rows (`"nach Vereinbarung"`) render verbatim; `headlinePrefix` should be off for those (editor choice).

**Detail page tiers:** render **all** rows of the linked category in catalog order, using the row `highlight` flag for emphasis. The separate `pricing[]` tier editor is removed.

**Highlight table** (`leistungenPricingHighlight`): becomes `Array<{ catalogKey: string; note?: string; highlight?: boolean }>` — a pick-list referencing catalog rows; `label`/`price` are read from the referenced catalog row, only `note` (e.g. "Netto gem. §19 UStG") and `highlight` are local. A special non-catalog entry type is allowed for the "Erstgespräch — Kostenlos" free row (`{ label, price, note }` literal), since it has no catalog backing.

### 2 · New editable sections (static → DB)

Follow the existing `site_settings` key→JSON pattern (same as `homepage`, `kontakt`). New keys, each brand-scoped, each with DB-override → static-config fallback:

| Key | Holds |
|---|---|
| `navigation` | `Array<{ label, href, order }>` |
| `footer` | `{ columns: Array<{ heading, links: Array<{label, href}> }>, copyright }` |
| `stammdaten` | single master record: `{ name, role, email, phone, street, zip, city, ustId, website, avatarInitials }` |
| `kore_flags` | `{ timeline: boolean }` (Kore-only; ignored for mentolder) |

`stammdaten` is the **single master record** for contact/legal identity, feeding hero (name/role/avatar), footer, Kontakt page, **and the Impressum (read-only)** — so editing the address once keeps all four consistent. The Impressum render path is re-pointed to read `stammdaten` instead of `LEGAL_*` env vars; its editor remains out of scope.

### 3 · Read / render path

Extend `website/src/lib/content.ts` with a single resolver layer that composes the effective homepage from canonical sources:
- Cards: headline price derived from catalog via `headlineKey`.
- Detail: full linked catalog category.
- Hero / footer / Kontakt / Impressum: from `stammdaten`.
- Nav / footer structure: from `navigation` / `footer` keys.
- Highlight table: catalog rows resolved by `catalogKey`.

Every resolver falls back to the brand's static config (`config/brands/<brand>.ts`) when the DB row/field is absent — preserving today's behaviour (empty row ⇒ sensible defaults, never a blank screen).

### 4 · Admin UI (`InhalteEditor.svelte` + the relevant `AngeboteSection.svelte` / new sections)

- **Catalog = price hub:** each category row list gains a "headline" radio (exactly one per category) and an "ab"-prefix toggle. This is where prices are typed.
- **Card editor (Angebote):** a catalog-category dropdown + a headline-row picker (the rows of the chosen category). The free-text `price` input and the `pageContent.pricing[]` tier editor are removed.
- **Highlight table editor:** checklist of catalog rows (grouped by category) + a per-pick `note` field; plus the literal "Erstgespräch" free row.
- **New sections:** Navigation, Footer, Stammdaten, Kore-Flags — labelled form fields (no raw JSON), reusing existing editor primitives; mobile-usable like the current editor.
- New / changed save endpoints under `pages/api/admin/**` write to the corresponding `site_settings` keys / `service_config` / `leistungen_config`. All inherit the T000304 schema-init hardening.

### 5 · Migration ("catalog wins", zero-loss)

A one-shot, idempotent, reversible migration (script under `scripts/`, run per brand):
1. Trigger an **on-demand backup** first (`kubectl -n workspace create job ... --from=cronjob/db-backup`) and confirm it captured current state.
2. For each service card: resolve its catalog category via an **explicit title→id map** (titles already align 1:1; the map removes ambiguity), set `leistungCategoryId`.
3. Choose `headlineKey`: the category's `highlight: true` row if present, else the first row. Set `headlinePrefix` heuristically (on if the old card price began with "Ab"/"ab").
4. Convert `leistungenPricingHighlight[]` literal prices to `catalogKey` references where a matching catalog row exists (match by price+label); leave the "Kostenlos" Erstgespräch row literal.
5. **Log every divergence** (old card/highlight price ≠ chosen catalog price) to migration output — never silently overwrite without a record. Catalog value wins per the decision.
6. Drop the now-derived editable fields from the persisted JSON (kept readable in git history + backup taken in step 1).

Runs against both brands. Reversible by restoring the step-1 backup.

### 6 · Backup coverage

After migration, all editable content (`site_settings` keys incl. `stammdaten`, `service_config`, `leistungen_config`) is in the `website` DB, which the `db-backup` CronJob (`0 2 * * *`) dumps nightly. Acceptance verifies a changed nav entry and a changed price appear in a fresh on-demand dump. The env-var contact data is fully migrated into `stammdaten`, closing the last "edited content not in backup" gap.

### 7 · Both brands

mentolder + korczewski/Kore share the schema and resolver; rows are brand-filtered (`brand` column / `BRAND` env). Kore-only fields (`avatarInitials`, `kore_flags.timeline`) are gated by brand; mentolder ignores them. Static fallbacks come from each brand's config file.

## Testing

- **Vitest** — resolver projection logic (card headline derivation incl. `ab`-prefix and free-text rows; detail = full category; highlight resolution; `stammdaten` fan-out; static fallback on empty row) and the migration transform (title→id mapping, headline pick, divergence logging, idempotency).
- **Playwright** (acceptance):
  - Edit a catalog price once → homepage card, service detail page, and Leistungskatalog all show the new value after reload.
  - Edit a nav item / footer link / hero name / contact email in admin → visible live without redeploy.
  - Changed nav + price value present in an on-demand backup dump.
  - Empty DB row → static default renders (no blank screen).
- Project gate: new specs declare Playwright project(s) — authenticated admin flows → `mentolder` (and `korczewski`); endpoints verified from source, not assumed.

## Acceptance criteria

- [ ] Changing a price at one place (the catalog) updates card + detail page + Leistungskatalog + highlight table everywhere.
- [ ] Nav / footer / hero-name / contact-email edits go live without a redeploy.
- [ ] A changed nav and a changed price value appear in the nightly (on-demand) backup dump.
- [ ] Migration loses no existing prices/texts (before/after comparison + divergence log).
- [ ] Empty DB row renders the static default.
- [ ] Impressum shows the same contact/legal data as footer/hero (single `stammdaten` source).
- [ ] No raw-JSON editing required for any editable section; usable on mobile.

## Sequencing & risks

- **T000304 first.** Saves must be reliable before new save paths are added; rebase this branch onto the merged fix.
- **Migration is the highest-risk step** → backup-first + idempotent + divergence log + reversible.
- **Title→id mapping** is explicit (not fuzzy) to avoid mis-linking cards to the wrong catalog category.
- Legal: re-pointing the Impressum to `stammdaten` must preserve the exact legally required fields — verify the Impressum render still shows name, address, ustId, jobtitle.
