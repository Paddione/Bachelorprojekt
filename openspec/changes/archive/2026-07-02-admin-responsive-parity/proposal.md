# Proposal: admin-responsive-parity

## Why

Die Adminsuite hat eine responsive Shell (AdminLayout: Off-Canvas-Sidebar, Mobile-Topbar),
aber der Seiteninhalt ist einseitig: Über ein Dutzend Views rendern breite `<table>`-Layouts
ohne jede Mobile-Anpassung (rechnungen, projekte, zeiterfassung, termine, kalender,
[clientId]-Portal, NewsletterAdmin, coaching/*, aktionen/* u. a.) — auf einem Smartphone
sind sie faktisch unbenutzbar. Umgekehrt nutzen mobile-first Single-Column-Formulare
(einstellungen/*, inhalte) auf Desktop-Breite die Fläche nicht. Ziel ist Responsive-Parität:
jede Admin-View ist auf 375px benutzbar UND auf ≥1024px sinnvoll layoutet.

## What

Layered Approach (S1-Ratchet-konform — die großen Admin-Seiten sind mit Budget 0 gebaselined):

1. **Layer 1 — globaler Fallback, 0 Markup-Änderungen:** neues Stylesheet
   `website/src/styles/admin-responsive.css`, eingebunden in `AdminLayout.astro`.
   Mobile (≤767px): alle Admin-Content-Tabellen horizontal scrollbar
   (Cockpit via `:not([data-container="cockpit"])` ausgenommen), 44px-Touch-Targets,
   opt-in Grid-Kollaps (`.admin-grid-collapse`). Desktop (≥1024px): opt-in
   Formular-Aufwertung (`.admin-form-wide`: max-width + 2-Spalten-Feldgruppen).
2. **Layer 2 — Tabelle→Karte opt-in:** Cockpit-Muster als generische Klasse
   `.admin-table-collapse` (Container-Query <480px, `data-label`-Kartenzeilen),
   zeilenneutral angewendet auf rechnungen.astro, projekte.astro, zeiterfassung.astro.
3. **Layer 3 — ui/-Bausteine intrinsisch responsive:** AdminTabs (Mobile-Scroll),
   AdminStatCard/AdminCard (kompakte Mobile-Paddings), AdminPageHeader (Mobile-Stack).
4. **Einstellungs-Views:** `.admin-form-wide` auf die einstellungen/*-Formular-Container.

Keine Verhaltens-/API-Änderungen, keine neuen Dependencies. Verifikation: BATS-Spec-Test
(Stylesheet + Kern-Selektoren + Einbindung), `task test:changed` + Freshness-Gates,
Budget-0-Dateien zeilenneutral.

Spec: `docs/superpowers/specs/2026-07-02-admin-responsive-parity-design.md`

_Ticket: T001471_
