# Spec: Factory-Flow-Visualisierung polieren (factory-flow-polish)

**Datum:** 2026-06-12
**Branch:** feature/factory-flow-polish
**Scope:** Website-Visualisierung der Software Factory (`/dev-status` Factory-Floor + `/admin/planungsbuero`) — UX-Polish und Sichtbarmachen vorhandener, aber ungenutzter Factory-Telemetrie. **Kein** neues Factory-Backend-Verhalten (dispatcher.js/pipeline.js bleiben unangetastet, außer es fehlt ein reines Lese-API).

## Ausgangslage (Exploration 2026-06-12)

- **Factory-Backend:** `scripts/factory/` (dispatcher.js, pipeline.js, wakeup.sh, slots.sh, queue.sh …). Pipeline-Phasen Scout→…→Deploy schreiben `factory_phase_events` (entered/done/blocked). Ticket-Zustandsmaschine: triage → planning → plan_staged (Kommissionierung) → backlog (Laderampe) → in_progress → … → done/archived.
- **Website:** `website/src/pages/dev-status.astro` → `DevStatusTabs.svelte` (5 Tabs) mit Factory-Komponenten unter `website/src/components/factory/` (ConveyorBelt, StationColumn, WorkpieceCard, DetailPanel, KPI-Karten, Heatmap …). Floor-Tab nutzt SSE (`api/factory-floor/stream.ts`, 5s-Poll + 30s-Heartbeat). Planungsbüro embedded als Tab + `admin/planungsbuero.astro`; APIs unter `api/planning-office/`.
- **Befund:** Die Factory schreibt deutlich mehr Telemetrie als die UI zeigt; mehrere UX-Inkonsistenzen zwischen den Tabs.

## Probleme (aus der Code-Exploration, priorisiert)

