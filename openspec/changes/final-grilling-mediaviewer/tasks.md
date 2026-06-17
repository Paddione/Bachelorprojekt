# Tasks: final-grilling-mediaviewer

## 1. Questionnaire + Bridge (Host)

- [ ] `final-grilling-v1` in `QUESTIONNAIRES` registrieren (6 Sektionen, 23 Fragen)
- [ ] Neue postMessage-Typen in `mediaviewer-bridge.ts` (setMode, setGrillingData, grillingAnswer, grillingDismiss, grillingComplete)
- [ ] Tests für Questionnaire-Lookup + neue Message-Typen

## 2. Widget Bridge + Mode-Routing

- [ ] `embed/bridge.ts`: Neue Inbound/Outbound-Typen, Handler erweitern
- [ ] `EmbedApp.tsx`: mode-State, Conditional Rendering
- [ ] `MediaviewerWidget.tsx`: mode-Prop, Grilling-Zweig
- [ ] Tests für Mode-Routing

## 3. Widget: GrillingSessionView

- [ ] `GrillingSessionView.tsx` (NEU): Fragenstepper, Antwortfelder, Vorschlagskarten
- [ ] `grilling.css` (NEU): Styling mit mv-design-tokens
- [ ] Tests: Rendering, Navigation, Events

## 4. Host: MediaviewerPanel Mode-fähig

- [ ] `MediaviewerPanel.svelte`: mode-Prop, setMode/setGrillingData-Posting
- [ ] Outbound-Handler für grillingAnswer/grillingDismiss/grillingComplete
- [ ] Tests: Mode-Wechsel

## 5. Host: GrillingSessionHost + Implizite Generierung

- [ ] `final-grilling.ts` (NEU): `buildGrillingSessionData()` — Hinweise + Vorschläge aus Ticket-Kontext
- [ ] `GrillingSessionHost.svelte` (NEU): Lädt Ticket, managed Persistenz (PATCH)
- [ ] Fail-soft: Keine Vorschläge = keine Karten; Patch-Fehler = kein Abbruch

## 6. Host: PortalSidekick + SidekickHome Integration

- [ ] `SidekickHome.svelte`: Neuer Tile "Final Grilling" (admin, bei Ticket-Kontext)
- [ ] `PortalSidekick.svelte`: Ticket-Kontext-State, GrillingSessionHost-Routing
- [ ] Max. +15 Zeilen in PortalSidekick (Budget 89)

## 7. Build & beide Brands

- [ ] Widget-Image bauen (keine Dockerfile-Änderung erwartet)
- [ ] Keine neuen Kustomize-Manifeste nötig
- [ ] Beide Brands testen (gleiche postMessage-Infrastruktur)

## 8. Verifikation & CI-Gates

- [ ] `task test:changed` grün
- [ ] Widget-Tests grün
- [ ] `task freshness:regenerate` + `task freshness:check` grün
- [ ] `task workspace:validate` für beide Brands
- [ ] Test-Inventar aktualisieren + committen
