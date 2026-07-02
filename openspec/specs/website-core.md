# website-core

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Astro-basierte Website-Plattform mit SSR (Node-Adapter), die unter zwei Marken (`mentolder` / `korczewski`) betrieben wird. Jede Marke hat ein eigenes Design-System, eine eigene Navigationshierarchie und eine eigene Inhaltskonfiguration. Inhalte folgen einer dreistufigen Prioritätskette: DB-Override (Admin) > statische `pageContent`-Felder in der Marken-Config > TypeScript-Fallback in `src/config/brands/<brand>.ts`.

---

## Requirements

### Requirement: Brand-Switch via Umgebungsvariable

The system SHALL select the active brand configuration at startup based on the `BRAND` environment variable (falling back to `mentolder` when unset), and apply that brand's layout, design tokens, favicon, navigation, and meta-tags to every rendered page.

#### Scenario: Mentolder-Brand wird angezeigt

- **GIVEN** der Container startet ohne `BRAND`-Variable oder mit `BRAND=mentolder`
- **WHEN** eine beliebige öffentliche Seite aufgerufen wird
- **THEN** rendert der Server die mentolder-Navigation, den mentolder-Titel (`mentolder`) und das mentolder-Favicon (`/favicon.svg`)

#### Scenario: Korczewski-Kore-Design wird angezeigt

- **GIVEN** `BRAND=korczewski` ist gesetzt
- **WHEN** die Startseite aufgerufen wird
- **THEN** lädt das Layout die Kore-CSS-Sheets (`/brand/korczewski/colors_and_type.css`, `app.css`, `kore-website.css`), setzt `<html class="kore">` und verwendet das korczewski-Favicon

---

### Requirement: Dreistufige Content-Priorisierung

The system SHALL resolve page content by applying DB overrides (Admin-gespeicherte Werte in `service_config` / `site_settings`) over static `pageContent` fields in the brand TypeScript config as the final fallback, such that content managed via the Admin-UI takes effect immediately without a new container image.

#### Scenario: Admin speichert einen Service-Titel

- **GIVEN** der Admin hat in der Admin-UI für den Slug `coaching` einen neuen Titel gespeichert
- **WHEN** `/coaching` aufgerufen wird
- **THEN** liefert `getEffectiveServices()` den gespeicherten DB-Titel; der TypeScript-Fallback aus `mentolder.ts` wird nicht angezeigt

#### Scenario: Kein DB-Override vorhanden (Erstdeploy)

- **GIVEN** der DB-Override für einen Service-Slug existiert noch nicht (z.B. nach erstem Deploy)
- **WHEN** die entsprechende Service-Seite aufgerufen wird
- **THEN** rendert die Seite fehlerfrei mit dem statischen `pageContent`-Fallback aus der Marken-Config

---

### Requirement: OIDC-Authentifizierung via Keycloak (Authorization Code Flow)

The system SHALL implement the OIDC Authorization Code Flow against the konfigurierten Keycloak-Realm, session tokens in einer PostgreSQL-Tabelle (`web_sessions`) persistieren, und jede Portal-Seite gegen einen gültigen, nicht abgelaufenen Token absichern.

#### Scenario: Nicht eingeloggter Nutzer ruft Portal auf

- **GIVEN** ein Nutzer ist nicht eingeloggt (kein gültiges `workspace_session`-Cookie)
- **WHEN** er `/portal` aufruft
- **THEN** leitet der Server zum Keycloak-Auth-Endpoint weiter (mit `client_id=website`, `response_type=code`, `scope=openid email profile`)

#### Scenario: Session ist abgelaufen

- **GIVEN** das `workspace_session`-Cookie ist vorhanden, aber `expires_at` liegt in der Vergangenheit
- **WHEN** eine Portal-Seite aufgerufen wird
- **THEN** wird die Session als ungültig behandelt und der Nutzer zur Login-Seite weitergeleitet

---

### Requirement: Locale-Erkennung und i18n-Routing

The system SHALL detect the active locale from a `locale` cookie (priority) or the URL prefix `/en/` (fallback), default to `de` when neither is present, and pass the resolved locale to every layout and translation helper (`t(locale, key)`).

#### Scenario: Nutzer hat Locale-Cookie `en` gesetzt

- **GIVEN** der Request enthält `Cookie: locale=en`
- **WHEN** eine Seite aufgerufen wird (ohne `/en/`-Prefix)
- **THEN** setzt die Middleware `context.locals.locale = 'en'`; das Layout setzt `<html lang="en">` und lädt englische Übersetzungen

#### Scenario: Kein Cookie, kein `/en/`-Prefix

- **GIVEN** der Request hat weder ein `locale`-Cookie noch einen `/en/`-URL-Prefix
- **WHEN** die Startseite aufgerufen wird
- **THEN** wird `de` als Default-Locale verwendet; hreflang-Tags verweisen korrekt auf die deutsche (`x-default`) und englische Variante

---

### Requirement: Hreflang-Tags und SEO-Meta-Daten

The system SHALL render `<link rel="alternate" hreflang="de|en|x-default">` tags, a `<meta name="description">` und Open Graph-Tags (`og:title`, `og:description`, `og:image`, `og:url`) auf jeder öffentlichen Seite, wobei Titel und Description aus der Prioritätskette (DB-Override > config) stammen.

#### Scenario: Service-Seite mit eigenem SEO-Titel

- **GIVEN** für den Slug `coaching` ist in `service_config` ein `seoTitle` gespeichert
- **WHEN** `/coaching` gerendert wird
- **THEN** erscheint der gespeicherte Wert als `<title>` (50–70 Zeichen) und als `og:title`

#### Scenario: OG-Image für korczewski-Brand

- **GIVEN** `brand = 'korczewski-kore'`
- **WHEN** eine Seite gerendert wird
- **THEN** verweist `og:image` auf `/brand/korczewski/og-image.png` (1200 × 630 px)

---

### Requirement: Admin-gesteuerter Navigationspfad

The system SHALL load the effective navigation order from `site_settings` (DB-Override), and fall back to the statisch konfigurierten `config.navigation`-Links, sodass Admins die Hauptnavigation ohne Code-Änderung umstellen können.

#### Scenario: Admin ändert Nav-Reihenfolge

- **GIVEN** in `site_settings` ist ein alternativer Navigationseintrag gespeichert
- **WHEN** die Seite geladen wird
- **THEN** sortiert `Layout.astro` die Nav-Links nach `order`-Feld aus der DB und rendert sie in dieser Reihenfolge; der statische Fallback wird nicht verwendet

