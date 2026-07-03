# website-interfaces

<!-- baseline SSOT — generiert aus T001490 (website-db-decouple), 2026-07-02 -->

## Purpose

Dieser Spec bündelt die **Austauschbarkeits-Contracts** der Website-Plattform
(beide Marken, beide Frontends) — Content-Contract, fail-soft Public-API,
Admin-API, Auth-Grenze und Infra/Env-Switch. Er definiert, was der Astro-Build
und der React-SPA (`mentolder-web/`) verbindlich gemeinsam haben müssen, damit
jederzeit zwischen den Frontends gewechselt werden kann, ohne dass die
Editor-Verträge brechen.

Sibling-Specs:

- `openspec/specs/website-core.md` — Brand, OIDC, i18n, Page-Rendering.
- `openspec/specs/database.md` — Tabellenschemata der Admin-Backoffice-DB.

---

## Requirements

### Requirement: Content-Contract (git-versionierte JSON-Bundles)

The system SHALL persist all public page content as JSON files under
`website/content/<brand>/` (one file per domain) validated at build time by the
Zod schemas in `website/src/content-schema/`, and SHALL resolve every
`getEffective*` content accessor from this build-time bundle, so that
public-page rendering never requires a database round-trip.

#### Scenario: Astro rendert die Homepage aus dem Bundle

- **GIVEN** `website/content/mentolder/homepage.json` enthält einen validen
  `HomepageContent`-Body (Zod-konform, `SCHEMA_VERSION=1`)
- **WHEN** ein Browser `/` auf der Astro-Website aufruft
- **THEN** liefert `getEffectiveHomepage(brand='mentolder')` exakt diesen
  Body, ohne dass `website-db.ts` oder `db-pool.ts` beteiligt sind

#### Scenario: Bundle-Validierung schlägt fehl beim Build

- **GIVEN** `website/content/mentolder/faq.json` ist malformed (z.B.
  fehlendes `question`-Feld)
- **WHEN** `task website:build` (oder `pnpm --dir website build`) läuft
- **THEN** bricht der Build mit einer `BundleValidationError`-Meldung
  fail-closed ab (kein kaputter/leerer Content live)

#### Scenario: SCHEMA_VERSION bump schlägt die Build-Validation

- **GIVEN** `SCHEMA_VERSION` in `content-schema/homepage.ts` wurde von `1` auf
  `2` erhöht, aber `homepage.json` enthält noch `schemaVersion: 1`
- **WHEN** der Build läuft
- **THEN** bricht der Build ab; die alte Datei muss vor dem Re-Build
  migriert werden — kein silent fallback auf veraltete Strukturen

---

### Requirement: Fail-soft Public-API für `/api/homepage`

The system SHALL serve `GET /api/homepage` from the build-time content bundle
only, return `200` with the document when the bundle resolves, return `204`
when the bundle is empty, and SHALL NOT return `5xx` to the public surface
when the bundle read throws (build artefact missing, validation race, etc.),
so the React SPA at `react.<brand>` keeps rendering even on a cold start.

#### Scenario: Bundle vorhanden, erlaubter Origin

- **GIVEN** `website/content/mentolder/homepage-blocks.json` enthält einen
  `HomepageBlocksContent`-Body
- **AND** `Origin: https://react.mentolder.de` im Request
- **WHEN** `GET /api/homepage` auf `web.mentolder.de` aufgerufen wird
- **THEN** antwortet der Server mit `200`, dem JSON-Body,
  `Access-Control-Allow-Origin: https://react.mentolder.de`, und
  `X-Homepage-Version: 1`

#### Scenario: Bundle fehlt für die Marke

- **GIVEN** `website/content/mentolder/homepage-blocks.json` existiert nicht
- **WHEN** `GET /api/homepage` aufgerufen wird
- **THEN** antwortet der Server mit `204`, `X-Homepage-Version: 0`, und
  leerem Body — kein `500`

#### Scenario: Bundle-Read wirft (Build-Artefakt-Race)

- **GIVEN** `bundleHomepageBlocks('mentolder')` wirft `BundleValidationError`
- **WHEN** `GET /api/homepage` aufgerufen wird
- **THEN** antwortet der Server mit `204` und loggt die Warnung — die
  Public-Site bleibt erreichbar

---

### Requirement: Public-API Fail-soft für `/api/timeline` und Slot-Endpoints

The system SHALL return `200` with an empty `rows` array (not `5xx`) when
external services (LiveKit, caldav, Nextcloud OCS) are unreachable from
`/api/timeline` and slot/booking endpoints, so a public visitor never sees
a stack trace and the homepage continues to render without the widget.

#### Scenario: LiveKit ist down

- **GIVEN** `LLM_LIVEKIT_URL` ist nicht erreichbar (Connection refused)
- **WHEN** `GET /api/timeline` auf `web.<brand>` aufgerufen wird
- **THEN** antwortet der Server mit `200`, `{ rows: [], error:
  'fetch_failed' }`, und der Timeline-Widget auf der Homepage blendet sich
  client-seitig aus (kein Layout-Shift > 1 s)

---

