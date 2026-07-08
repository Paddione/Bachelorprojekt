# Proposal: coaching-sessions-admin-ux

## Why

Die Coaching-Sessions-Funktion hat vier UX-/Hygiene-Lücken (Exploration + Brainstorming
2026-07-08, alle Entscheidungen vom User bestätigt — siehe
`docs/superpowers/specs/2026-07-08-coaching-sessions-admin-ux-design.md`):

1. **Adminmenü divergiert**: Sidebar (`AdminSidebarNav.astro`) kennt nur „Studio";
   das Dashboard (`admin.astro`) hat eine separate Kachel „Sitzungen". Die Session-Liste
   ist nicht einheitlich adressierbar.
2. **Kein Popout**: `SessionWizard.svelte` ist fest in die Admin-Seite eingebettet;
   im Repo existiert kein Popout-Muster.
3. **Wording inkonsistent**: „Sitzungen" statt „Sessions" in Coaching-UI-Strings.
4. **Testdaten-Leak-Risiko** (T001453-Muster): `coaching.sessions`/`coaching.session_steps`
   haben kein `is_test_data`-Feld und sind von `tickets.fn_purge_test_data()` (purge-fn-v5)
   nicht abgedeckt — Testdaten bleiben dauerhaft im Produktivsystem.

## What

1. **Adminmenü**: Neuer Sidebar-`NavItem` „Sessions" → `/admin/coaching/sessions`
   (Sektion Geschäft); Studio-Eintrag verliert den Sessions-`matches`-Pfad;
   Dashboard-Kachel wird auf Label „Sessions" angeglichen.
2. **Popout**: Neue Route `website/src/pages/admin/coaching/sessions/[id]/popout.astro`
   (SessionWizard ohne Admin-Chrome, gleiche Auth-Guard) + Helper `website/src/lib/popout.ts`
   (`window.open`-Kapselung mit Popup-Blocker-Fallback) + „Popout ↗"-Button in der
   Session-Detailansicht.
3. **Wording**: „Sitzung(en)" → „Session(s)" ausschließlich in den drei
   Coaching-Fundstellen (`admin.astro`, `helpContent.ts`, `api/admin/inbox/[id]/action.ts`);
   Auth-/Cookie-Kontext bleibt unverändert.
4. **Testdaten-Hygiene**: Migration `is_test_data boolean NOT NULL DEFAULT false` auf
   `coaching.sessions`; `createSession` reicht `isTestData` durch; Seeds/E2E setzen es;
   Purge-Fn v6 löscht `coaching.session_steps`/`coaching.sessions` mit `is_test_data`;
   einmalige, geprüfte (erst SELECT-listen, dann löschen) Prod-Bereinigung als
   dokumentierter Deploy-Schritt.

_Ticket: T001638_