#### Scenario: DB nicht erreichbar beim Nav-Load

- **GIVEN** `getEffectiveNavigation()` wirft einen Fehler (DB-Timeout o.Ä.)
- **WHEN** die Seite geladen wird
- **THEN** rendert die Navigation fehlerfrei mit dem statischen Fallback aus `config.navigation`; kein 500-Fehler

---

### Requirement: Portal-Layout mit rollen-basierter Sidebar

The system SHALL render das Portal-Layout (PortalLayout.astro) nur für authentifizierte Nutzer, die Sidebar mit einem Admin-Link nur für Nutzer mit der Admin-Rolle anzeigen, und Badge-Zähler für ausstehende Unterschriften und Fragebögen in der Navigation darstellen.

#### Scenario: Admin-Nutzer öffnet Portal

- **GIVEN** der eingeloggte Nutzer hat die Keycloak-Rolle `admin` (oder `realm-admin`)
- **WHEN** `/portal` gerendert wird
- **THEN** erscheint in der Sidebar ein "Admin"-Link (`/admin`); reguläre Nutzer sehen diesen Link nicht

#### Scenario: Ausstehende Unterschriften

- **GIVEN** `pendingSignatures = 3` wird an `PortalLayout` übergeben
- **WHEN** die Sidebar gerendert wird
- **THEN** zeigt der "Verträge"-Navlink ein Badge mit dem Wert `3`; Werte über 99 werden als `99+` dargestellt

---

### Requirement: Zugänglichkeit (Skip-Link und ARIA-Landmark)

The system SHALL einen sichtbaren Skip-Link ("Zum Hauptinhalt") als erstes fokussierbares Element im Layout rendern, den Hauptinhaltsbereich als `<main id="main-content">` auszeichnen, und die Navigationskomponente mit `aria-label` für die Hauptnavigation versehen.

#### Scenario: Tastaturnutzer aktiviert Skip-Link

- **GIVEN** ein Nutzer navigiert per Tab auf der öffentlichen Website
- **WHEN** er den ersten Tab-Stop fokussiert
- **THEN** wird der Skip-Link (`href="#main-content"`) sichtbar; nach Aktivierung springt der Fokus direkt zu `<main id="main-content">`

#### Scenario: Screen-Reader liest Navigation

- **GIVEN** ein Screen-Reader rendert eine öffentliche Seite
- **WHEN** die Navigation erkundet wird
- **THEN** ist das `<nav>`-Element mit einem `aria-label` (übersetzt via `t(locale, 'nav.aria-main')`) ausgezeichnet

---

### Requirement: Timeline Listing from tickets.pr_events

The system SHALL read timeline rows exclusively from `tickets.pr_events` and return shaped `TimelineRow` objects with `pr_number`, `title`, `category`, `brand`, `day` (ISO date string YYYY-MM-DD), `requirement_id` (nullable), `requirement_name` (nullable), and `bugs_fixed` (number).

#### Scenario: Gespeicherter PR taucht als TimelineRow auf

- **GIVEN** ein Eintrag mit `pr_number`, `title`, `category`, `brand` und `merged_at` existiert in `tickets.pr_events`
- **WHEN** `listTimeline({ limit: 50 })` aufgerufen wird
- **THEN** der Eintrag ist in den Ergebnissen enthalten, mit `day` als ISO-Datumsstring (YYYY-MM-DD), `requirement_id` null und `requirement_name` null
- **AND** `bugs_fixed` ist vom Typ `number`

#### Scenario: Marken-Filter inkludiert null-brand-Zeilen, schließt Fremd-Brand aus

- **GIVEN** drei Einträge in `tickets.pr_events`: einer für `mentolder`, einer für `korczewski`, einer ohne Brand
- **WHEN** `listTimeline({ brand: 'mentolder', limit: 100 })` aufgerufen wird
- **THEN** der `mentolder`-Eintrag und der brandlose Eintrag sind enthalten, der `korczewski`-Eintrag ist nicht enthalten

---

### Requirement: site_settings Schema-Init Not on Hot Path (T000304)

The system SHALL execute the `site_settings` schema-initialization DDL at most once across multiple `getSiteSetting()` and `setSiteSetting()` calls, never running it on every individual read or write request, in order to prevent concurrent DDL races on the Postgres system catalog.

#### Scenario: Mehrfache setSiteSetting-Aufrufe lösen Init nur einmal aus

- **GIVEN** die Schema-Init-Cache wurde zurückgesetzt (`__resetSchemaInitCacheForTests`)
- **WHEN** `setSiteSetting()` dreimal nacheinander aufgerufen wird
- **THEN** die `site_settings`-DDL-Statements (CREATE TABLE, ALTER TABLE, DO $$) werden höchstens einmal ausgeführt, nicht dreimal

#### Scenario: Gemischte get/set-Aufrufe und Sanity-Check Persistenz

- **GIVEN** die Schema-Init-Cache wurde zurückgesetzt
- **WHEN** `getSiteSetting()`, `setSiteSetting()` und nochmals `getSiteSetting()` nacheinander aufgerufen werden
- **THEN** die `site_settings`-Init-DDL wird höchstens einmal ausgeführt
- **AND** der geschriebene Wert ist anschließend per `getSiteSetting()` korrekt abrufbar

---

### Requirement: Content Store Optimistic Locking

The system SHALL provide `readContent` returning `{ value, version }` and `writeContent` with optimistic-lock semantics, where `writeContent` rejects with `{ code: 'CONFLICT', currentVersion }` when the supplied base version does not match the current DB version.

#### Scenario: Lesen eines vorhandenen site_setting-Eintrags

- **GIVEN** ein `site_settings`-Eintrag für Brand und Key existiert mit Wert `{"footerEmail":"a@b.de"}` und Version 2
- **WHEN** `readContent('mentolder', 'kontakt')` aufgerufen wird
- **THEN** das Ergebnis ist `{ value: { footerEmail: 'a@b.de' }, version: 2 }`

#### Scenario: Konflikt bei veraltetem base-Version

- **GIVEN** der aktuelle Datenbankstand für einen Key hat Version 3
- **WHEN** `writeContent('mentolder', 'kontakt', payload, 2, 'user')` mit base-Version 2 aufgerufen wird
- **THEN** der Aufruf wird mit einem Fehler-Objekt `{ code: 'CONFLICT', currentVersion: 3 }` abgelehnt

---

### Requirement: Content Registry Unique Keys and Route Resolution

