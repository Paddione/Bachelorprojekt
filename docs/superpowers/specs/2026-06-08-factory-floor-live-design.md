# Spec: Factory Live-Visualisierung ("Fabrikhalle")

**Datum:** 2026-06-08
**Branch:** `feature/factory-floor-live`
**Route:** `/dev-status` (admin-only, mentolder-Brand)

## Zusammenfassung

Die heutige `/dev-status`-Seite (`FactoryDashboard.svelte`, 15s-Polling gegen `GET /api/factory-metrics`) zeigt nur aggregierte Endzustände — keine Live-Phasen, keinen Blockier-Grund. Diese Spec baut sie zu einer **echten Live-Visualisierung** der Software Factory aus: einer **verschmolzenen "Fabrikhalle"** (Pipeline-Board in Fabrik-Metapher), die zeigt, *was gerade in welcher Phase läuft*, *was implementiert wurde* und *warum etwas hängt* — read-only, mit ansprechenden Visuals.

## Scope & Non-Goals

**In-scope:**
- **A** — Live-Phasen-Visualisierung (Scout→Design→Plan→Implement→Verify→Deploy pro Ticket)
- **B** — Blocking-Sichtbarkeit (`retry_count`, `blocked`-Grund, Konflikte, Watchdog, Guards: kill-switch/daily-cap/dry-run)
- **D1** — Deko-Assets fürs Dashboard (Claude-Design), graceful eingebunden

**Non-Goals (vertagt in eigene Folge-Spec):**
- **C** — Notiz-/Kontext-Injektion in die laufende Pipeline (write-back)
- **D2** — Asset-Injektion in laufende Factory-Tickets (write-back)

Begründung der Trennung: A+B+D1 sind read-only + statisch, niedriges Risiko, eine kohärente Spec. C+D2 sind beide dasselbe heikle "in einen laufenden Claude-Workflow injizieren"-Problem und dürfen das nützliche Dashboard nicht aufhalten.

## Architektur

Fünf Bausteine mit klaren Schnittstellen:

```
ticket.sh phase  ──schreibt──▶  tickets.factory_phase_events  ◀──liest── factory-floor.ts (DAL)
   (pipeline.js +                  (append-only)                            │
    dev-flow-execute)                                                       ▼
                                                          GET /api/factory-floor (JSON)
                                                                            │ 4s poll
                                                                            ▼
                                                          FactoryFloor.svelte (Halle)
                                                                            │
                                                          /factory/*.svg (Assets, graceful)
```

### Visuelles Grundmodell

**Eine verschmolzene Ansicht:** Das Pipeline-Board liefert die Struktur (6 Stationen, links→rechts), die Fabrikhallen-Metapher das Gewand (illustrierte Stationen, Fließband, Tickets als "Werkstücke", blockierte rot an ihrer Station). Kein Modus-Umschalter.

### Seiten-Anatomie (Links→Rechts-Materialfluss)

1. **① Leitstand** (Strip oben, immer sichtbar) — globale Gesundheit: Kill-Switch-Status, Slots (genutzt/cap), Daily-Cap, Durchsatz heute, Ø-Zykluszeit, Watchdog-Stale-Count. Beantwortet "ist die Fabrik gesund / warum bewegt sich nichts".
2. **② Laderampe** (links) — `backlog`-Tickets, die warten, **inkl. Wartegrund** ("Slot voll", "Konflikt mit T…", Guard aktiv, retry-cap). Macht Steckenbleiben *vor* der Halle sichtbar.
3. **③ Die Halle** (Mitte) — 6 Stationen + Fließband; aktive Werkstücke gleiten von Station zu Station; aktuelle Station hervorgehoben, blockierte Werkstücke rot.
4. **④ Versand** (rechts) — zuletzt/heute **shipped** Tickets = "was implementiert wurde".
5. **⑤ Detail** — Klick auf ein Werkstück öffnet ein Slide-in-Seitenpanel: Phasen-Timeline mit Dauern, letzte Breadcrumbs (aus `ticket_comments`), `retry_count`, Blockier-Grund, PR-Link.

## Datenmodell

### Neu: `tickets.factory_phase_events` (append-only)

