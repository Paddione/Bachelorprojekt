# Content-Hub v2 — Design Spec

**Ticket:** T000306
**Branch:** `feature/content-hub-v2`
**Date:** 2026-05-29
**Depends on (must be merged before execution):** T000305 (Content-Hub Price SSOT & full homepage editability) and T000304 (admin-save schema-init race fix).

## Problem

Content is **duplicated and drifts**. The same facts (contact name/email/city, prices, prose) live in multiple places — static config, baked-in legal HTML, bespoke section editors — and fall out of sync. The platform has two admins (**gekko** and **Patrick**); gekko observed the drift. T000305 made the *homepage* fully DB-editable and established the SSOT/`site_settings`/projection pattern. T000306 extends single-source-of-truth to the remaining surfaces and adds the editor infrastructure (versioning, concurrency safety, a unified editor) that keeps two people from re-introducing drift.

## Goal

One feature, executed as ordered milestones. After T000306:

- Editing contact master-data in **one** place flows to Impressum, Datenschutz, AGB, Footer, and every CTA/mailto — with no redeploy and no stale snapshot.
- Bespoke service editors (Coaching, Führung) are consolidated into the one universal service editor.
- The admin content editor has a **unified layout, inline validation, live preview, autosave + save-state, mobile usability, and section search** — built once, applied to every section.
- Every editable section has **version history with an audit trail** (who/when) and one-click **restore**.
- Two admins editing simultaneously **cannot silently overwrite each other**.
- All of the above works on **both brands** (mentolder + korczewski) and is covered by the nightly backup.

## Scope

**In scope (6 work-streams):**

1. **Legal-text SSOT** — token-based legal texts resolving contact master-data at render; full Impressum editor; per-page reset/re-sync.
2. **Service-prose consolidation** — migrate Coaching/Führung onto the universal service editor; delete the bespoke editors (rendered output unchanged).
3. **Contact-SSOT for CTAs** — all mailto/CTA links read the single contact source.
4. **Editor redesign** (high priority) — unified layout, inline validation + error handling, live preview, save-state + autosave + unsaved-changes guard, mobile-responsive, section search/jump.
5. **Content versioning** — per-section version history + "restore a previous state".
6. **Multi-editor safety** — optimistic-lock conflict detection for concurrent edits.

**Explicitly out of scope (confirmed):** WYSIWYG/rich-text editor beyond today's HTML field; content i18n/multi-language; granular roles/permissions beyond "admin" (gekko and Patrick are both full admins).

## Tech stack

Astro + Svelte (`website/`), TypeScript, `pg` (Postgres `website` DB on `shared-db`), Vitest (unit), Playwright (`tests/e2e/`). Builds directly on T000305's primitives: `site_settings` key→JSON, `getJsonSetting`/`setJsonSetting`, `content-projection.ts` pure resolvers, `content.ts` effective getters, `getEffectiveStammdaten()`/`getEffectiveKontakt()`, and the `InhalteEditor.svelte` section router.

---

## Key design decisions (resolved in brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Edit model | how saves behave | **Live + version history.** Saves go live immediately; each save also appends a version snapshot. Autosave = debounced write-to-live. |
| Versioning granularity | restore unit | **Per section / content-key.** One snapshot per save of a whole section. |
| Retention | history depth + audit | **Last 50 per (brand, content_key) + audit trail** (editor + timestamp, shown as a timeline). |
| Editor architecture | shared machinery | **Hybrid:** declarative `<SchemaEditor>` for regular sections + thin `<SectionShell>` for irregular ones; both share one `behaviorStore`. |
| Live preview | render mechanism | **iframe of the real public route, reloaded on autosave-success.** No duplicated render logic. |
| Conflict UX | concurrent-edit resolution | Non-destructive banner with **[Load their version] / [Overwrite with mine] / [View diff]**. |
| Token syntax | legal interpolation | `{{stammdaten.email}}` — explicit namespace, no collision with prose braces. |
| Legacy legal HTML | back-compat | Leave existing baked saves live; offer assisted **"Re-tokenize"** with a confirm-diff. New/reset texts tokenized from the start. |