The system SHALL maintain a `CONTENT_REGISTRY` in which every entry has a unique `contentKey`, and SHALL resolve content keys to their `contentType` and public URL route via `refFor()` and `publicRouteFor()`, returning `undefined` for unknown keys.

#### Scenario: Alle contentKey-Werte sind eindeutig

- **GIVEN** das vollständige `CONTENT_REGISTRY`-Array
- **WHEN** alle `contentKey`-Werte in ein Set überführt werden
- **THEN** die Größe des Sets ist identisch mit der Länge des Arrays (keine Duplikate vorhanden)

#### Scenario: Bekannter Key wird korrekt aufgelöst, unbekannter gibt undefined

- **GIVEN** der Key `'legal:datenschutz'` ist im Registry mit `contentType: 'legal_page'` und Route `/datenschutz`, sowie `'service:coaching'` mit Route `/coaching`
- **WHEN** `refFor('legal:datenschutz')`, `publicRouteFor('legal:datenschutz')`, `publicRouteFor('service:coaching')` und `refFor('nope')` aufgerufen werden
- **THEN** `ref.contentType` ist `'legal_page'`, Route ist `'/datenschutz'`, Service-Route ist `'/coaching'`
- **AND** `refFor('nope')` liefert `undefined`

---

### Requirement: Effective Price Derivation from Catalog Link

The system SHALL derive the card headline price from the linked catalog row (via `leistungCategoryId` + `headlineKey`), not from a stored price string, prepending `"ab "` when `headlinePrefix` is true, unless the price is free-text (no numeric amount), in which case the prefix is omitted.

#### Scenario: Katalog-verlinkter Service zeigt abgeleiteten Preis mit Prefix

- **GIVEN** ein Service-Config-Eintrag hat `leistungCategoryId: 'digital-50plus'`, `headlineKey: '50plus-digital-einzel'` und `headlinePrefix: true`
- **AND** der Katalog enthält für diesen Key den Preis `'60 €'` mit Unit `'/ Stunde'`
- **WHEN** `getEffectiveServices()` aufgerufen wird
- **THEN** der Service-Card-Preis ist `'ab 60 € / Stunde'`

---

### Requirement: Content Projection deriveHeadlinePrice and detailTiers

The system SHALL derive a headline price string via `deriveHeadlinePrice(category, headlineKey, headlinePrefix)`, returning price+unit (with optional `"ab "` prefix), falling back to the first row when `headlineKey` is undefined, returning empty string for empty categories, and rendering free-text prices verbatim; and SHALL return all rows as `{ label, price, unit, highlight }` via `detailTiers()`.

#### Scenario: Normaler Preis mit und ohne Prefix sowie free-text-Sonderfall

- **GIVEN** eine Kategorie mit einem Service-Eintrag `{ key: '50plus-digital-einzel', price: '60 €', unit: '/ Stunde' }`
- **WHEN** `deriveHeadlinePrice` einmal mit `headlinePrefix: false` und einmal mit `true` aufgerufen wird
- **THEN** ohne Prefix ist das Ergebnis `'60 € / Stunde'`, mit Prefix `'ab 60 € / Stunde'`
- **AND** ein Eintrag mit `price: 'nach Vereinbarung'` und `headlinePrefix: true` wird verbatim ohne `"ab "`-Prefix zurückgegeben

#### Scenario: Fallback auf erste Zeile und leere Kategorie

- **GIVEN** eine Kategorie mit zwei Einträgen und `headlineKey: undefined`
- **WHEN** `deriveHeadlinePrice(cat, undefined, false)` aufgerufen wird
- **THEN** wird der Preis der ersten Zeile zurückgegeben
- **AND** für eine Kategorie ohne Einträge gibt `deriveHeadlinePrice` einen leeren String zurück

---

### Requirement: Content Hub Model Constants and ServiceOverride Catalog Link

The system SHALL expose stable string constants `NAV_KEY`, `FOOTER_KEY`, `STAMMDATEN_KEY`, and `KORE_FLAGS_KEY` with the values `'navigation'`, `'footer'`, `'stammdaten'`, and `'kore_flags'` respectively, and SHALL provide the `ServiceOverride` type with optional catalog-link fields `leistungCategoryId`, `headlineKey`, and `headlinePrefix`.

#### Scenario: Konstanten-Werte sind stabil und korrekt

- **GIVEN** das `website-db`-Modul ist importiert
- **WHEN** die exportierten Konstanten gelesen werden
- **THEN** `[NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY]` entspricht genau `['navigation', 'footer', 'stammdaten', 'kore_flags']`

#### Scenario: ServiceOverride akzeptiert Katalog-Link-Felder und typisierte Interfaces kompilieren

- **GIVEN** ein `ServiceOverride`-Objekt mit gesetzten Feldern `leistungCategoryId`, `headlineKey` und `headlinePrefix: true`
- **WHEN** das Objekt erstellt und die Felder ausgelesen werden
- **THEN** `leistungCategoryId` und `headlineKey` sind korrekte Strings, `headlinePrefix` ist `true`
- **AND** die Interfaces `NavItem`, `FooterConfig`, `Stammdaten` und `KoreFlags` können typsicher instanziiert werden

---

### Requirement: Markdown Rendering Safety and Structure

The system SHALL render Markdown to safe HTML, escaping all raw HTML special characters, blocking `javascript:` and `data:` link schemes, remapping heading levels to h3–h5 (never h1/h2), hardening external links with `rel="noopener noreferrer"`, and returning an empty string for empty, whitespace-only, or non-string input.

#### Scenario: Gefährliche HTML-Payloads und Link-Schemes werden neutralisiert

- **GIVEN** Eingaben wie `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, ein `javascript:`-Link und ein `data:`-Link
- **WHEN** `renderMarkdown()` mit diesen Eingaben aufgerufen wird
- **THEN** kein `<script>`-Tag, kein `<img`-Tag, kein `href="javascript:"` und kein `href="data:"` erscheint im Output
- **AND** HTML-Sonderzeichen werden zu `&lt;`, `&gt;`, `&amp;` escaped

#### Scenario: Heading-Remapping, externe Links und Edge-Cases

- **GIVEN** Markdown mit `# Titel` (→ h3), `## Unter` (→ h4), einem externen `https://`-Link sowie leerem/null-Input
- **WHEN** `renderMarkdown()` aufgerufen wird
- **THEN** `# Titel` wird zu `<h3>`, kein `<h1>` oder `<h2>` erscheint, externe Links enthalten `rel="noopener noreferrer"`
- **AND** leerer String, Whitespace und `null`/`undefined`-Eingaben liefern jeweils `''` zurück

---

