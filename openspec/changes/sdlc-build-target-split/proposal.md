# Proposal: sdlc-build-target-split

## Why

Ein Commit an einer SDLC-Seite rollt heute die Kundenwebsite aus.
`.github/workflows/build-website.yml` triggert auf `paths: ['website/**']` — und die
Entwicklungsfläche (Factory-Floor, Cockpit, Pipeline, Tickets, Observability, Repo-Health,
Cluster-Monitoring) liegt in derselben Astro-Anwendung wie mentolder.de und korczewski.de. Eine
Änderung am Factory-Floor baut damit ein neues Website-Image und rollt es auf beide Marken aus.

Das ist der schwerwiegendste der drei in ADR-006 benannten Schmerzpunkte: ein Fehler in der
Entwicklungsfläche kann die Kundenseite kippen, obwohl beide fachlich nichts miteinander zu tun
haben.

Eine Messung am 2026-08-03 zeigt, dass die beiden Flächen kaum verflochten sind: von 164
`lib`-Modulen benutzen nur **18 (11 %)** beide Seiten, und die sind größtenteils legitime
Infrastruktur (`auth`, `db-pool`, `logger`, `identity`, `rate-limit`, `audit-log`, `website-db`).
Der Schnitt ist damit machbar, ohne gemeinsame Module auflösen zu müssen.

## What

Die SDLC-Fläche wird innerhalb derselben Codebase physisch abgetrennt und bekommt ein eigenes
Build-Target, sodass der Produktions-Build nicht mehr ausgelöst wird.

1. **Verzeichnis-Umzug** — 154 Dateien (Seiten und API-Routen) und 53 ausschließlich von SDLC
   benutzte `lib`-Module ziehen nach `src/pages/sdlc/`, `src/lib/sdlc/` und
   `src/components/sdlc/`. Die 18 geteilten Module bleiben unverändert liegen.
2. **Build-Target-Schalter** — eine Astro-Integration filtert im Hook `astro:routes:resolved`
   (Astro 7.1.6) das Route-Manifest anhand von `BUILD_TARGET=prod|sdlc`. Aus einer Codebase
   entstehen zwei Images.
3. **Negativer Pfad-Filter** — `build-website.yml` bekommt
   `paths: ['website/**', '!website/src/**/sdlc/**']`; ein rein SDLC-Commit baut die
   Kundenwebsite nicht mehr.
4. **Redirects** — die URLs ziehen mit (`/admin/cockpit` → `/sdlc/cockpit`); die bestehende
   `src/middleware/redirect-map.ts` hält die alten Pfade erreichbar, solange die Routen noch im
   Produktions-Image liegen.

**Nicht in diesem Vorgang:** kein Datenumzug, keine neue Infrastruktur, keine Abschaltung von
Funktionen in der Produktion. Alle SDLC-Routen bleiben nach diesem Change erreichbar — das
Entfernen aus dem Produktions-Image ist Etappe 4 (T002627) und setzt den Datenumzug (T002626)
voraus. Dieser Change ist vollständig reversibel.

**Nachweis-Pflicht:** Dass ein Commit ausschließlich unter `src/**/sdlc/**` den
Produktions-Website-Build nicht mehr auslöst, ist zu belegen — nicht zu behaupten. Diese
Eigenschaft ist der einzige Zweck des Vorgangs.

_Ticket: T002624 (Epic T002623, ADR-006 Etappe 1)_