---

## A. Shared foundation

### A1. Data model

New table in the `website` DB:

```sql
CREATE TABLE content_versions (
  id          BIGSERIAL PRIMARY KEY,
  brand       TEXT        NOT NULL,
  content_key TEXT        NOT NULL,   -- 'kontakt', 'legal:datenschutz', 'service:coaching', …
  content_type TEXT       NOT NULL,   -- 'site_setting' | 'legal_page' | 'service' | 'leistungen'
  snapshot    JSONB       NOT NULL,   -- full prior value of the section (HTML stored as JSON string)
  editor      TEXT        NOT NULL,   -- session display name / email
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX content_versions_key_idx ON content_versions (brand, content_key, created_at DESC);
```

Pruned to the **last 50** rows per `(brand, content_key)` on each insert (delete older).

**Optimistic-lock token.** Each editable live store gains a monotonically increasing `version INT NOT NULL DEFAULT 0` column: `site_settings`, `legal_pages`, `service_config`, `leistungen_config`. The `version` is both the lock token and the editor-held etag. (Where a store has no per-row natural key for a section, the `version` lives on the row that backs that `content_key`.)

**`ContentRef` registry** (`website/src/lib/content-registry.ts`, pure data + thin fns): maps each editable thing → `{ contentKey, contentType, read(brand), write(brand, payload, version), publicRoute }`. One registry means the framework, save pipeline, and versioning treat every section uniformly. New section = one registry entry + one schema.

### A2. `behaviorStore`

A Svelte store factory (`website/src/lib/admin/behaviorStore.ts`), one instance per open section. Owns:

- **dirty-state** (`pristine | dirty | saving | saved | conflict | error`),
- **debounced autosave** — fires ~2s after the last edit, **only if the section currently validates**; never mid-keystroke,
- **optimistic-lock submit** — sends `baseVersion`; on `409` transitions to `conflict`,
- **version history** — fetch list, restore,
- **preview-refresh signal** — emitted on autosave-success so the iframe reloads.

⑤ versioning and ⑥ concurrency are implemented here once; every section inherits them.

### A3. Save pipeline (shared endpoint)

`POST /api/admin/content/save` with body `{ contentKey, baseVersion, payload }`:

1. Resolve the `ContentRef`; load the current row.
2. If `current.version !== baseVersion` → respond `409 { currentVersion, currentSnapshot, editor }`.
3. Validate `payload` server-side against the section schema (shared schema module).
4. Within a transaction: append the **prior** value to `content_versions` (editor from session), write `payload` live, set `version = current.version + 1`, prune to 50.
5. Respond `200 { version }`.

Inherits the **T000304 `ensureSchemaOnce` guard**. `POST /api/admin/content/restore { contentKey, versionId }` loads the snapshot and runs it through the same save path (a restore is itself a new versioned save → fully auditable, and itself undoable).

Existing per-section save endpoints either delegate to this shared handler or are replaced by it; the contract (`contentKey` + `baseVersion`) is uniform.

### A4. Concurrency UX

Non-destructive. On `409` the editor enters `conflict` and shows a banner: *"gekko hat {Sektion} vor {Zeit} geändert."* with three actions:

- **[Deren Version laden]** — load `currentSnapshot` into the form (discards local edits after a confirm),
- **[Mit meiner überschreiben]** — re-submit with `baseVersion = currentVersion` (force),
- **[Diff ansehen]** — show a field-level diff of local vs. current.

A 409'd autosave **pauses autosave** and surfaces the banner rather than silently clobbering. Autosave resumes once the conflict is resolved.

### A5. Live preview

`<iframe src={ref.publicRoute}>` (e.g. `/kontakt`, `/datenschutz`, `/coaching`), reloaded on the `behaviorStore` preview-refresh signal (autosave-success). Because saves are live, the iframe is literally the production page — zero risk of the preview diverging from what ships. Tiny staleness during the ~2s debounce is acceptable.