### Requirement: Agent Guide Typed Re-Export with Danger-ID and Theme Validation

The system SHALL re-export `goals`, `tools`, `taxonomy` (exactly 4 tiers), `components` (keyed by slug), `themes` (ordered array of 8), and `glossary` (≥10 entries) from the generated JSON, validate that every `danger` ID referenced by a goal or tool exists in `taxonomy`, enforce that every goal carries a `one_liner_de` of at most 80 characters, and ensure forbidden goals carry `escalate_to_de`.

#### Scenario: Alle danger-IDs sind in taxonomy vorhanden und Hilfsfunktionen liefern valide Werte

- **GIVEN** die vollständige `goals`- und `tools`-Liste ist geladen
- **WHEN** alle referenzierten `danger`-IDs gesammelt und gegen `taxonomy` geprüft werden
- **THEN** jede ID existiert in `taxonomy` (keine dangling IDs), `tierColor()` liefert einen gültigen Hex-Farbwert `#RRGGBB`, `tierEmoji()` und `tierLabel()` sind nicht leer

#### Scenario: goals tragen kurze one_liner_de und forbidden-goals eskalieren

- **GIVEN** die vollständige `goals`-Liste
- **WHEN** `one_liner_de`, `danger`-Feld und `escalate_to_de` jedes Goals geprüft werden
- **THEN** jedes `one_liner_de` ist ein String mit höchstens 80 Zeichen
- **AND** alle Goals mit `danger === 'forbidden'` haben ein nicht-leeres `escalate_to_de`-Feld

---

### Requirement: Agent Guide Search with Umlaut Normalization and Grouping

The system SHALL normalize search queries by lowercasing and folding German umlauts (ä→ae, ö→oe, ü→ue, ß→ss) and other diacritics, filter guide entries only when the query is at least 3 characters (`MIN_QUERY`), match against a precomputed normalized haystack including `aliases_de`, and support grouping by `thema`, `gefahr`, and `art` in taxonomy-defined order.

#### Scenario: Umlaut-normierte Suche und Mindestlängen-Guard

- **GIVEN** der vollständige Entry-Index aus `buildEntries(goals, tools)`
- **WHEN** `filterEntries(ALL, 'aendern')` aufgerufen wird
- **THEN** Entries mit Titeln, die `ändern` enthalten (z.B. `website-text-aendern`), werden gefunden
- **AND** bei Queries mit weniger als 3 Zeichen (z.B. `'da'`) wird der vollständige Index ungefiltert zurückgegeben

#### Scenario: Alias-Treffer und highlight-Mapping auf Originalzeichen

- **GIVEN** ein Entry für `secret-aendern` hat `'passwort'` in `aliases_de`
- **WHEN** `filterEntries(ALL, 'passwort')` aufgerufen wird
- **THEN** der `secret-aendern`-Entry ist im Ergebnis enthalten
- **AND** `highlight('Text ändern', 'aendern')` liefert `[{ text: 'Text ', mark: false }, { text: 'ändern', mark: true }]` (Originalzeichen bleiben erhalten)

---

### Requirement: Admin-Design-Token-Basis Brass/Ink

The admin area SHALL use a single design-token base: `factory-tokens.css` (Ink surfaces, Brass
accent, Sage/Danger status colors, Newsreader/Geist/Geist-Mono type ramp). `admin-foundation.css`
SHALL define every `--admin-*` custom property as an alias of a `factory-tokens.css` value (e.g.
`--admin-primary: var(--brass)`); no `--admin-*` property SHALL carry a raw color literal that
diverges from the token base. `AdminLayout.astro` SHALL load `factory-tokens.css` before
`admin-foundation.css`. The global `.admin-card` class (admin-premium.css) and the
`AdminCard.svelte` component SHALL consume the same `--admin-card-radius` / `--admin-card-padding`
tokens. For the korczewski brand, `kore-app.css` SHALL override the alias layer with the Kore
copper palette so `admin/ui/*` components follow the brand.

#### Scenario: admin-foundation defines only aliases

- **WHEN** `website/src/styles/admin-foundation.css` is inspected
- **THEN** every color-bearing `--admin-*` declaration references a `var(--…)` from factory-tokens (no independent hex/oklch literals for primary/bg/surface/status colors)

#### Scenario: Kore brand recolors admin/ui components

- **GIVEN** an admin page on the korczewski brand (`body.kore`)
- **WHEN** an `AdminStatCard` is rendered
- **THEN** its accent color resolves to the Kore copper palette, not the mentolder Brass value

#### Scenario: Card class and component share one radius source

- **WHEN** the computed border-radius of a `.admin-card` element and an `AdminCard.svelte` instance are compared
- **THEN** both resolve to the same token value

### Requirement: Admin-Sidebar Kompaktheit und Front-Page-Sprache

The admin sidebar SHALL render section labels as mono-spaced uppercase kickers with a hairline
rule (front-page kicker pattern), SHALL mark the active item with a Brass edge marker and Brass
text (no indigo fill), and SHALL fit all sections including the fully expanded Werkstatt
accordion into a 900px-tall viewport without sidebar scrolling. The sidebar SHALL contain a
"Pipeline" item linking to `/admin/pipeline` in the Infrastruktur section.

#### Scenario: No sidebar scroll with open accordion

- **GIVEN** a desktop viewport of 1440×900 and the Werkstatt accordion expanded
- **WHEN** the sidebar is rendered
- **THEN** the sidebar content height does not exceed the viewport (no vertical scrollbar on `#admin-sidebar`)

#### Scenario: Active item uses Brass marker

- **GIVEN** the admin is on `/admin/cockpit`
- **WHEN** the sidebar renders
- **THEN** the Cockpit item shows a Brass edge marker and Brass-colored label instead of an indigo background fill

#### Scenario: Pipeline link in sidebar

- **WHEN** the admin views the sidebar
- **THEN** the Infrastruktur section contains a link with `href="/admin/pipeline"` labelled "Pipeline"

### Requirement: Dashboard Pipeline-Widget und Postfach-Vorschau

The admin dashboard (`/admin`) SHALL embed the compact pipeline widget
(`PipelineSidekickView.svelte`) showing the live lane distribution of the factory pipeline with a
link to `/admin/pipeline`, and SHALL render an inbox preview listing the newest open inbox items
(title, age, direct link to `/admin/inbox`). The KPI row SHALL render as a compact mono-digit
strip with hairline separators; service tiles SHALL use monochrome Brass icons.

#### Scenario: Pipeline widget on dashboard