| Spalte | Typ | Bedeutung |
|--------|-----|-----------|
| `id` | BIGSERIAL PK | |
| `ticket_id` | UUID FK → `tickets.tickets(id)` | |
| `phase` | TEXT CHECK IN (`scout`,`design`,`plan`,`implement`,`verify`,`deploy`) | |
| `state` | TEXT CHECK IN (`entered`,`done`,`blocked`) | |
| `detail` | TEXT NULL | Blockier-Grund / kurze Breadcrumb |
| `driver` | TEXT CHECK IN (`factory`,`devflow`) DEFAULT `factory` | wer hat das Ticket bewegt |
| `at` | TIMESTAMPTZ DEFAULT now() | |

Index auf `(ticket_id, at DESC)` für "letztes Event pro Ticket".

**Ableitungen:**
- **Aktuelle Phase/State** = jüngstes Event eines Tickets.
- **Phasen-Dauer** = `done.at − entered.at` (gleiche phase).
- **Blocking** = jüngstes Event mit `state='blocked'` → `detail` ist der Grund.

Init via `tickets-db.ts` (gleiches Muster wie bestehende Tabellen/Views).

### Wiederverwendet (keine Änderung am Schema)

- **Halle (aktiv):** `v_active_features` × jüngstes `factory_phase_events`.
- **Versand:** `tickets` WHERE `status='done'` ORDER BY `done_at` DESC LIMIT N.
- **Laderampe:** `tickets` WHERE `status='backlog'` AND `pipeline_slot IS NULL`; Wartegrund abgeleitet aus `retry_count` (≥2 → "retry erschöpft"), conflict-check-Detail, Slot-Auslastung vs. Cap.
- **Leitstand:** `factory_control` (kill-switch, daily-cap, dry-run) + `v_factory_metrics` (Durchsatz, Ø-Zyklus) + Slot-Zählung.

## Instrumentierung: `ticket.sh phase`

Neuer Subcommand:
```
ticket.sh phase <ext_id> <phase> <state> [--detail "..."] [--driver factory|devflow]
```
→ ein INSERT in `factory_phase_events` (ext_id → ticket_id-Lookup, dann INSERT). Validiert phase/state gegen die Enums. **Offline-/fehlertolerant:** schlägt der Insert fehl, gibt der Befehl einen Nicht-0-Code zurück, **aber die aufrufende Pipeline behandelt Telemetrie als best-effort und crasht nie deswegen**.

**Aufruf-Stellen:**
- **`scripts/factory/pipeline.js`** — je Phase ein `entered` am Start und `done`/`blocked` am Ende (6 Phasen → ~12 schlanke Calls). In `try/catch` bzw. `|| true`, damit Telemetrie nie den Lauf kippt.
- **`dev-flow-execute`** (bzw. dessen Phasen) — dieselben Calls mit `--driver devflow`. So zeigt das Board auch manuelle Läufe live — entscheidend, solange T000460 den Autopilot-Real-Mode lahmlegt.

## API

### Neu: `GET /api/factory-floor` (admin-only)

Analog zu `factory-metrics.ts` (`isAdmin(session)`-Gate). Konsolidiertes JSON:

```jsonc
{
  "control":     { "killSwitch": false, "slotsUsed": 2, "slotsCap": 3,
                   "dailyCap": 5, "dailyUsed": 1, "dryRun": false, "watchdogStale": 1 },
  "metrics":     { "shippedToday": 3, "avgCycleH": 4.2 },
  "loadingDock": [ { "extId": "T000480", "title": "...", "priority": "mittel", "waitReason": "Slot voll" } ],
  "hall":        [ { "extId": "T000459", "title": "...", "priority": "hoch",
                     "phase": "implement", "phaseState": "entered", "phaseSince": "2026-06-08T...",
                     "retryCount": 0, "blockReason": null, "slot": 1 } ],
  "shipped":     [ { "extId": "T000467", "title": "...", "doneAt": "2026-06-08T...", "prNumber": 1422 } ],
  "fetchedAt":   "2026-06-08T..."
}
```

DAL in neuer Datei **`website/src/lib/factory-floor.ts`** (kleine, fokussierte Query-Helper). `factory-metrics.ts` bleibt unangetastet.