### P1 — Daten-Sichtbarkeit (vorhandene Telemetrie ungenutzt)
1. **Pipeline-Phasen-Fortschritt pro Workpiece fehlt.** `factory_phase_events` (entered/done/blocked je Phase) existiert, aber WorkpieceCard/DetailPanel zeigen den Scout→Deploy-Fortschritt nicht als Phasen-Leiste/Stepper.
2. **Readiness-JSONB (DoR) nicht im Floor sichtbar** — nur im Planungsbüro editierbar; auf der Karte fehlt ein DoR-Indikator.
3. **Attention-Mode / blocked-Phasen** werden nicht prominent hervorgehoben (kein „braucht Aufmerksamkeit"-Sammelbereich).
4. **Provider-Cooldown-Telemetrie** (DeepSeek/Anthropic-Routing, 402-Fälle) nirgends sichtbar — genau die Klasse Ausfall, die zuletzt mehrfach Debugging kostete.
5. **Status-Lücken:** mehrere Ticket-Status erscheinen in keiner Spalte/keinem Tab (Inventur in der Implementierung: jeden Status einer Station oder einem expliziten Sammel-Bucket zuordnen; nichts darf unsichtbar sein).

### P2 — Konsistenz & Live-Verhalten
6. **Planungsbüro hat kein Auto-Refresh** (Floor: SSE; Planning: statisch nach Load). Promote/Enqueue in einem Tab aktualisiert den anderen nicht (Event-Sync zwischen Tabs fehlt).
7. **Error-/Loading-States inkonsistent** über die Tabs (teils gar keine Fehler-UI, teils stumm fehlschlagende Fetches).
8. **QA-Tab leer/Platzhalter** — entweder mit echten Daten füllen (CI-Review-Ergebnisse aus `scripts/factory/ci-review.mjs`-Artefakten, sofern in DB) oder den Tab bis dahin ausblenden.

### P3 — Code-/UI-Hygiene
9. `brand`-Prop in DevStatusTabs ist dead code.
10. Magic numbers (Poll-Intervalle, Timeouts) verstreut statt zentral in `factory-tokens.css`/Konstanten.
11. Touch-Targets/Mobile: MobileTabBar vorhanden, aber einzelne Buttons unter 44px; Drag-Drop-Fallback prüfen.

## Entscheidungen (Defaults, autonom getroffen)

- **D1 — Phasen-Stepper als Kernstück:** WorkpieceCard bekommt eine kompakte Phasen-Leiste (Punkte/Segmente je Pipeline-Phase: pending/active/done/blocked), DetailPanel eine ausführliche Timeline aus `factory_phase_events` (mit Dauer je Phase). Datenquelle: bestehendes Floor-API erweitern (reines Lese-Feld), kein neues Schema.
- **D2 — Ein gemeinsamer Refresh-Mechanismus:** Der bestehende SSE-Stream wird zur einzigen Live-Quelle für alle Tabs (DevStatusTabs hält die EventSource, Tabs subscriben). Planungsbüro-Mutationen triggern optimistisches Update + Streamen ohnehin binnen 5s nach. Kein zweiter Polling-Pfad.
- **D3 — „Attention"-Strip:** Oben im Floor ein schmaler Streifen, der blocked-Phasen, stuck Workpieces und Provider-Cooldown/402 aggregiert anzeigt (nur wenn nicht leer). Nutzt vorhandene Daten; Cooldown-Status via kleinem Lese-API auf vorhandene Factory-State-Tabelle, falls vorhanden — sonst Scope auf blocked/stuck reduzieren (Plan prüft Datenlage).
- **D4 — QA-Tab:** Wenn keine in der DB liegenden Review-Daten existieren, wird der Tab hinter ein Feature-Flag gelegt/ausgeblendet statt halb leer zu rendern. Kein neuer Daten-Ingest in diesem Plan.
- **D5 — Status-Vollabdeckung als Test:** Ein Unit-/Vitest-Test, der das Status-Enum gegen die Stations-/Bucket-Zuordnung der UI prüft (neuer Status ⇒ Test rot statt unsichtbares Ticket).
- **D7 — Git-CI-Checks in der Pipeline sichtbar (User-Anforderung):** Sobald ein Workpiece einen PR hat, erscheinen die GitHub-CI-Checks als eigener Abschnitt im Phasen-Stepper/DetailPanel (je Check: pending/success/failure, verlinkt auf den GitHub-Run). Datenquelle: serverseitiges Lese-API (`api/factory-floor/...`), das die Check-Runs des PR-Head-SHA über die GitHub-API holt (Token serverseitig, kurzes Caching ~30s, nie im Client); falls der Factory-CI-wait (`scripts/factory/`) Check-Ergebnisse bereits in die DB schreibt, diese bevorzugen — der Plan prüft die Datenlage. Auf der WorkpieceCard ein kompaktes CI-Badge (grün/gelb/rot), Details im DetailPanel.
- **D6 — Hygiene en passant:** brand-dead-code raus, Intervall-Konstanten zentralisieren, Touch-Target-Fixes — kleine, klar abgegrenzte Tasks am Ende des Plans.
- **Nicht im Scope:** neue Factory-Pipeline-Features, Backend-Verhaltensänderungen, neue DB-Schemata (höchstens Views), Tracking-Pipeline-Revival, Korczewski-spezifisches Layout (Factory-UI ist brand-neutral).

## Akzeptanzkriterien

1. Jedes Ticket im Floor zeigt seinen Pipeline-Phasen-Fortschritt (Karte kompakt, Detail mit Timeline + Dauern).
2. Kein Ticket-Status ist in der UI unsichtbar; ein Test erzwingt die Vollabdeckung.
3. Planungsbüro aktualisiert sich live (gleicher Stream wie Floor); Promote/Enqueue ist ohne manuelles Reload in beiden Tabs sichtbar.
4. Blocked/stuck/Cooldown-Zustände sind auf einen Blick erkennbar (Attention-Strip), verschwinden, wenn leer.
5. Alle Tabs haben konsistente Loading-/Error-States (gemeinsame Komponente).
6. QA-Tab entweder mit echten Daten oder ausgeblendet — kein leerer Platzhalter.
7. Workpieces mit PR zeigen den Live-Status der GitHub-CI-Checks (Badge auf der Karte, Check-Liste mit Links im DetailPanel).
8. Bestehende E2E-Specs (dev-status, planungsbüro) bleiben grün; neue Vitest-Tests für Status-Abdeckung und Phasen-Stepper-Mapping.

## Test-Strategie

- Vitest (website): Status-Vollabdeckungs-Test, Phasen-Event→Stepper-Mapping, Stream-Subscription der Tabs (pg-mem/Mocks wie bestehende API-Tests, vgl. `api/factory-floor/inject.test.ts`).
- Playwright (PR-Tier, k3d-tauglich, tag-gefiltert): Attention-Strip erscheint bei blocked-Fixture; Planungsbüro-Live-Update.
- Vor PR: `task test:all` + `task freshness:check` lokal (CI-Reproduktion).