---

## B. Schema framework + redesign chrome (themes ② + ④)

### B1. `<SchemaEditor schema={…}>`

Renders fields from a declarative schema. Field shape: `{ key, label, type, validation?, help?, tokens? }`. Types: `text`, `textarea`, `html`, `list<field>`, `group<field[]>`, `select`, `toggle`, `image`. Provides generic inline validation (required, email, url, min/max, custom), consistent layout, mobile-responsive form rows, and per-field error display. This is where the ④ redesign requirements are realized once.

### B2. Section schemas

Schema files under `website/src/lib/admin/schemas/`: Kontakt, Stammdaten, SEO, Legal (impressum / datenschutz / agb / barrierefreiheit), Service-page, Über-mich, FAQ, Referenzen. **Coaching and Führung become instances of the single `serviceSchema`** — their bespoke `CoachingSection.svelte` / `FuehrungSection.svelte` are deleted (② consolidation) **only after** a vitest equivalence check + a Playwright render-diff confirms the produced page is unchanged.

### B3. `<SectionShell>`

For irregular editors that don't fit a flat field schema (Angebote drag-order, Startseite multi-block, the custom-section factory): provides the same chrome + `behaviorStore` wiring, with a custom body slot. Behaviors (autosave/lock/version/preview) are identical to `SchemaEditor`; only rendering differs.

### B4. Shared chrome

A `<SectionFrame>` used by both `SchemaEditor` and `SectionShell`:

- **save-state header**: Gespeichert / Speichert… / Ungespeichert / Konflikt / Fehler,
- **version-history drawer**: audit timeline (editor + relative time), per-entry **Wiederherstellen**,
- **preview toggle** (side-by-side iframe on desktop, stacked on mobile),
- **unsaved-changes guard** before navigation,
- **section search / jump-to-section** in the `InhalteEditor` tab router.

---

## C. Legal SSOT + CTA SSOT (themes ① + ③)

### C1. Token model

Legal texts are stored as HTML containing tokens, e.g. `{{stammdaten.email}}`, `{{stammdaten.city}}`, `{{stammdaten.name}}`, `{{stammdaten.phone}}`. A pure `resolveTokens(html, stammdaten): string` (`website/src/lib/content-projection.ts` or a sibling) substitutes tokens at **render** time on the public legal pages **and** in the preview. Unknown tokens render as empty (logged in dev). Editing Kontakt/Stammdaten flows to all legal pages instantly — no snapshot, no drift. The legal editor shows an "available tokens" palette listing the valid `{{stammdaten.*}}` keys.

### C2. Full Impressum editor

The Impressum **main body** (today hardcoded in `impressum.astro`; only "Impressum-Zusatz" is editable) becomes a token-aware editable section stored under `legal:impressum`. The public `impressum.astro` renders `resolveTokens(getLegalPage('impressum') ?? tokenizedDefault, stammdaten)`.

### C3. Reset / re-sync

Per legal page, a **"Auf Standard zurücksetzen"** action regenerates the tokenized default. `legal-defaults.ts` is refactored to **emit tokens** (`{{stammdaten.*}}`) instead of interpolating `config.contact` at build time — so the default itself is drift-free.

### C4. CTA / mailto SSOT

Every `config.contact.email` / mailto reference across homepage (`index.astro`), Über-mich (`ueber-mich.astro`), Leistungen (`leistungen.astro`), Footer (`Footer.astro`), and the legal pages reads `getEffectiveStammdaten()` / `getEffectiveKontakt()` (the T000305 SSOT). One change point for the contact email everywhere.

### C5. Back-compat for existing saved legal HTML