- **GIVEN** an authenticated admin on `/admin`
- **WHEN** the dashboard renders
- **THEN** the pipeline lane widget is visible and links to `/admin/pipeline`

#### Scenario: Inbox preview lists open items

- **GIVEN** at least one open inbox item exists
- **WHEN** the dashboard renders
- **THEN** the inbox preview shows the newest open items with a direct link to `/admin/inbox`

#### Scenario: Empty inbox preview degrades gracefully

- **GIVEN** no open inbox items exist
- **WHEN** the dashboard renders
- **THEN** the inbox preview shows an empty state (no error, no crash)

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: CI-Deploy repoints Deployment via kubectl set image
<!-- bats: website-ci-deploy.bats -->

The system SHALL deploy a freshly-built website image by running `kubectl set image deployment/website website=<IMAGE>:<SHA_TAG>` (not merely `rollout restart`), so that immutable @sha256-pinned deployments are reliably updated, and SHALL subsequently wait for `kubectl rollout status deployment/website` to confirm a healthy rollout.

#### Scenario: mentolder Build-Workflow enthält kubectl set image *(BATS)*
- **GIVEN** die Datei `.github/workflows/build-website.yml` existiert
- **WHEN** der Deploy-Schritt ausgeführt wird
- **THEN** enthält der Schritt `kubectl set image deployment/website website=` mit einem dynamischen `$SHA_TAG` oder `$IMAGE`-Referenz (kein statischer Tag)
- **AND** der Workflow wartet anschließend auf `kubectl rollout status deployment/website`

#### Scenario: korczewski Build-Workflow enthält kubectl set image *(BATS)*
- **GIVEN** die Datei `.github/workflows/build-website.yml` existiert und definiert den Job
  `deploy-korczewski`
- **WHEN** der Deploy-Schritt ausgeführt wird
- **THEN** enthält der Schritt `kubectl set image deployment/website website=` mit dynamischem SHA-Tag
- **AND** der Workflow wartet anschließend auf `kubectl rollout status deployment/website`

---

### Requirement: Website-Namespace trägt domain-config ConfigMap im Overlay
<!-- bats: website-domain-config-overlay.bats -->

The system SHALL declare the `domain-config` ConfigMap in a shared website overlay (`prod-fleet/website-common/domain-config.yaml`) without a hardcoded `metadata.namespace`, reference it from both brand-specific kustomization files, and keep its `MEDIAVIEWER_HOST` expression in sync with `prod/configmap-domains.yaml`, derived from `${PROD_DOMAIN}` without hardcoded brand domains.

#### Scenario: Shared domain-config ConfigMap existiert und hat korrekte Struktur *(BATS)*
- **GIVEN** das Repository enthält `prod-fleet/website-common/domain-config.yaml`
- **WHEN** die Datei geprüft wird
- **THEN** ist sie benannt `domain-config`, trägt kein `metadata.namespace` und enthält jeden `configMapKeyRef`-Key, den `k3d/website.yaml` aus ihr bezieht

#### Scenario: Beide Brand-Overlays referenzieren die shared domain-config *(BATS)*
- **GIVEN** die kustomization.yaml-Dateien beider Brand-Overlays
- **WHEN** auf Referenz zur shared domain-config geprüft wird
- **THEN** enthalten beide `../website-common/domain-config.yaml`
- **AND** `MEDIAVIEWER_HOST` stimmt wertgleich zwischen shared ConfigMap und `prod/configmap-domains.yaml` überein

#### Scenario: MEDIAVIEWER_HOST verwendet ${PROD_DOMAIN}-Variable *(BATS)*
- **GIVEN** die shared ConfigMap `domain-config.yaml`
- **WHEN** der Wert von `MEDIAVIEWER_HOST` geprüft wird
- **THEN** lautet er `"mediaviewer.${PROD_DOMAIN}"` ohne hartkodierte Marken-Domain oder S3-URL

---

### Requirement: Dev-Cluster startet automatisch nach Host-Reboot (T000290)
<!-- bats: dev-cluster-autostart.bats -->

The system SHALL install a systemd oneshot unit that starts the existing k3d cluster on boot (never recreates it), orders itself after and requires `docker.service`, stays active after exit, enables itself idempotently via `systemctl enable --now`, and is reachable via `task cluster:autostart`.

#### Scenario: Autostart-Unit startet Cluster, erstellt ihn nie neu *(BATS)*
- **GIVEN** das Installer-Skript `scripts/dev-cluster-autostart.sh` existiert und valide Bash-Syntax hat
- **WHEN** der generierte ExecStart-Befehl geprüft wird
- **THEN** enthält er `k3d cluster start` und **nicht** `k3d cluster create`
- **AND** die Unit ordnet sich nach `docker.service` ein (`After=` + `Requires=`)

#### Scenario: Autostart-Unit hat korrekte systemd-Konfiguration *(BATS)*
- **GIVEN** das Installer-Skript wird geprüft
- **WHEN** die Unit-Definitionen ausgelesen werden
- **THEN** ist `Type=oneshot` gesetzt, `RemainAfterExit=true` gesetzt, `WantedBy=multi-user.target` gesetzt, und `systemctl enable --now` wird zur idempotenten Aktivierung verwendet

#### Scenario: Taskfile exponiert cluster:autostart *(BATS)*
- **GIVEN** `Taskfile.dev-stack.yml` ist vorhanden
- **WHEN** nach dem Task `cluster:autostart:` gesucht wird
- **THEN** ist der Task definiert und aufrufbar

---

### Requirement: Landing Page und Unterseiten sind erreichbar
<!-- e2e: fa-10-website.spec.ts, fa-public-pages.spec.ts -->

The system SHALL serve the landing page with HTTP 200 and a visible `h1`, serve all configured service subpages (e.g. `/coaching`, `/beratung`, `/kontakt`, `/leistungen`, `/registrieren`) with HTTP 200, and render a functional navigation bar with links to `/kontakt`.

#### Scenario: Landing Page lädt mit sichtbarem h1 *(E2E)*
- **GIVEN** die Website ist unter `WEBSITE_URL` erreichbar
- **WHEN** die Startseite (`/`) aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und ein `h1`-Element ist sichtbar

#### Scenario: Unterseiten sind erreichbar *(E2E)*
- **GIVEN** die konfigurierten Service-Seiten (u. a. `/coaching`, `/beratung`, `/kontakt`, `/leistungen`, `/registrieren`)
- **WHEN** jede Seite per `page.goto` aufgerufen wird
- **THEN** antwortet jede mit HTTP 200

