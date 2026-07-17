---
ticket_id: T001931
plan_ref: openspec/changes/brett-vollausbau/tasks.md
status: active
date: 2026-07-17
---

# Design: Systembrett-Vollausbau auf 18 Zielfunktionen (brett-vollausbau)

Ticket: T001931 · Change: `openspec/changes/brett-vollausbau/` · SSOT-Parent-Spec: `openspec/specs/brett.md`

## Problem & Ziel

Der Systembrett-Service (`brett/`) soll mindestens die 18 Kernfunktionen professioneller
Online-Systembretter abbilden (Vergleichsmaßstab: kommerzielle Tools wie ProReal /
Online-Systembrett). Inventar vom 2026-07-17 gegen die Zielliste:

| Kategorie | Vorhanden | Teilweise | Fehlt |
|---|---|---|---|
| Basis & Visualisierung | Figurenanzahl unlimitiert, Flächen (flag-gated) | Transparenzen | Verschiebbare Rahmen, 2D/3D-Umschaltung |
| Navigation & Perspektiven | Orbit (Drehen/Kippen), First-Person-Innensicht | Dialoge (switchPov unverdrahtet), Blickwinkelanzeiger | Figuren-Metaposition |
| Bedienung & Handling | Tablet/Touch, Beschriftung | Präzises Ausrichten (Grid ohne Snapping) | Multilingual DE/FR/EN/ES |
| Prozessunterstützung | Sperren/Fixieren, Farbe/Form live, Presence | — | Verdecktes Arbeiten |

## Architektur-Kontext (Ist)

- Express 5 + `ws` unter `/sync?room=`, typisiertes Message-Union in `brett/src/types/messages.ts`
  (`RELAY_TYPES` / `ADMIN_TYPES` in `ws-handler.ts`), Rechte fail-closed über `canMutate`
  (`brett/src/server/permissions.ts`), Rollen leiter/stellvertreter/beobachter/gast/zuschauer.
- Persistenz: `brett_rooms.state` JSONB mit Sentinel-Keys (`__roles__`, `__lines__`, …) —
  keine Schema-Migrationen für neue Entitäten nötig.
- Client: Three.js, modulare UI in `brett/src/client/ui/*`, Orbit in `scene.ts`, First-Person in
  `pov-camera.ts` (enthält bereits unverdrahtetes `switchPov`), Touch in `touch-handler.ts`.
- Mehrere fertige Features laufen als Dark-Launch hinter `window.__brettFeatures[...]`
  (Zonen/Anker `t000468-ground-anchors`, Free-Fly `sf-t000465`, Notizen `sf-t000469`, Linien `sf-t000467`).

## Entscheidungen

### E1 — Flächen & verschiebbare Rahmen: Zone-Modell erweitern (kein neues Entity)
- Dark-Launch-Flags der benötigten Kernfeatures **default-aktivieren** (Flags bleiben als
  Kill-Switch überschreibbar) — damit sind Flächen (Zonen) produktiv.
- Neue WS-Message `zone_update { zoneId, x?, z?, width?, height?, radius?, label?, opacity?, rotY? }`
  in `ADMIN_TYPES` + leiter-Gate (analog `line_*`).
- `Zone.variant: 'filled' | 'frame'` — `frame` rendert nur die Umrandung (verschiebbarer Rahmen).
- Client: Zonen per Drag verschiebbar (Raycast auf Zone-Mesh), Edit-Popover für Größe/Label/Opacity.
- Verworfen: eigenes Frame-Entity (dupliziert Sync-/Persistenz-/Permissions-Pfad ohne Mehrwert).

### E2 — Transparenzen: nutzersteuerbare Opacity pro Element
- `Figure.opacity?: number` (0.2–1.0), gesetzt über bestehende `update`-Message; Slider im
  Fig-Panel; Rendering in `mannequin-visuals.ts` (traversiert Materialien, `transparent=true`).
- Zonen-Opacity über `zone_update` + Slider im Zone-Popover.
- Interaktion mit Auto-Dim (Selektion) und Moderation-Dim: multiplikativ — effektive Opacity
  = base × dimFactor, damit Moderation weiterhin sichtbar dominiert.

### E3 — 3D-Raum schaltbar: client-lokaler 2D/3D-Kameramodus
- Neues Modul `brett/src/client/camera-modes.ts`: Toggle Perspektive/Orbit ⇄ OrthographicCamera
  top-down (Blick senkrecht, Rotation nur um Y, Zoom über Ortho-Frustum).
- Client-lokal (Kamera ist persönliche Perspektive, kein Shared State), Topbar-Button.
- Raycast/Drag/Doppelklick funktionieren unverändert (Three.js-Raycaster unterstützt Ortho).

### E4 — Figuren-Metaposition: Modus in pov-camera
- `pov-camera.ts` bekommt Modus `'first-person' | 'meta'`: Meta = Kamera ~6 Einheiten über der
  besessenen Figur, leicht versetzt, blickt auf die Figur (Vogel-/Metaperspektive dieser Figur).
- Umschalter im POV-Overlay (E5); Server-Messages (`figure_possess`/`release`) unverändert.
- Verworfen: Free-Fly-Ausbau — nicht figurenbezogen, verfehlt die Coaching-Semantik.

