---
ticket_id: T000942
title: Final-Grilling-Session im Mediaviewer Sidekick Widget
plan_ref: docs/superpowers/specs/2026-06-17-final-grilling-mediaviewer-design.md
status: active
date: 2026-06-17
domains: [website, infra, ops, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Final-Grilling-Session im Mediaviewer Sidekick Widget — Implementation Plan

## File Structure

```
website/src/lib/tickets/grilling.ts              (CHANGE)  +final-grilling-v1 Questionnaire
website/src/lib/tickets/final-grilling.ts        (NEW)     buildGrillingSessionData()
website/src/lib/mediaviewer-bridge.ts            (CHANGE)  +setMode, +setGrillingData, +grillingAnswer/Dismiss/Complete
website/src/components/MediaviewerPanel.svelte   (CHANGE)  +mode prop, +grillingData prop
website/src/components/mediaviewer/GrillingSessionHost.svelte  (NEW)  Host wrapper: fetch + persist
website/src/components/PortalSidekick.svelte     (CHANGE)  +ticketId state, +grilling view routing
website/src/components/assistant/SidekickHome.svelte (CHANGE)  +"Final Grilling" tile
mediaviewer-widget/src/embed/bridge.ts           (CHANGE)  +setMode, +setGrillingData, +grillingAnswer/Dismiss/Complete
mediaviewer-widget/src/embed/EmbedApp.tsx        (CHANGE)  +mode/grillingData state, conditional render
mediaviewer-widget/src/MediaviewerWidget.tsx     (CHANGE)  +mode prop, GrillingSessionView branch
mediaviewer-widget/src/components/GrillingSessionView.tsx  (NEW)  Grilling UI component
mediaviewer-widget/src/components/GrillingSessionView.test.tsx (NEW)  Grilling tests
mediaviewer-widget/src/styles/grilling.css       (NEW)     Grilling styling
```

## S1-Budgets (Dateien mit Limit-Risiko)

| Datei | Ist | Limit | Budget | Maßnahme |
|-------|-----|-------|--------|----------|
| `PortalSidekick.svelte` | 411 | 500 (.svelte) | 89 | Nur Prop-Weitergabe + 1 Event-Handler. Kein neues Markup. |
| `SidekickHome.svelte` | 346 | 500 (.svelte) | 154 | Ein neuer Tile-Button (~15 Zeilen). Unkritisch. |
| Alle anderen Dateien | — | — | >200 | Viel Reserve. |

Neue Dateien liegen alle unter ~40% des jeweiligen Extensions-Limits (max 250 Zeilen).

## Tasks

### Task 1 — Questionnaire registrieren & Bridge erweitern (Host)

**Ziel:** `final-grilling-v1`-Fragebogen in `grilling.ts` registrieren; neue postMessage-Typen in `mediaviewer-bridge.ts`.

**Änderungen:**
- `website/src/lib/tickets/grilling.ts`: Neuen Eintrag `final-grilling-v1` in `QUESTIONNAIRES` mit 6 Sektionen und 23 Fragen (Anforderungsklärung, Architektur, Risiken, Testing, Deployment, Abschluss).
- `website/src/lib/mediaviewer-bridge.ts`: Neue Inbound-Typen `setMode`, `setGrillingData`; neue Outbound-Typen `grillingAnswer`, `grillingDismiss`, `grillingComplete`. Parser `parseOutbound` erweitern.

**Tests (expected to fail before implementation):**
- `npm --prefix website test -- --run grilling.test.ts` → expected FAIL (Questionnaire noch nicht registriert)
- `npm --prefix website test -- --run mediaviewer-bridge.test.ts` → expected FAIL (Parser kennt neue Typen nicht)
- Nach Implementation: beide Tests PASS.

**Target Files:**
- `website/src/lib/tickets/grilling.ts`
- `website/src/lib/mediaviewer-bridge.ts`
- `website/src/lib/tickets/grilling.test.ts`
- `website/src/lib/mediaviewer-bridge.test.ts`

---

### Task 2 — Widget: Bridge & Mode-Routing erweitern

**Ziel:** Mediaviewer-Widget empfängt `setMode`-Messages und routet zwischen `video`/`grilling`.

**Änderungen:**
- `mediaviewer-widget/src/embed/bridge.ts`: Neue Inbound-Typen `setMode`, `setGrillingData`; neue Outbound-Typen `grillingAnswer`, `grillingDismiss`, `grillingComplete`. `createInboundHandler` erweitern.
- `mediaviewer-widget/src/embed/EmbedApp.tsx`: `mode`-State, `grillingData`-State. Conditional Rendering: bei `grilling` → `GrillingSessionView`.
- `mediaviewer-widget/src/MediaviewerWidget.tsx`: Neuen `mode`- und `grillingData`-Prop. Bei `mode='grilling'`: `GrillingSessionView` rendern.

**Tests:**
- `mediaviewer-widget/src/embed/bridge.test.ts`: Tests für neue Message-Typen.
- `mediaviewer-widget/src/MediaviewerWidget.test.tsx`: Test für Mode-Routing.

**Target Files:**
- `mediaviewer-widget/src/embed/bridge.ts`
- `mediaviewer-widget/src/embed/EmbedApp.tsx`
- `mediaviewer-widget/src/MediaviewerWidget.tsx`
- `mediaviewer-widget/src/embed/bridge.test.ts`
- `mediaviewer-widget/src/MediaviewerWidget.test.tsx`

---

### Task 3 — Widget: GrillingSessionView-Komponente bauen

**Ziel:** Neue React-Komponente, die den Grilling-Fragebogen rendert mit Fragenstepper, Antwortfeldern und Vorschlagskarten.

**Änderungen:**
- `mediaviewer-widget/src/components/GrillingSessionView.tsx` (NEU): Props: `data: GrillingSessionData`, `onAnswer`, `onDismiss`, `onComplete`. Rendert: Header, Frage-Text + Hinweis, Textarea, Navigation, Vorschlagskarten.
- `mediaviewer-widget/src/components/GrillingSessionView.test.tsx` (NEU): Tests für Rendering, Navigation, Answer-Events.
- `mediaviewer-widget/src/styles/grilling.css` (NEU): Styling mit CSS custom properties.

**Acceptance:**
- Alle 23 Fragen mit Navigation darstellbar.
- Antwort-Input sendet `grillingAnswer`-Events.
- "Abschließen" sendet `grillingComplete`-Event.

**Target Files:**
- `mediaviewer-widget/src/components/GrillingSessionView.tsx` (NEU)
- `mediaviewer-widget/src/components/GrillingSessionView.test.tsx` (NEU)
- `mediaviewer-widget/src/styles/grilling.css` (NEU)

---

### Task 4 — Host: MediaviewerPanel Mode-fähig machen

**Ziel:** `MediaviewerPanel.svelte` erhält `mode`-Prop und sendet `setMode` + `setGrillingData` an den Widget.

**Änderungen:**
- `website/src/components/MediaviewerPanel.svelte`: Prop `mode`, `grillingData`. Bei Change: `setMode`/`setGrillingData` posten. Outbound-Handler erweitern.
- `website/src/components/MediaviewerPanel.test.ts`: Tests für Mode-Wechsel, GrillingData-Posting.

**Target Files:**
- `website/src/components/MediaviewerPanel.svelte`
- `website/src/components/MediaviewerPanel.test.ts`

---

### Task 5 — Host: GrillingSessionHost-Wrapper + Implizite Generierung

**Ziel:** Host-seitiger Wrapper lädt Ticket-Daten, generiert implizite Fragen-Hinweise und managed Persistenz.

**Änderungen:**
- `website/src/lib/tickets/final-grilling.ts` (NEU): `buildGrillingSessionData(ticket)` generiert kontextspezifische `hints` und `suggestions`.
- `website/src/components/mediaviewer/GrillingSessionHost.svelte` (NEU): Lädt Ticket, ruft `buildGrillingSessionData()`, managed Persistenz via PATCH.

**Acceptance:**
- Fragen mit Ticket-spezifischen Hinweisen angereichert.
- Antworten akkumulativ per PATCH persistiert.
- Fail-soft bei Lade-/Patch-Fehlern.

**Target Files:**
- `website/src/lib/tickets/final-grilling.ts` (NEU)
- `website/src/components/mediaviewer/GrillingSessionHost.svelte` (NEU)

---

### Task 6 — Host: PortalSidekick + SidekickHome integrieren

**Ziel:** `SidekickHome` zeigt "Final Grilling" Tile; `PortalSidekick` leitet an `GrillingSessionHost`.

**Änderungen:**
- `website/src/components/assistant/SidekickHome.svelte`: Neuer Tile "Final Grilling" (admin-only).
- `website/src/components/PortalSidekick.svelte`: `currentTicketId`-State, neue View `'grilling'`, `<GrillingSessionHost>` Rendering.

**Budget:** `PortalSidekick.svelte` max +15 Zeilen (Budget 89).

**Target Files:**
- `website/src/components/PortalSidekick.svelte`
- `website/src/components/assistant/SidekickHome.svelte`

---

### Task 7 — Build & beide Brands verifizieren

**Ziel:** Widget-Image bauen; beide Brands testen.

**Schritte:**
1. Widget bauen: `docker build -t ghcr.io/paddione/mediaviewer-widget:latest ./mediaviewer-widget`
2. Keine neuen Kustomize-Manifeste — bestehende Infrastruktur unverändert.
3. Beide Brands testen: gleiche postMessage-Infrastruktur unter `mediaviewer.mentolder.de` / `mediaviewer.korczewski.de`.

**Target Files:**
- `mediaviewer-widget/Dockerfile` (review, keine Änderung erwartet)

---

### Task 8 — Verifikation & CI-Gates

**Ziel:** Alle Tests grün, Freshness aktuell, keine Quality-Gate-Violations.

**Schritte:**
```bash
task test:changed                    # Vitest + BATS + quality:check
npm --prefix mediaviewer-widget test # Widget-Tests
task freshness:regenerate            # test-inventory, repo-index, quality-index
task freshness:check                 # S1-Ratchet, S2-Import-Zyklen, S3-Hostname-Scan, S4-Orphan-Check
task workspace:validate ENV=mentolder && task workspace:validate ENV=korczewski
bash scripts/openspec.sh validate    # OpenSpec validation
task test:inventory                  # Regenerate + commit test inventory
```

**Acceptance:**
- Alle Kommandos exit 0.
- Keine Baseline-Wachstum, keine neuen Hostname-Literale.
- Keine neuen Import-Zyklen in `website` oder `mediaviewer-widget`.