#### Scenario: Navigation enthält Kontakt-Link *(E2E)*
- **GIVEN** die Startseite wurde geladen
- **WHEN** die Navigation geprüft wird
- **THEN** ist `nav` sichtbar und enthält einen Link `a[href="/kontakt"]`

---

### Requirement: Öffentliche statische Seiten und Sonderfälle
<!-- e2e: fa-public-pages.spec.ts -->

The system SHALL serve all public static pages (`/agb`, `/datenschutz`, `/impressum`, `/barrierefreiheit`, `/cookie-einstellungen`, `/referenzen`, `/meine-daten`, `/status`) with HTTP 200 and a visible, correctly-titled `h1`, render newsletter confirmation and error pages without 500 errors, and return non-500 responses for `/stripe/success`, `/404`, and unknown routes.

#### Scenario: Öffentliche Seiten laden mit erwartetem Heading *(E2E)*
- **GIVEN** eine öffentliche statische Seite (z. B. `/datenschutz`, `/impressum`, `/agb`)
- **WHEN** die Seite aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und das erste `h1` enthält den erwarteten Titel (z. B. `/datenschutz` → enthält "Datenschutz")

#### Scenario: Newsletter-Bestätigung und Token-Fehlerseiten rendern korrekt *(E2E)*
- **GIVEN** die URL `/newsletter/bestaetigt` bzw. `/newsletter/token-ungueltig`
- **WHEN** die Seite aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200; `/newsletter/bestaetigt` zeigt `h1` mit "Anmeldung bestätigt"; `/newsletter/token-ungueltig` enthält keinen "500"-Text

#### Scenario: Unbekannte Routen und Sonderfälle liefern keinen 500-Fehler *(E2E)*
- **GIVEN** URLs wie `/stripe/success`, `/404` oder `/does-not-exist-xyzzy`
- **WHEN** die Seite aufgerufen wird
- **THEN** antwortet der Server mit einem Statuscode ungleich 500 und der Body enthält nicht den Text "500"

---

### Requirement: Korczewski-Brand — Homepage-Inhalte und Navigation
<!-- e2e: korczewski-home.spec.ts -->

The system SHALL render the korczewski homepage with the correct brand title, the Kore navigation wordmark "korczewski.", nav links (Leistungen, Über mich, Notizen, Kontakt), the hero h1 containing "Kubernetes & KI", three service cards (KI-Integration, Software-Entwicklung, Kubernetes-Infrastruktur), a timeline section with category tabs, a "Mehr laden" button, a CTA section linking to `/kontakt`, and a branded footer.

#### Scenario: Korczewski Startseite lädt mit korrektem Titel und Wordmark *(E2E)*
- **GIVEN** `KORCZEWSKI_URL` zeigt auf die korczewski-Brand-Website
- **WHEN** die Startseite aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200, der Seitentitel enthält "korczewski" und der Marken-Link enthält den Text "korczewski."

#### Scenario: Navigation und Hero-Inhalt der Kore-Seite *(E2E)*
- **GIVEN** die korczewski Startseite wurde geladen
- **WHEN** Navigation und Hero-Bereich geprüft werden
- **THEN** enthält die Navigation die Links Leistungen, Über mich, Notizen, Kontakt und das erste `h1` enthält "Kubernetes & KI"

#### Scenario: Drei Service-Cards mit KI-, Software- und Kubernetes-Themen *(E2E)*
- **GIVEN** die korczewski Startseite wurde geladen
- **WHEN** die Service-Cards gezählt und ihre Headings geprüft werden
- **THEN** sind genau 3 Articles mit "Mehr erfahren →"-Link vorhanden; Headings enthalten "KI-Integration", "Software-Entwicklung" und "Kubernetes.*Infrastruktur"

#### Scenario: Timeline-Bereich mit Kategorie-Tabs und Mehr-laden-Button *(E2E)*
- **GIVEN** die korczewski Startseite wurde geladen
- **WHEN** der Timeline-Bereich geprüft wird
- **THEN** ist das Heading "implementierte features" sichtbar, Tabs "Alle", "Features", "Fixes" sind vorhanden, und ein "Mehr laden"-Button ist sichtbar

---

### Requirement: Website-Neustart-Resilienz (NFA-06)
<!-- e2e: nfa-06-website-restart.spec.ts -->

The system SHALL remain reachable (HTTP 200/301/302) after a potential pod restart, serve the full page body without gateway error messages (502, 503, 504, "Internal Server Error"), and return a non-empty HTML body (more than 50 characters) after `domcontentloaded`.

#### Scenario: Website ist nach Neustart erreichbar *(E2E)*
- **GIVEN** die Website wurde ggf. neu gestartet
- **WHEN** ein HTTP-GET auf die Basis-URL gesendet wird
- **THEN** antwortet der Server mit 200, 301 oder 302

#### Scenario: Website rendert vollständige HTML-Struktur ohne Gateway-Fehler *(E2E)*
- **GIVEN** die Website ist gestartet
- **WHEN** die Startseite im Browser geladen wird
- **THEN** ist `body` sichtbar, enthält keine Texte "502 Bad Gateway", "503 Service Unavailable", "504 Gateway Timeout" oder "Internal Server Error"
- **AND** der Body-Text umfasst mehr als 50 Zeichen

---

### Requirement: Performance — Ladezeiten unter Schwellwerten (NFA-02)
<!-- e2e: nfa-02-performance.spec.ts -->

The system SHALL respond to HTTP requests for the website within 5 000 ms, render the page visibly in the browser within 5 000 ms, serve the Keycloak health endpoint `/health/ready` within 1 000 ms (prod) or 3 000 ms (dev), and serve Vaultwarden within 3 000 ms.

#### Scenario: Website lädt per HTTP in unter 5 Sekunden *(E2E)*
- **GIVEN** die Website ist unter `WEBSITE_URL` erreichbar
- **WHEN** ein HTTP-GET auf die Basis-URL gesendet wird
- **THEN** antwortet der Server mit 200/301/302 und die verstrichene Zeit liegt unter 5 000 ms

#### Scenario: Website ist im Browser sichtbar in unter 5 Sekunden *(E2E)*
- **GIVEN** die Website ist gestartet
- **WHEN** die Startseite per `page.goto` aufgerufen und `domcontentloaded` abgewartet wird
- **THEN** ist `body` sichtbar und die verstrichene Zeit liegt unter 5 000 ms

---

### Requirement: Usability — Sprache, Mobile-Ansicht, Keyboard-Navigation (NFA-05)
<!-- e2e: nfa-05-usability.spec.ts -->

