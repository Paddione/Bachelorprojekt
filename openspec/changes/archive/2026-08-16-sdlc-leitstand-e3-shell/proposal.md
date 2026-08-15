# Proposal: sdlc-leitstand-e3-shell

## Why

Das SDLC-Cockpit ist heute modusgetrieben (Command Bar + Overview/Fokus/Insights mit
Voll-Reload pro Moduswechsel) — der Gesamtzustand der Maschinerie ist nie vollständig
sichtbar, und die Nebendomänen (Plattform/KI-Steuerung) hängen in einem toten
Komponentenzweig (`DevStatusTabs.svelte`, nirgends eingebunden). Das Leitstand-Epic
T007553 hat mit E1 (Token-Set `--ls-`) und E2 (API-Inventar) das Fundament gelegt;
E3 baut darauf die eigentliche Leitstand-Shell: **fünf Zonen statt Modi**, permanenter
Wertstrom, selektionsgetriebene Tiefe. Entscheidungsprotokoll und Zonen-Vertrag:
`design.md` dieses Change.

## What

- **Umbau `components/website/src/pages/sdlc/cockpit.astro`** auf die 5 Zonen:
  Statusband (Z1, permanent, + Help-Toggle), Attention-Strip (Z2, permanent),
  Stationen-Achse (Z3, Wertstrom Scout→Deploy, permanent), Kontextzone (Z4,
  selektionsgetrieben: leer→KPI-Raster, Station→Liste/PlanningOffice,
  Ticket→DetailPanel), Seitenmodul-Leiste mit Deck-Umschalter (Z5, Decks
  Qualität/Plattform/KI/Wissen — die einzige umschaltende Zone).
- **URL-Schema**: Query auf `/sdlc/cockpit` (`?station=`, `?ticket=`, `?deck=`,
  kombinierbar); Legacy-Mapping für `?mode=`/`?phase=`; Selektion via
  `history.pushState` ohne Voll-Reload.
- **Wiederverwendung mit Sterbeliste**: Floor-/Detail-/Attention-Komponenten werden in
  die Zonen eingehängt (testids stabil gemappt); `CommandBar`, `CockpitRail`-Hülle
  (Metrik-Logik wird extrahiert), `OverviewDashboard` und `DevStatusTabs` sterben.
  Der tote Plattform/KI-Kartensatz (12 Komponenten) wird in den Decks reaktiviert;
  `GoalsDashboard` wird Modul des Qualität-Decks.
- **purpose-Registry** `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`:
  jede Shell-Komponente deklariert `{zweck, datenquelle, aktionen}`; Eindeutigkeit und
  Vollständigkeit sind BATS-geprüft (Overlay-UI folgt in E5).
- **Spec-Delta** auf `openspec/specs/sdlc-cockpit.md`: 3 ADDED (Zone Model,
  URL Scheme, Purpose Registry), 15 MODIFIED, 3 REMOVED — die bewusste Ersetzung der
  Command-Bar-/Overview/Fokus-Layout-Entscheidungen; die ~42 Nicht-Layout-Requirements
  (Adapter, Schreibpfad, Realtime, Auth, Daemon) bleiben unangetastet.
  `software-factory.md` bleibt ohne Delta (testid-Mapping-Entscheidung).

**Nicht in diesem Change:** Deck-Innenausbau über die reaktivierten Karten hinaus,
Observability-Live-Quellen, DORA-KPIs, LISTEN-Umstellung des Floor-Streams (E4);
Help-Overlay-UI, Satelliten-Redirects, Print-Light-Feinschliff (E5).

_Ticket: T007957_