### Requirement: Admin-API mit SHA-Concurrency statt DB-Versionen

The system SHALL accept admin saves for any of the 13 content domains as a
`POST /api/admin/<domain>/save` JSON body `{ payload, baseSha? }`, route every
save through `publishContent()` (no direct writes to `site_settings`,
`homepage_block_documents`, `service_config`, etc.), and return `{ sha,
prNumber, prUrl }` after opening a bot-PR with auto-merge enabled, so content
edits are versioned in git with optimistic-concurrency safety.

#### Scenario: Admin speichert einen FAQ-Eintrag

- **GIVEN** ein Admin ist via Pocket-ID-OIDC eingeloggt
- **AND** `body = { payload: [{ question: 'q', answer: 'a' }], baseSha:
  'LIVE_SHA' }`
- **WHEN** `POST /api/admin/faq/save` aufgerufen wird
- **THEN** ruft der Handler `publishContent({ brand, domain: 'faq', payload,
  baseSha: 'LIVE_SHA', editor })` auf
- **AND** der Bot-PR `content/mentolder-faq-<timestamp>` wird mit der neuen
  Datei erstellt, auto-merge aktiviert, und die Response ist `200 { sha,
  prNumber, prUrl }`

#### Scenario: baseSha stimmt nicht mit main überein

- **GIVEN** `baseSha` ist veraltet (`<>` aktueller Blob-SHA auf main)
- **WHEN** `POST /api/admin/faq/save` aufgerufen wird
- **THEN** antwortet der Server mit `409 { currentSha, currentValue }` —
  KEIN `500`, KEIN halb-geschriebenes Dokument

#### Scenario: Zod-Validation schlägt fehl

- **GIVEN** `payload` verletzt die Zod-Schema für die Domäne
- **WHEN** `POST /api/admin/kontakt/save` aufgerufen wird
- **THEN** antwortet der Server mit `422 { errors: ['<path>: <msg>', ...] }`
- **AND** `publishContent()` ruft die GitHub-API NICHT auf (fail-closed vor
  dem Netzwerk-Roundtrip)

#### Scenario: Unauthentifizierter Save

- **GIVEN** kein gültiges `workspace_session`-Cookie
- **WHEN** irgendein `POST /api/admin/**/save` aufgerufen wird
- **THEN** antwortet der Server mit `401`; `publishContent()` wird NICHT
  aufgerufen

---

### Requirement: Auth-Boundary — Public ohne Auth, Admin mit Pocket-ID

The system SHALL allow unauthenticated access to every `GET /api/**`-Endpoint
mit `Access-Control-Allow-Origin: <REACT_APP_ORIGIN>` und SHALL require a valid
Pocket-ID-OIDC session for every `/api/admin/**` endpoint, so the React SPA
and crawlers can read public content without any auth challenge and the admin
surface stays behind the OIDC gateway.

#### Scenario: Crawler ruft /api/timeline ohne Cookie auf

- **GIVEN** kein Cookie, kein Token im Request
- **WHEN** `GET /api/timeline` aufgerufen wird
- **THEN** antwortet der Server mit `200` und `{ rows: [...] }` — keine
  401/403-Antwort, keine Pocket-ID-Weiterleitung

#### Scenario: Crawler ruft /api/admin/** ohne Cookie auf

- **GIVEN** kein gültiges `workspace_session`-Cookie
- **WHEN** `GET /api/admin/homepage/versions` aufgerufen wird
- **THEN** antwortet der Server mit `401 Unauthorized`; `publishContent()`
  wird NICHT aufgerufen; kein DB-Read auf `homepage_block_documents`

---

### Requirement: Infra / Env-Switch `PRIMARY_FRONTEND`

The system SHALL select the apex `Host(${WEBSITE_HOST})` backend via the
`PRIMARY_FRONTEND` env var (one of `astro` or `react`) and SHALL keep both the
Astro Deployment (`website` Service) and the React SPA Deployment
(`mentolder-web` Service) live at the same time, so the front-end can be
swapped by changing one env value and re-deploying, with the React SPA still
reachable at `react.<brand>` regardless of the apex choice.

#### Scenario: PRIMARY_FRONTEND=astro (Default)

- **GIVEN** `environments/mentolder.yaml` setzt `PRIMARY_FRONTEND: astro`
- **AND** die Deploy-Task leitet daraus `WEBSITE_PRIMARY_SERVICE=website` ab
- **WHEN** `task workspace:deploy ENV=mentolder` läuft
- **THEN** rendert der `Host(web.mentolder.de)` IngressRoute auf den
  `website` Service (Astro/SSR)
- **AND** `react.mentolder.de` rendert weiterhin auf `mentolder-web` (React
  SPA, eigener IngressRoute)

#### Scenario: PRIMARY_FRONTEND=react (Switch)

- **GIVEN** `environments/mentolder.yaml` setzt `PRIMARY_FRONTEND: react`
- **AND** die Deploy-Task leitet daraus `WEBSITE_PRIMARY_SERVICE=mentolder-web`
  ab
- **WHEN** `task workspace:deploy ENV=mentolder` läuft
- **THEN** rendert der `Host(web.mentolder.de)` IngressRoute auf den
  `mentolder-web` Service (React SPA)
