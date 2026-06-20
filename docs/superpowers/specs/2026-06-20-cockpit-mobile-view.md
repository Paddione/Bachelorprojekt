---
ticket_id: T000987
plan_ref: openspec/changes/cockpit-mobile-view/tasks.md
status: active
date: 2026-06-20
---

# Spec: Cockpit: Mobile-Ansicht für Handy

## Kern-Nutzerflow

Patrick öffnet das Cockpit auf dem Smartphone. Das Sidekick-Menu ist als Hamburger-Toggle realisiert und eingeklappt, der Hauptbereich nimmt die volle Breite ein. Container-Queries steuern das Layout — bei schmalem Viewport stacked die Ticket-Liste vertikal, der Rollup-Header wird zu einer Karte. Touch-Targets sind ≥48dp (Android-Material-konform), ohne horizontales Scrollen.

## Akzeptanzkriterien

1. Cockpit auf 360px-Breite ohne horizontales Scrollen bedienbar
2. Sidekick-Menu per Hamburger-Toggle auf- und zuklappbar, default eingeklappt
3. Alle Touch-Targets mindestens 48dp Höhe/Breite
4. Layout über Container Queries (kein JS-basiertes Resize-Handling nötig)
5. Bestehende Desktop-View bleibt unverändert (≥1024px)

## Edge Cases

- Sehr kleines Tablet (600-800px): Zwischenlayout, Sidekick als schmaler Streifen sichtbar
- Landscape-Modus auf Handy: Layout rotiert sinnvoll, Sidekick bleibt zugänglich
- Sehr lange Ticket-Titel: Truncation mit Tooltip statt Zeilenumbruch

## Fehlerfall-Behandlung

- Layout-CSS-Laden fehlschlägt: Fallback-Stylesheet mit Basis-Stacked-Layout
- Sidekick-Toggle kaputt: Notfall-Link im Header zum direkten Navigieren

## Erfolgsmetrik

- Cockpit Lighthouse Mobile-Score ≥80
- Patrick kann eine Ticket-Status-Änderung auf Handy in ≤30s durchführen

## Technische Constraints

- Nur mentolder-Brand
- Keine separate Mobile-Route — responsive Anpassung der bestehenden /admin/cockpit
- Keine neue Design-System, keine separate App
- CSS-Container-Queries (in allen modernen Browsern supported)

## Betroffene Dateien

- `website/src/pages/admin/cockpit.astro` — Container-Query-Wrappers
- `website/src/components/admin/SidekickMenu.svelte` — Hamburger-Toggle-Logik
- `website/src/components/admin/Cockpit/*` — responsive Anpassungen
- Neue `website/src/styles/mobile-cockpit.css` — mobile-spezifische Regeln
