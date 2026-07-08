---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-08
---

# Coaching-Sessions: Adminmenü, Popout, Wording, Testdaten — Design

## Kontext

Die Coaching-Sessions-Funktion (Astro-Pages unter `website/src/pages/admin/coaching/sessions/`,
GUI `website/src/components/admin/coaching/SessionWizard.svelte`, DB-Schema `coaching.*`) hat
vier UX-/Hygiene-Lücken:

1. **Adminmenü divergiert**: Die Sidebar (`AdminSidebarNav.astro`) kennt nur den Eintrag
   „Studio" (Sektion Geschäft, mit `matches` auf `/admin/coaching/sessions`); das Dashboard
   (`admin.astro:66`) hat eine separate Kachel mit dem Label „Sitzungen". Die Session-Liste
   ist nicht einheitlich adressierbar.
2. **Kein Popout**: `SessionWizard.svelte` ist fest in die Admin-Seite eingebettet; es gibt
   im Repo kein Popout-Muster (kein `window.open`, kein Document-PiP).
3. **Wording inkonsistent**: „Sitzungen" statt „Sessions" in Coaching-UI-Strings.
4. **Testdaten-Leak-Risiko** (T001453-Muster): `coaching.sessions` / `coaching.session_steps`
   haben kein `is_test_data`-Feld und sind von `tickets.fn_purge_test_data()`
   (`scripts/one-shot/purge-fn-v5.sql`) nicht abgedeckt — Testdaten bleiben dauerhaft in Prod.

## Entscheidungen (Brainstorming 2026-07-08, alle vom User bestätigt)

| Frage | Entscheidung |
|---|---|
| Popout-Mechanik | `window.open` + dedizierte Popout-Route (kein Document-PiP, kein bloßer `_blank`-Link) |
| Adminmenü | Eigener Sidebar-Eintrag „Sessions" unter Geschäft; Dashboard-Kachel angleichen |
| Wording-Scope | Nur Coaching-Kontext; Auth-/Cookie-„Sitzung" (Login-Sitzungen, DSGVO-Kontext) bleibt deutsch |
| Testdaten | `is_test_data`-Spalte + Purge-Fn v6 + einmalige, geprüfte Prod-Bereinigung |

## Design

### 1. Adminmenü-Vereinheitlichung

- `website/src/components/admin/AdminSidebarNav.astro`: neuer `NavItem` in `navSections`
  → Sektion `Geschäft`: `{ href: '/admin/coaching/sessions', label: 'Sessions', icon: icons.clipboard, matches: ['/admin/coaching/sessions'] }`.
- Der bestehende Studio-Eintrag verliert `/admin/coaching/sessions` aus seinem
  `matches`-Array (sonst doppelte Aktiv-Markierung).
- `website/src/pages/admin.astro`: Kachel-Label `'Sitzungen'` → `'Sessions'` (Ziel bleibt
  `/admin/coaching/sessions`).

### 2. Popout-GUI

- Neue Route `website/src/pages/admin/coaching/sessions/[id]/popout.astro`:
  - Gleiche Auth-Guard und Datenladung wie `[id].astro` (Session, Audit-Log, KI-Provider).
  - Rendert `SessionWizard.svelte` in einem minimalen Layout ohne Admin-Sidebar/-Chrome
    (kompakter `<head>`, Brand-Design-Tokens bleiben).
- Neuer Helper `website/src/lib/popout.ts`: `openPopout(url: string, name: string, opts?)` —
  kapselt `window.open(url, name, 'width=1100,height=800,noopener,...')` mit Fokus auf ein
  ggf. schon offenes Fenster gleichen Namens. Wiederverwendbares Muster für künftige Popouts.
- „Popout ↗"-Button in der Session-Detailansicht (Einbindungspunkt: `sessions/[id].astro`
  bzw. Kopfbereich des `SessionWizard` — Implementierung wählt den zeilenneutralsten Ort,
  S1-Budget von `SessionWizard.svelte` beachten).
- Keine GUI-Duplikation: beide Routen rendern dieselbe `SessionWizard`-Komponente.

### 3. Wording „Sessions" statt „Sitzungen" (nur Coaching-Kontext)

Umzubenennen:
- `website/src/pages/admin.astro:66` — Kachel-Label.
- `website/src/lib/helpContent.ts:138` — Hilfetext „Coaching-Sitzungen" → „Coaching-Sessions".
- `website/src/pages/api/admin/inbox/[id]/action.ts:154` — Chat-String „…für diese Sitzung" → „…für diese Session".

Explizit NICHT umbenennen (Auth-/Cookie-Kontext): `SessionExpiryWarning.svelte`,
`i18n/de.ts` (`cookie.*`), `CookieConsent.svelte`, `ReleasesTab.svelte`,
Keycloak-Strings in `system-test-seed-data.ts`. Test-Fixtures (`cii.test.ts`,
`coaching-classifier.test.ts`) und Rechnungs-Seed-Positionen bleiben unverändert
(historische/fixture Daten, nicht user-facing UI).

### 4. Testdaten-Hygiene

- Migration (neue SQL-Datei unter `scripts/migrations/`):
  `ALTER TABLE coaching.sessions ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;`
  (`session_steps` kaskadieren über `session_id`, keine eigene Spalte nötig).
- `website/src/lib/coaching-session-db.ts`: `createSession` akzeptiert optionales
  `isTestData` (Default `false`); Seed-/E2E-Pfade (`systemtest-seeds/`, Playwright-Setup)
  setzen es auf `true`, sobald sie Coaching-Sessions anlegen.
- Purge-Fn v6: `scripts/one-shot/purge-fn-v6.sql` erweitert `tickets.fn_purge_test_data()` um
  `DELETE FROM coaching.session_steps USING coaching.sessions s WHERE session_id = s.id AND s.is_test_data;`
  und `DELETE FROM coaching.sessions WHERE is_test_data;`.
- Einmalige Prod-Bereinigung als dokumentierter Deploy-Schritt: Kandidaten erst per
  SELECT listen (Titel-/Client-Muster, Erstellungsdatum), User-sichtbar dokumentieren,
  dann gezielt löschen — kein Blind-Delete. DDL/Writes laufen über den kubectl-psql-Pfad
  (mcp-postgres ist read-only).

## Fehlerbehandlung

- Popout: Wenn `window.open` blockiert wird (Popup-Blocker), fällt der Button auf
  Navigation im selben Tab zurück (Rückgabewert `null` prüfen).
- Purge-Fn v6 ist idempotent (`is_test_data`-Prädikat); Migration nutzt `IF NOT EXISTS`.

## Tests

- Failing-Test zuerst (rot→grün): BATS in `tests/spec/coaching-sessions-polish-guide.bats` —
  Struktur-Assertions (Popout-Route existiert, Sidebar-Eintrag vorhanden, purge-fn-v6 enthält
  `coaching.sessions`, kein „Sitzung"-String mehr in den drei Coaching-Fundstellen).
- Vitest für `coaching-session-db.ts` (`isTestData`-Durchreichung).
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` als finale Gates.

## OpenSpec

- Change-Slug: `coaching-sessions-admin-ux`.
- Delta-Specs gegen Parent-SSOTs: `coaching-sessions-polish-guide` (GUI, Wording, Testdaten)
  und `admin-nav-accordion` (Sidebar-Eintrag).
