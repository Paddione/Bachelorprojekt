# Proposal: brett-vollausbau

## Why

Das Systembrett (`brett/`) ist Kernbestandteil der Coaching-Plattform, deckt aber nur 9 von 18
Funktionen professioneller Online-Systembretter vollständig ab (Inventar 2026-07-17). Für den
Einsatz durch Berater in echten Aufstellungssitzungen — auch am Tablet und mit
nicht-deutschsprachigen Klienten — fehlen: verschiebbare Rahmen, ein schaltbarer 2D/3D-Modus,
die Figuren-Metaposition, Mehrsprachigkeit (DE/FR/EN/ES) und verdecktes Arbeiten; vier weitere
Funktionen (freie Transparenz, Dialog-Perspektivwechsel, Blickwinkelanzeiger, Snapping/Hilfslinien)
sind nur teilweise vorhanden. Zusätzlich laufen fertige Kernfeatures (Zonen/Flächen) noch als
Dark-Launch hinter Feature-Flags und sind damit produktiv unsichtbar.

## What

- **Zonen/Rahmen (E1):** Dark-Launch-Flags default-aktivieren; `zone_update`-Message
  (verschieben/skalieren/beschriften/Opacity) + `Zone.variant: 'filled'|'frame'`; Drag-Move im Client.
- **Transparenz (E2):** `Figure.opacity` nutzersteuerbar (Fig-Panel-Slider), Zonen-Opacity editierbar.
- **2D/3D (E3):** client-lokaler Kameramodus-Toggle Perspektive/Orbit ⇄ Orthographisch top-down
  (`camera-modes.ts`).
- **Metaposition (E4):** `pov-camera.ts`-Modus `meta` — Vogelperspektive der besessenen Figur.
- **Dialoge (E5):** `ui/pov-panel.ts` verdrahtet `switchPov`; Dialog-Modus mit A/B-Alternierung.
- **Blickwinkelanzeiger (E6):** Sichtkegel-Mesh aus `facingY`, Topbar-Toggle.
- **Snapping (E7):** `snapping.ts` — Raster-Snap + Achsen-Alignment-Guides beim Drag.
- **i18n (E8):** `i18n.ts` + `locales/{de,en,fr,es}.ts`, Sprachumschalter, localStorage-Persistenz.
- **Verdecktes Arbeiten (E9):** `Figure.hidden` + `figure_hide_set` (leiter-only); Server filtert
  Snapshots/Broadcasts per Empfänger-Rolle (hide→delete / reveal→add für Nicht-Leiter).

Details und Trade-offs: `docs/superpowers/specs/2026-07-17-brett-vollausbau-design.md`.

_Ticket: T001931_