## Frontend

### Neu: `website/src/components/FactoryFloor.svelte`

Svelte 5 (`$state`), eingebunden in `dev-status.astro` (ersetzt/erweitert das bestehende `FactoryDashboard`). 4s-Polling gegen `/api/factory-floor`.

- **Sektionen:** ① Leitstand-Strip · ② Laderampe · ③ Halle (6 Stationen + Fließband) · ④ Versand · ⑤ Slide-in-Detail-Panel.
- **Animation:** Werkstücke per CSS-Transition zwischen Stationen; Versand-Items faden ein; blockierte Werkstücke pulsieren rot. Bei Minuten-Events fühlt sich 4s-Polling sofort an.
- **Graceful Assets:** Stationen/Werkstücke laden `/factory/*.svg`; fehlt ein Asset (`onerror`/CSS-Fallback), erscheint der Inline-/CSS-Platzhalter. Mentolder-Palette (Brass-Gold) aus `global.css`.
- **Detail-Panel:** holt bei Klick Ticket-Detail (Phasen-Timeline aus `factory_phase_events` + Breadcrumbs aus `ticket_comments` + PR-Link). Entweder erweitertes Floor-JSON oder ein leichter `GET /api/factory-floor/[extId]`-Endpoint (Plan entscheidet die schlankere Variante).

## Asset-Manifest (D1)

`website/public/factory/MANIFEST.md` (generiert) für Claude Design:
- **6 Stations-Icons:** `station-scout.svg`, `station-design.svg`, `station-plan.svg`, `station-implement.svg`, `station-verify.svg`, `station-deploy.svg`
- **Fließband-Textur:** `conveyor.svg`
- **Werkstück-States:** `workpiece-idle.svg`, `workpiece-active.svg`, `workpiece-blocked.svg`, `workpiece-done.svg`
- optional **Backdrop:** `hall-backdrop.svg`

Je mit Maßen, transparentem Hintergrund, Palette (mentolder Brass-Gold + Ink-Töne). **Stabile Pfade → Swap ohne Code.** Deploy zieht `public/` automatisch mit.

## Fehlerbehandlung & Edge-Cases

- **Telemetrie-Insert fehlschlägt** → Pipeline/dev-flow läuft weiter (nur Log), best-effort.
- **Ticket ohne phase_events** (Alt-Tickets, vor Instrumentierung) → Fallback auf `status` (grobe Phase, keine Dauern).
- **Leere Halle / leerer Backlog** → freundlicher Leerzustand ("Fabrik im Leerlauf").
- **API-Fehler im Frontend** → letzter Stand bleibt sichtbar + dezenter "veraltet"-Hinweis, kein Komplett-Crash.

## Tests

- **Vitest + pg-mem** für `factory-floor.ts`: Phasen-Ableitung (latest event), Phasen-Dauer, Wartegrund-Logik, Guards-Mapping. Muster wie `website/src/lib/factory-metrics.test.ts`.
- **BATS** für `ticket.sh phase`: Insert-Pfad, phase/state-Enum-Validierung, ext_id-Lookup, offline-safe (validate-before-DB wie bei den FA-SF-Tests). In `task test:factory` einhängen.
- **Playwright-Smoke** (Projekt `website`): `/dev-status` rendert die Halle mit Fixture-Daten; Klick auf ein Werkstück öffnet das Detail-Panel.

## Offene Punkte für die Plan-Phase

- Detail-Daten: erweitertes Floor-JSON vs. separater `[extId]`-Endpoint (schlankere Variante wählen).
- Genaue Aufruf-Stellen in `pipeline.js` (Phasen-Grenzen mappen) und in `dev-flow-execute`.
- Migrations-/Init-Pfad für `factory_phase_events` (idempotent über `tickets-db.ts`).

## Folge-Spec (vertagt)

C (Notiz-Injektion) + D2 (Asset-Injektion) als **Drop-Ordner pro Ticket** (`assets-inbox/<ticket-id>/`) + Notiz-Tabelle, eingesammelt an Phasen-Grenzen durch den Impl-Agent (kein Mid-Run-Eingriff). Eigene Spec, eigener Plan.