- **AND** die Astro-Pods laufen weiter (andere IngressRoutes wie
  `/api/admin/**` zeigen weiterhin auf den Astro-Service)

#### Scenario: Falscher PRIMARY_FRONTEND-Wert

- **GIVEN** `PRIMARY_FRONTEND=vue` (nicht im Schema-Regex)
- **WHEN** `task workspace:deploy ENV=mentolder` läuft
- **THEN** schlägt `env:validate` fehl (Schema-Regex `^(astro|react)$`) — der
  Deploy wird gar nicht erst gestartet

---

### Requirement: Publish-Latenz und Editor-Feedback

The system SHALL guarantee that admin saves complete within a single HTTP
round-trip (response enthält `prNumber` + `prUrl`), SHALL signal the user
that the change goes live "in ~5-10 minutes" after the auto-merge, and SHALL
persist the editor's draft to `localStorage` so a page refresh does not lose
unsaved changes during the publish window, so admin UX stays sane despite
the git-versioned write path being asynchronous w.r.t. the live site.

#### Scenario: Admin-UX nach erfolgreichem Save

- **GIVEN** `POST /api/admin/homepage/save` hat `200 { sha, prNumber: 17,
  prUrl: 'https://github.com/.../pull/17' }` zurückgegeben
- **WHEN** der Admin auf "Speichern" geklickt hat
- **THEN** zeigt das UI: "PR #17 erstellt — live in ~5-10 min" und
  persistiert den Draft in `localStorage` unter `homepage-blocks:draft`

#### Scenario: GitHub-API ist nicht erreichbar

- **GIVEN** `publishContent()` kann `https://api.github.com` nicht erreichen
- **WHEN** `POST /api/admin/homepage/save` aufgerufen wird
- **THEN** antwortet der Server mit `500 { error: 'publish failed' }` und
  loggt den Fehler — der Draft bleibt im `localStorage` erhalten, sodass
  der Admin den Save erneut versuchen kann

---

### Requirement: Decommissioned Content-Tabellen (Read-Only-Audit)

The system SHALL NOT perform reads or writes against
`homepage_block_documents` or `homepage_block_versions` at runtime, and SHALL
NOT write content keys (NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY,
PRICING_HIGHLIGHT_KEY, seo_title_*, seo_meta_desc_*, seo_og_image_*,
KONTAKT_KEY, FAQ_KEY, …) to `site_settings`. The tables themselves MAY remain
in the database as historical artefacts until a follow-up migration drops
them, but no save.ts endpoint or content accessor imports or calls them.

#### Scenario: Public-Read-Path berührt keine content-Tabellen

- **GIVEN** alle `getEffective*`-Funktionen lesen aus `content-bundle.ts`
- **AND** `/api/homepage` ruft `bundleHomepageBlocks(brand)` auf (nicht
  `readCurrent(brand)`)
- **WHEN** `grep -rn "homepage_block_documents" website/src/pages/api/`
  ausgeführt wird
- **THEN** liefert der Grep keine Treffer in `homepage.ts` oder
  `homepage.test.ts`

#### Scenario: Admin-Save-Endpoints berühren keine content-Tabellen

- **GIVEN** jeder `/api/admin/**/save.ts` ruft `publishContent()` auf
- **WHEN** `pnpm vitest run src/pages/api/admin/__tests__/save-publish.test.ts`
  läuft
- **THEN** ist die Anzahl der `pg.Pool.query`-Aufrufe mit SQL auf
  `homepage_block_documents` / `homepage_block_versions` / `site_settings`
  gleich Null (`pgSpy.mock.calls` enthält keinen INSERT/UPDATE auf diese
  Tabellen)

#### Scenario: site_settings bleibt für Nicht-Content-Keys

- **GIVEN** `setSiteSetting(brand, 'invoice_tax_rate', '19.00')` ist
  weiterhin ein gültiger Aufruf
- **WHEN** der Admin Rechnungs-Einstellungen speichert
- **THEN** schreibt der Handler in `site_settings` (vacation_periods,
  invoice_tax_rate, email_*, branding_*, notification_*, backup_*, … sind
  KEIN Content und bleiben in der Key/Value-Store-Tabelle)

---

## Non-Goals

- **Voll-Prerendering** der Public-Seiten (Follow-up): Der Astro-Build
  rendert weiter SSR — ein Static-Build der kompletten Site ist ein
  separater Change.
- **Migration der Legal-Pages** (`impressum`, `datenschutz`): Diese
  bleiben vorerst in `legal_pages` (HTML, Token-Replacement) — die
  Publish-Pipeline-Integration ist ein Follow-up.
- **Migration der `vacation_periods` / `invoice_tax_rate` / `email_*` /
  `branding_*`**: Diese sind Operating-Config, nicht Public-Content, und
  bleiben in `site_settings`.
- **Live-Edit in der Admin-UI**: Der Publish-Pfad ist asynchron (PR +
  Auto-Merge, ~5-10 min Latenz). Live-Edit am offenen Dokument ohne
  Commit-Gap ist explizit nicht im Scope.
