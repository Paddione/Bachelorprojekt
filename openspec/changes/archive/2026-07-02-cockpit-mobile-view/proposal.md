---
ticket_id: T000987
status: planning
---

# Proposal: cockpit-mobile-view

## Why

Patrick arbeitet increasingly vom Smartphone aus, doch das Projekt-Cockpit
(`/admin/cockpit`) ist aktuell nur für Desktop-Breiten nutzbar: das
Sidekick-Drawer überlagert den Content, die Ticket-Tabelle erzwingt
horizontales Scrollen, und Touch-Targets sind zu klein für Fingerbedienung.
Eine Ticket-Status-Änderung ist auf Handy aktuell nicht in akzeptabler Zeit
durchführbar. Die Erfolgsmetrik fordert einen Lighthouse Mobile-Score ≥80
sowie eine Status-Änderung in ≤30s auf dem Handy. Ohne eine responsive
Mobile-Ansicht bleibt das Cockpit an den Schreibtisch gebunden.

## What

Responsive Anpassung der bestehenden `/admin/cockpit`-Route (kein separate
Mobile-Route, keine neue App). Die Layout-Steuerung erfolgt über **CSS
Container Queries** (`@container`) auf einem Wrapper-Container um die
Cockpit-Komponente — kein JS-basiertes Resize-Handling für das Layout. Das
Sidekick-Drawer (PortalSidekick) wird per **Hamburger-Toggle** (≥48dp
Touch-Target) geschaltet und ist default eingeklappt; der Hauptbereich nimmt
die volle Breite ein. Bei schmalem Viewport stacked die Ticket-Liste
vertikal, der ContainerRollupHeader wird zu einer Karte. Lange Ticket-Titel
werden mit Tooltip trunciert statt umgebrochen. Touch-Targets sind
durchgängig ≥48dp (Android-Material-konform). Ein Fallback-Stylesheet
sorgt für ein Basis-Stacked-Layout, falls Container-Queries nicht
unterstützt werden. Die Desktop-View (≥1024px) bleibt unverändert.
Nur mentolder-Brand.

## Acceptance Criteria

1. Cockpit auf 360px-Breite ohne horizontales Scrollen bedienbar
2. Sidekick-Menu per Hamburger-Toggle auf- und zuklappbar, default eingeklappt
3. Alle Touch-Targets mindestens 48dp Höhe/Breite
4. Layout über Container Queries (kein JS-basiertes Resize-Handling nötig)
5. Bestehende Desktop-View bleibt unverändert (≥1024px)