The system SHALL render the UI in German (non-empty body text), serve a fully loaded page with a visible `h1` and mobile hamburger toggle on a 375×812 viewport, and respond to keyboard Tab by moving focus to a focusable element (link, button, or input).

#### Scenario: UI-Sprache ist Deutsch *(E2E)*
- **GIVEN** die Website ist erreichbar
- **WHEN** die Startseite geladen wird
- **THEN** ist der Body-Text nicht leer (Länge > 0)

#### Scenario: Mobile-Ansicht lädt korrekt *(E2E)*
- **GIVEN** ein mobiler Browser-Kontext mit Viewport 375×812 (iPhone-UA)
- **WHEN** die Startseite aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200, ein `h1` ist sichtbar, und `button.mobile-toggle` ist sichtbar

#### Scenario: Keyboard-Tab-Fokus funktioniert *(E2E)*
- **GIVEN** die Startseite wurde geladen und ein `h1` ist sichtbar
- **WHEN** die Tab-Taste einmal gedrückt wird
- **THEN** erhält genau ein fokussierbares Element (`a`, `button`, `input`, `select` oder `textarea`) den Fokus

---

### Requirement: Lernpfad-CTA öffnet Sidekick auf Agent-Anleitung (FA-46)
<!-- e2e: fa-46-lernpfad-cta.spec.ts -->

The system SHALL render "weiter lernen →" CTAs on `/portal/loslernen` with `data-testid="weiter-lernen"` and `data-jump-domid` attributes (no dead `/portal/arena?jumpTo=` links), and on click SHALL open the Sidekick with title "Agent-Anleitung" and scroll the matching card into the viewport with `aria-expanded="true"`.

#### Scenario: weiter-lernen-CTA öffnet Sidekick und expandiert die passende Karte *(E2E)*
- **GIVEN** der Nutzer ist authentifiziert und ruft `/portal/loslernen` auf
- **WHEN** der erste `[data-testid="weiter-lernen"]`-Link geklickt wird
- **THEN** öffnet sich der Sidekick mit dem Titel "Agent-Anleitung", die Karte mit der entsprechenden `domId` ist im Viewport sichtbar und hat `aria-expanded="true"`
- **AND** kein Link mit `href*="/portal/arena?jumpTo="` ist auf der Seite vorhanden

---

### Requirement: Content-Hub Concurrent Save Safety — Optimistic Locking per API (T000306)
<!-- e2e: fa-content-hub-concurrency.spec.ts -->

The system SHALL reject unauthenticated save requests with 401/403, return 409 when the second writer submits with a stale `baseVersion`, and return 400 for unknown `contentKey` values (after auth).

#### Scenario: Save-Endpoint lehnt unauthentifizierten Zugriff ab *(E2E)*
- **GIVEN** kein gültiges Auth-Cookie im Request-Kontext
- **WHEN** ein POST auf `/api/admin/content/save` gesendet wird
- **THEN** antwortet der Endpoint mit 401 oder 403

#### Scenario: Zwei gleichzeitige Saves mit gleicher baseVersion — zweiter erhält 409 *(E2E)*
- **GIVEN** zwei Requests mit identischer `baseVersion` und `contentKey`
- **WHEN** beide Requests nacheinander gesendet werden
- **THEN** sind beide Statuscodes konsistent (401/403 ohne Auth); mit Auth gibt der zweite 409 mit `currentVersion` im Response-Body zurück

#### Scenario: Unbekannter contentKey liefert 400 (nach Auth) *(E2E)*
- **GIVEN** ein authentifizierter Nutzer sendet `contentKey: '__bad_key__'`
- **WHEN** POST auf `/api/admin/content/save` gesendet wird
- **THEN** antwortet der Endpoint mit 400 (ungültiger Key), 401 oder 403 (nicht authentifiziert)

---

### Requirement: Content-Hub Editierbarkeit — Navigation, Footer, Stammdaten, Kore-Flags
<!-- e2e: fa-content-hub-editability.spec.ts -->

The system SHALL render navigation links sourced from the editable navigation store, render a footer with a copyright line, surface stammdaten email on `/kontakt` and `/impressum`, and honour the Kore `timeline` flag on the korczewski homepage — all without requiring a redeploy.

#### Scenario: Navigation rendert Links aus editierbarer Quelle *(E2E)*
- **GIVEN** die Website ist geladen
- **WHEN** Header und Navigation der Startseite geprüft werden
- **THEN** ist mindestens ein `<a>`-Link in `header nav` oder `nav[aria-label]` sichtbar und die Gesamtzahl der Nav-Links ist größer als 0

#### Scenario: Footer enthält Copyright-Zeile *(E2E)*
- **GIVEN** die Startseite wurde geladen
- **WHEN** der `<footer>` geprüft wird
- **THEN** ist `footer` sichtbar und der Footer-Text enthält `©`, `(c)` oder "Rechte vorbehalten"

#### Scenario: Stammdaten-E-Mail erscheint auf Kontakt- und Impressumsseite *(E2E)*
- **GIVEN** die Seiten `/kontakt` und `/impressum` werden per HTTP-GET abgerufen
- **WHEN** der HTML-Inhalt auf eine E-Mail-Adresse geprüft wird
- **THEN** enthält das gerenderte HTML jeweils mindestens eine gültige E-Mail-Adresse (Stammdaten-Token)

---

### Requirement: Content-Hub Editor — Validierung, Auth-Gate, Mobile-Zugang (T000306 AC 4)
<!-- e2e: fa-content-hub-editor.spec.ts -->

The system SHALL reject unauthenticated save and restore requests with 401/403, return 400 for unknown `contentKey` values, serve `/admin/inhalte` with HTTP 200 for authenticated admins, and render `/admin/inhalte` on a 390×844 viewport without horizontal overflow (scrollWidth ≤ viewport width + 2 px).

#### Scenario: Save- und Restore-Endpoint erfordern Authentifizierung *(E2E)*
- **GIVEN** kein gültiges Auth-Cookie im Request-Kontext
- **WHEN** POST auf `/api/admin/content/save` oder `/api/admin/content/restore` gesendet wird
- **THEN** antwortet der Endpoint mit 401 oder 403

#### Scenario: /admin/inhalte ist für authentifizierte Admins erreichbar *(E2E)*
- **GIVEN** ein authentifizierter Admin (storageState aus `.auth/mentolder-website-admin.json`)
- **WHEN** `/admin/inhalte` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und die URL enthält `/admin/inhalte`

