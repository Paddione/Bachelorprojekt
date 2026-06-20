# website-core

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Astro-basierte Website-Plattform mit SSR (Node-Adapter), die unter zwei Marken (`mentolder` / `korczewski`) betrieben wird. Jede Marke hat ein eigenes Design-System, eine eigene Navigationshierarchie und eine eigene Inhaltskonfiguration. Inhalte folgen einer dreistufigen Prioritätskette: DB-Override (Admin) > statische `pageContent`-Felder in der Marken-Config > TypeScript-Fallback in `src/config/brands/<brand>.ts`.

---

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
