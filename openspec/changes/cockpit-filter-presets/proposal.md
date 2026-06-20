---
ticket_id: T000988
status: planning
---

# Proposal: cockpit-filter-presets

## Why

Patrick filtert das Cockpit regelmäßig nach denselben Status-/Bereich-/Brand-Kombinationen.
Heute muss er bei jedem Cockpit-Besuch die Filter neu setzen. Gespeicherte Voreinstellungen
eliminieren diesen Wiederholungsaufwand und machen Filter-Konfigurationen über URLs im Team
teilbar — ohne eine serverseitige Persistenz oder Multi-Device-Sync einzuführen.

## What

### Kern-Nutzerflow

Patrick filtert das Cockpit nach Status/Bereich/Brand, klickt „Als Preset speichern", vergibt
einen Namen. Das Preset landet im localStorage seines Browsers. Beim erneuten Cockpit-Besuch
klickt er „Preset laden" und sieht die gespeicherte Filter-Konfiguration. Er kann Presets per
URL an Team-Mitglieder teilen — die URL enthält den serialisierten Filter-State.

3-5 Default-Presets (Offen, Planning, Deploy) stehen ab Werk zur Verfügung, können aber nicht
gelöscht werden.

### Akzeptanzkriterien

1. Cockpit-Filter (status, area, brand) als benanntes Preset in localStorage speicherbar
2. Preset-Dropdown zeigt eigene + Default-Presets, klick = Filter wird angewendet
3. Presets per URL teilbar (Query-Parameter `?preset=...` oder codierter State)
4. 3 Default-Presets vorinstalliert (Offen, Planning, Deploy) — nicht löschbar
5. Preset löschen möglich (nur eigene, nicht Defaults)

### Edge Cases

- localStorage voll: Hinweis-Toast, älteste nicht-Default-Presets automatisch evicted
- URL mit ungültigem Preset-Code: Fallback auf Default-View, keine Fehlerseite
- Gleicher Preset-Name doppelt: Auto-Suffix `-2`, `-3`

### Fehlerfall-Behandlung

- localStorage nicht verfügbar (Private Mode): Banner „Presets nur für Session" —
  Session-Only-Presets in-memory
- URL-Preset decode fehlschlägt: Toast „Preset ungültig", Cockpit lädt ohne Filter

### Erfolgsmetrik

- Patrick nutzt Presets in ≥50% der Cockpit-Sessions (Telemetrie)
- URL-Teilung funktioniert cross-Browser (Chrome ↔ Firefox)

### Technische Constraints

- Nur mentolder-Brand
- localStorage als Speicher (keine DB, kein Multi-Device-Sync)
- URL-State-Codierung: base64-komprimiert, ≤2000 Zeichen URL-Länge

## Acceptance Criteria

1. Cockpit-Filter (status, area, brand) als benanntes Preset in localStorage speicherbar
2. Preset-Dropdown zeigt eigene + Default-Presets, klick = Filter wird angewendet
3. Presets per URL teilbar (Query-Parameter `?preset=...` oder codierter State)
4. 3 Default-Presets vorinstalliert (Offen, Planning, Deploy) — nicht löschbar
5. Preset löschen möglich (nur eigene, nicht Defaults)
6. localStorage voll → Hinweis-Toast + Eviction ältester Nicht-Default-Presets
7. URL mit ungültigem Preset-Code → Fallback auf Default-View, kein Fehlerseite
8. Doppelte Preset-Namen → Auto-Suffix `-2`, `-3`
9. localStorage nicht verfügbar → Session-Only-Banner, in-memory-Presets
10. URL-Preset decode fehlschlägt → Toast „Preset ungültig", Cockpit lädt ohne Filter
11. URL-Teilung funktioniert cross-Browser (Chrome ↔ Firefox)
12. URL-State-Codierung base64-komprimiert, ≤2000 Zeichen

## Betroffene Dateien

- `website/src/components/admin/Cockpit/FilterBar.svelte` — Preset-Dropdown + Save-Dialog (neu)
- `website/src/lib/cockpit-presets.ts` — localStorage-CRUD, URL-Serialisierung (neu)
- `website/src/pages/admin/cockpit.astro` — URL-Parameter-Parsing beim Mount (bestehend, 30 Zeilen)

_Ticket: T000988_