#### Scenario: /admin/inhalte ohne horizontalen Overflow auf Mobile *(E2E)*
- **GIVEN** ein authentifizierter Admin im mobilen Viewport 390×844
- **WHEN** `/admin/inhalte` geladen wird
- **THEN** ist `document.body.scrollWidth - window.innerWidth` kleiner oder gleich 2 Pixel

---

### Requirement: Legal SSOT — Stammdaten-Tokens auf allen rechtlichen Seiten (T000306 AC 1/2)
<!-- e2e: fa-content-hub-legal-ssot.spec.ts -->

The system SHALL resolve the `stammdaten` email token on `/impressum`, `/datenschutz`, `/agb`, and in the footer on both the mentolder and korczewski brands, and SHALL protect the save and versions endpoints with authentication (401/403 without credentials).

#### Scenario: Stammdaten-E-Mail auf Impressum, Datenschutz, AGB und Footer *(E2E)*
- **GIVEN** mentolder-Website ist erreichbar
- **WHEN** `/impressum`, `/datenschutz`, `/agb` und die Startseite per HTTP-GET abgerufen werden
- **THEN** enthält der HTML-Body jeder Seite eine gültige E-Mail-Adresse im Format `user@domain.tld`

#### Scenario: Korczewski Impressum zeigt Stammdaten-E-Mail *(E2E)*
- **GIVEN** `KORCZEWSKI_URL` zeigt auf die korczewski-Website und `/impressum` ist erreichbar
- **WHEN** `/impressum` per HTTP-GET abgerufen wird
- **THEN** enthält der HTML-Body eine gültige E-Mail-Adresse

#### Scenario: Versions- und Save-Endpoints erfordern Auth *(E2E)*
- **GIVEN** kein gültiges Auth-Cookie
- **WHEN** GET auf `/api/admin/content/versions?key=stammdaten` oder POST auf `/api/admin/content/save` gesendet wird
- **THEN** antwortet der Endpoint jeweils mit 401 oder 403

---

### Requirement: Preisdarstellung als Single Source of Truth aus dem Leistungskatalog
<!-- e2e: fa-content-hub-price-ssot.spec.ts -->

The system SHALL display the same headline price (derived from `leistungen_config`) on the homepage service card, the detail page `/leistungen/<slug>`, and the `/leistungen` catalog table — one source, three render sites.

#### Scenario: Preis einer verknüpften Service-Card erscheint auf Homepage, Detailseite und Katalog *(E2E)*
- **GIVEN** die Startseite enthält mindestens einen Service-Card-Link auf `/leistungen/<slug>` mit einem sichtbaren EUR-Preistoken (z. B. "ab 60 € / Stunde")
- **WHEN** der gleiche Preis-Zahlenwert auf der Detailseite und in `/leistungen` gesucht wird
- **THEN** enthalten beide Seiten den identischen Zahlenwert — damit ist eine Single Source of Truth nachgewiesen

---

### Requirement: Content-Hub Service-Konsolidierung — Service-Seiten im universellen Editor (T000306 AC 3)
<!-- e2e: fa-content-hub-service-consolidation.spec.ts -->

The system SHALL serve `/leistungen` with HTTP 200 and non-empty content, accept `'service'` as a valid `contentKey` in the save endpoint (returning 401/403/409/422 — never 400), require authentication for service save and versions endpoints, and make `/admin/inhalte` accessible with a valid admin session.

#### Scenario: /leistungen-Seite lädt und listet mindestens ein Item *(E2E)*
- **GIVEN** die Website ist erreichbar
- **WHEN** `/leistungen` per HTTP-GET aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und der HTML-Body hat mehr als 200 Zeichen

#### Scenario: Service contentKey ist im Save-Endpoint registriert *(E2E)*
- **GIVEN** ein authentifizierter oder unauthentifizierter Client sendet `contentKey: 'service'`
- **WHEN** POST auf `/api/admin/content/save` gesendet wird
- **THEN** antwortet der Endpoint mit 401, 403, 409 oder 422 — **nicht** mit 400 (unbekannter Key)

---

### Requirement: Content-Hub Versionierung — Save, Versionsliste, Restore (T000306 AC 5)
<!-- e2e: fa-content-hub-versioning.spec.ts -->

The system SHALL require authentication for the versions list and restore endpoints, return 400 for missing `key` parameter on the versions endpoint (after auth), and increment the version number on each successful save, making the new version immediately queryable via the versions list endpoint.

#### Scenario: Versions- und Restore-Endpoints erfordern Authentifizierung *(E2E)*
- **GIVEN** kein gültiges Auth-Cookie
- **WHEN** GET auf `/api/admin/content/versions?key=stammdaten` oder POST auf `/api/admin/content/restore` gesendet wird
- **THEN** antwortet der Endpoint mit 401 oder 403

#### Scenario: Fehlender key-Parameter liefert 400 (nach Auth) *(E2E)*
- **GIVEN** ein Request ohne `key`-Parameter
- **WHEN** GET auf `/api/admin/content/versions` gesendet wird
- **THEN** antwortet der Endpoint mit 400 (fehlender Key), 401 oder 403 (nicht authentifiziert)

#### Scenario: Save erhöht Versionsnummer und neue Version ist sofort abrufbar *(E2E)*
- **GIVEN** ein authentifizierter Admin sendet einen Save-Request für `contentKey: 'seo'`
- **WHEN** der Save erfolgreich ist (HTTP 200)
- **THEN** enthält der Response-Body eine `version`-Zahl größer 0
- **AND** die nachfolgende GET `/api/admin/content/versions?key=seo`-Anfrage liefert ein Array mit mindestens einem Eintrag, dessen `id` der gespeicherten Version entspricht

<!-- merged from change delta website-core.md on 2026-06-28 -->

### Requirement: Transitive-CVE override convention documented

The `website/pnpm-workspace.yaml` MAY include an `overrides` block to pin transitive dependencies to CVE-patched versions when upstream packages have not yet released a fix. Each override entry SHALL include a comment referencing the CVE or advisory ID.

#### Scenario: Override block present with CVE annotation

- **WHEN** `website/pnpm-workspace.yaml` contains an `overrides` field
- **THEN** each overridden package version constraint SHALL trace to a known advisory (GHSA-* or CVE-*)
- **AND** the override SHALL be removed once the upstream package ships the fix

#### Scenario: Lockfile reflects override pinning

- **WHEN** `pnpm install` is run after adding an override
- **THEN** `pnpm-lock.yaml` SHALL record the overridden (safe) version for the affected transitive package
- **AND** `pnpm audit` SHALL report zero vulnerabilities for those packages

<!-- merged from change delta website-core.md on 2026-07-02 -->