### E5 — Dialoge / Innensicht-Wechsel: POV-Panel verdrahtet switchPov
- Neues `brett/src/client/ui/pov-panel.ts`: Overlay bei aktiver Possession — Liste der anderen
  Figuren (Name/Farbe), Klick ruft das bestehende `switchPov(figureId)` (release+possess atomar).
- Dialog-Modus: zwei Figuren A/B wählbar; ein Button/Hotkey wechselt alternierend die Innensicht —
  geführter Perspektivwechsel für Dialogarbeit.
- Innensicht ⇄ Metaposition-Umschalter (E4) und „Verlassen" im selben Panel.

### E6 — Blickwinkelanzeiger: Sichtkegel aus facingY
- Flacher Sektor-Mesh (~60°, Radius ~1.5, Figurfarbe, opacity ~0.25) am Fuß jeder Figur,
  ausgerichtet nach vorhandenem `figure.facingY`; Update bei `move`/`update`.
- Client-lokaler Topbar-Toggle (default an); kein neuer Server-State.

### E7 — Präzises Ausrichten: Snapping + Alignment-Guides
- Neues `brett/src/client/snapping.ts`: bei aktivem Magnet-Toggle Drag-Snap auf 0.5-Raster;
  Achsen-Alignment: |Δx| bzw. |Δz| < 0.2 zu einer anderen Figur → temporäre Hilfslinie
  (THREE.Line) + Einrasten auf deren Achse.
- Rein client-seitig (Endposition wird ohnehin via `move` gesynct); Touch- und Maus-Drag nutzen
  denselben Hook.

### E8 — Multilingual DE/FR/EN/ES: leichtes eigenes i18n
- `brett/src/client/i18n.ts` (`t(key)`, `setLang`, `applyTranslations` für `data-i18n`-Attribute)
  + `brett/src/client/locales/{de,en,fr,es}.ts` (ein Dictionary pro Sprache, DE = Referenz).
- Sprachwahl: localStorage `brett_lang`, Fallback `navigator.language` → `de`; Umschalter im
  Hauptmenü und in der Topbar; `document.documentElement.lang` wird nachgeführt.
- Scope: Haupt-UI (Hauptmenü, Lobby, Topbar, Fig-Panel, Appearance, HUD-Badges, Export, POV-Panel,
  Onboarding-Kerntexte). Out of scope: server-seitige Fehlertexte, share/zuschauer-Sonderseiten
  (Follow-up), Replay-UI-Details.
- Verworfen: i18next — Dependency-Overhead für ~200 Strings in Vanilla-TS-UI.

### E9 — Verdecktes Arbeiten: server-seitig gefilterter Hidden-State
- `Figure.hidden?: boolean`; neue Message `figure_hide_set { figureId, hidden }` in `ADMIN_TYPES`,
  nur `leiter`.
- **Server filtert per Empfänger-Rolle**: Nicht-Leiter erhalten hidden-Figuren weder im
  `state_snapshot` noch als Broadcast; Übergänge werden übersetzt (hide → `delete`-Broadcast,
  reveal → `add`-Broadcast an Nicht-Leiter). Mutationen an hidden-Figuren werden Nicht-Leitern
  nicht relayed. Sicherheitsgrund: Daten dürfen Read-only-Clients (Zuschauer/Share) nie erreichen.
- Leiter-Client rendert hidden-Figuren halbtransparent mit 🕶-Badge; Toggle im Fig-Panel.
- Interaktion Undo/Redo/Replay: `hidden` ist normaler Figur-State; Filterung passiert
  ausschließlich am Broadcast-/Snapshot-Rand (keine Sonderlogik in Stacks/Eventlog).

## Risiken

1. **Hidden-Filterung** ist der sicherheitskritischste Teil (Rolle pro Empfänger am
   Broadcast-Punkt) — dedizierte Unit-Tests in `brett/test/` (MOCK_DB) für alle Rollen.
2. **Ortho-Raycast/Drag** in 2D-Modus: explizite Browser-Verifikation inkl. Tablet-Viewport.
3. **i18n-Flächendeckung**: bewusst gescopte Haupt-UI; Reststrings iterativ nachziehen.
4. **S1-Budgets**: `board-boot.ts` (504/600) darf kaum wachsen — neue Logik konsequent in die
   neuen Module (`camera-modes.ts`, `snapping.ts`, `ui/pov-panel.ts`, `i18n.ts`), Wiring-Zeilen
   minimal halten.

## Verifikation

- Unit: `brett/` node:test-Suite (`npm test`, MOCK_DB) — neue Tests für zone_update-Permissions,
  hidden-Filterung pro Rolle, i18n-Fallback-Logik.
- BATS: neues `tests/spec/brett.bats` (Spec-Slug-Konvention) — strukturelle Gates (Locale-Dateien
  vollständig, Message-Typen registriert). Rot→grün gemäß TDD.
- Browser: `npm run dev` in `brett/` — alle 18 Funktionen durchspielen, Tablet-Viewport,
  Multi-Client für Presence/Hidden/Dialog; drei Iterationspässe vor PR.
- `task test:changed` + `task freshness:regenerate` + `task freshness:check` (CI-Äquivalent).
