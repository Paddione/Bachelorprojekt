# Proposal: sdlc-leitstand-e5-help-absorption

## Why

Etappe E5 des Leitstand-Epics (T007553, Design:
`docs/superpowers/specs/2026-08-15-sdlc-leitstand-design.md` §S3/S8). Die E3-Shell liefert die
purpose-Registry (`lib/sdlc/leitstand-purpose-registry.ts` mit `{ zweck, datenquelle,
aktionen }` und Eindeutigkeits-Guard) — aber der sichtbare Layer fehlt: Der `[?]`-Toggle des
Statusbands hat noch kein Overlay, das die Erklärungen in situ rendert. Zugleich leben absorbierbare
Satellitenseiten (`repohealth`, `prompts`, `ki-konfiguration`) neben den Decks weiter, und die
bestehende Redirect-Map verwendet für Cockpit-Ziele ein `?tab=`-Vokabular, das die
E3-URL-Weiche (`?station/?ticket/?deck` + Legacy `mode/phase`) gar nicht liest — diese
Redirects landen also effektiv auf der Default-Ansicht.

## What

1. **Help-Overlay-Layer:** `HelpOverlay.svelte` legt sich bei aktivem `[?]`-Toggle
   (Statusband) über die Fläche und rendert `zweck`/`datenquelle`/`aktionen` aus der Registry
   an der Position der jeweiligen Komponente (`data-purpose-id`-Anker).
2. **Satelliten-Absorption:** `repohealth.astro` (→ `?deck=qualitaet`), `prompts.astro`
   (→ `?deck=wissen`) und `ki-konfiguration.astro` (→ `?deck=ki`) sterben; ihre Module
   (`PromptLibraryManager`, `KiKonfiguration`) ziehen in die Decks; Redirects über
   `middleware/redirect-map.ts`. Die bestehenden `?tab=`-Cockpit-Ziele der Map werden auf das
   E3-Schema normalisiert. Nicht absorbiert werden `platform`, `architektur`, `app-catalog`,
   `software-history`, `design-system` (eigenständige Flächen bzw. E1-Showcase).
3. **Print-Light:** Ausbau des `@media print`-Blocks in `sdlc-leitstand.css` zur
   vollwertigen Report-Ansicht (explizite `.report`-Klasse), kein zweites interaktives Theme.
4. **Politur:** Glow/Puls-Disziplin (nur „läuft gerade"-Zustände), Kompakt-Dichte,
   Mobile-Zonen-Stapel-Feinschliff.

## Abhängigkeiten

`blocked_by` E3 (T007957: Statusband, Decks, Registry) und E4 (T008016: DeckWissen wird dort
zur Katalog-Fläche umgebaut — Datei-Kollision wird durch Sequenz vermieden; Observability-
Absorption passiert bereits in E4).

_Ticket: T008017_