Existing custom `legal_pages` rows contain *baked* contact strings. We will **not** auto-rewrite them (string surgery is risky). They stay live as-is. The editor offers an assisted **"Re-tokenize"** action: it proposes replacing recognized contact strings (current stammdaten values) with the corresponding `{{stammdaten.*}}` tokens and shows a **confirm-diff** before applying. New texts and reset texts are tokenized from the start.

---

## D. Error handling

- **Validation**: client-side inline (per field) + server-side mirror in the save pipeline; an invalid section cannot autosave and shows the failing fields.
- **Conflict (409)**: surfaced as the non-destructive banner (A4); autosave pauses.
- **Save failure (5xx / network)**: save-state → `Fehler` with a retry; local edits are retained (never discarded on a failed save).
- **Restore**: runs through the save path, so it is validated, versioned, and lock-checked like any save.
- **Unknown token**: renders empty; logged in dev to catch typos.

## E. Testing

**Vitest (pure logic):**
- `resolveTokens` — substitution, unknown-token, escaping.
- version-prune — keeps newest 50, drops older.
- conflict-detect — `version` mismatch → 409 shape.
- schema-validate — required/email/url/custom rules.
- Coaching/Führung ↔ `serviceSchema` equivalence — the consolidated schema produces the same effective content as the bespoke editors did (guards the deletion).

**Playwright (`tests/e2e/`, projects `mentolder` + `korczewski`):** the 7 acceptance criteria below. Endpoint paths verified from source before writing specs. New specs declare their Playwright project(s) explicitly; test inventory regenerated and committed.

## F. Milestones (ordered; gated on T000305 + T000304 merge)

- **M1 — Backbone.** `content_versions` table + `version` columns + `ContentRef` registry + `behaviorStore` + shared save/restore pipeline + concurrency (409) handling. Unit-tested.
- **M2 — Editor framework.** `<SchemaEditor>` + `<SectionShell>` + `<SectionFrame>` chrome with the ④ redesign requirements (validation, preview, autosave, save-state, mobile, search).
- **M3 — Section schemas + consolidation.** Port regular sections to schemas; collapse Coaching/Führung into `serviceSchema` and delete the bespoke editors (equivalence-gated).
- **M4 — Legal + CTA SSOT.** Tokenize `legal-defaults.ts`; `resolveTokens` at render; full Impressum editor; reset/re-sync; assisted re-tokenize; CTA/mailto → stammdaten SSOT.
- **M5 — Versioning UI.** History drawer + audit timeline + restore, wired across all sections.
- **M6 — E2E + backup verify.** Playwright on both brands; confirm `content_versions` + edited values appear in a fresh nightly-style `pg_dump`.

## G. Acceptance criteria

1. Change contact email/city in **one** place → correct on Impressum, Datenschutz, AGB, Footer, and all CTAs — without redeploy.
2. A previously saved legal page reflects a later Kontakt change automatically (tokenized texts; legacy via re-tokenize).
3. Coaching & Führung are editable through the universal editor; bespoke editors are gone; rendered output is unchanged.
4. Editor: invalid input shows a visible message; unsaved changes warn before navigation; the live preview matches the rendered page; the editor is usable on a phone.
5. Any editable section can be restored to a previous version, and the page reflects it.
6. Two simultaneous saves → the second is warned (conflict banner), never silently clobbered.
7. Everything verified on **both** mentolder and korczewski; new content (incl. a version row + an edited value) is present in a fresh backup dump.

## H. Non-functional requirements

- Editor mobile-responsive (≥768px clean; usable below).
- Concurrent-edit safe (two admins).
- Backup covers all new editable content + `content_versions` (lives in the `website` DB → automatically in the nightly `pg_dump`; verified in M6).
- DSGVO: on-prem, no external calls.
- Both brands equally.

## I. Backup note

`content_versions` and the new `version` columns live in the `website` DB on `shared-db`, which the nightly `db-backup` CronJob already dumps — so versioning history is covered with no extra wiring. Per the cross-cluster rule, the schema migration (new table + columns) must be applied to **both** `shared-db` instances explicitly.
