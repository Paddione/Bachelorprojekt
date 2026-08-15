# Design: SDLC-Leitstand — neues Interaktionsmodell, API-Katalog & Leitstand-Design-System

**Datum:** 2026-08-15 · **Status:** approved (Brainstorming via Lavish-Board `.lavish/leitstand-design-richtung.html` + Chat-Approval)
**Pfad:** Feature (dev-flow-plan, architectural) · **Epic:** Parent-Ticket + Etappen E1–E5

## Entscheidungsprotokoll (Brainstorming-Ergebnis)

| Frage | Entscheidung |
|---|---|
| Scope | Alle vier Teilprojekte: Cockpit vervollständigen · API-/Connector-Katalog · Design-System-Ausbau · UI neu denken |
| Neu-Tiefe | **Interaktionsmodell** — Datenschicht (Adapter, ~135 Endpunkte, LISTEN/NOTIFY-SSE), Auth und Dev-Host-Isolation bleiben unangetastet |
| Leitmodell | **Leitstand-first** — beobachten + gezielt eingreifen; Glanceability vor Dichte |
| Geltung | **Eine Fläche, alles integriert** — Satellitenseiten werden etappenweise absorbiert und redirecten |
| API-Katalog | **Generiert + CI-Drift-Gate** (Muster `test-inventory.json`), kuratierte Felder als Overlay-Datei |
| Claude-Design-Projekt | **Neues Projekt** „SDLC Leitstand Design System" (via DesignSync `create_project`); Alt-Projekte bleiben als Archiv |
| Stil | **B — Control Room**: signal-dominant, dark-first, Mono-Ziffern, kantige Panels |
| Palette | **Eigenständiges Token-Set** — bewusster Stilbruch zur Kore-Marke, kein Brass |
| Theme | **Dark primär + Print-Light** nur als Report-/Export-Stylesheet (revidiert von Dark-only) |
| Dichte | **Kompakt** |
| Help-Prinzip | **Jede Komponente hat einen eindeutigen, nicht-redundanten Zweck**, erklärt über einen globalen **Help-Overlay-Layer** |
| IA | **IA-2 Hybrid**: Stationen-Achse als permanentes Rückgrat + Deck-Umschalter nur für die Seitenmodul-Leiste |

## Prior-Art-Bindung (Schritt 0.7)

`openspec/specs/sdlc-cockpit.md` ist der SSOT-Spec des Cockpits. Dieses Design **ersetzt bewusst** dessen Layout-Entscheidungen (Command Bar + Overview/Fokus-Modus) durch das Leitstand-Modell — als `MODIFIED`-Delta, nicht durch Danebenschreiben. **Unangetastet bleiben** die dort entschiedenen Nicht-Präsentations-Requirements: Adapter-Muster (kein Panel ruft `fetch()` direkt; Host-Auflösung pro Endpoint), Schreibaktionen nur über Website-Admin-API (`getSession`+`isAdmin`), kein Browser-seitiges Daemon-Write-Token, destruktive lokale Aktionen CLI-only, LISTEN/NOTIFY-SSE für PG-Quellen + `refreshMs`-Poll nur für Nicht-PG-Quellen, Polling pausiert bei `document.hidden`, D12/D13 (`fetchedAt` + explizites `error`-Feld), returnTo-Pflicht der Auth-Gates, Pointer-Events statt HTML5-DnD, Action-Slot-Zustände + gradierte Konfirmation. Weiterhin verworfen bleiben: Kanban-Floor-View, TicketDrawer, Rail+Workspace, separate Observability-/Budget-Seiten, jede öffentlich erreichbare SDLC-Instanz (`sdlc-isolation.md`).

## S1 — Zielbild

`/sdlc/cockpit` wird zum **Leitstand**: eine Fläche, die den gesamten Zustand der Software-Factory-Maschinerie permanent sichtbar macht und gezielte Eingriffe (enqueue, hold/release, triage, kill-switch, force-tick, inject) an Ort und Stelle anbietet. Build-Target-Isolation (`BUILD_TARGET=prod|sdlc`, ADR-006) bleibt; der Leitstand existiert ausschließlich im SDLC-Build auf dem Dev-Host.

## S2 — Informationsarchitektur: 5 Zonen, je genau ein Zweck

```
┌─────────────────────────────────────────────────────────┐
│ STATUSBAND   tick · queue · fleet · kill · budget · [?] │  Gesamtzustand
├─────────────────────────────────────────────────────────┤
│ ATTENTION    blocked · stuck · cooldowns (übergreifend) │  Handlungsbedarf
├─────────────────────────────────────────────────────────┤
│ STATIONEN-ACHSE  Scout→Design→Plan→Impl→Verify→Deploy   │  Wertstrom (Herz)
├─────────────────────────────────────────────────────────┤
│ KONTEXTZONE  nichts→KPIs · Station→Liste · Ticket→Detail│  Tiefe/Aktion
├─────────────────────────────────────────────────────────┤
│ SEITENMODULE mit Deck-Umschalter:                       │  Nebendomänen
│  [Qualität] [Plattform] [KI] [Wissen]                   │
└─────────────────────────────────────────────────────────┘
```

- **Statusband** (permanent): Tick-Status/Countdown, Queue-Tiefen, Fleet-Pods, Kill-Switch, Budget, Help-Toggle `[?]`. Ersetzt die Command Bar.
- **Attention-Strip** (permanent, deck-übergreifend): blocked/stuck/cooldowns aus `buildAttention`; leer = eine ruhige Bestätigungszeile, nie versteckt.
- **Stationen-Achse** (permanent): die 6 Pipeline-Phasen als Wertstrom mit Ticket-Chips; integriert Staged/Hall/Shipped-Zustände der bisherigen Floor-Lanes. Ersetzt FactoryFloor als Navigationszentrum, dessen Komponenten werden wiederverwendet.
- **Kontextzone** (selektionsgetrieben): keine Selektion → KPI-Raster (inkl. DORA aus `delivery-metrics.ts`); Station selektiert → Ticket-Liste der Phase; Ticket selektiert → Detail mit Aktionen (bestehende DetailPanel-/ActionBar-Komponenten). URL-getrieben (Deep-Links bleiben möglich).
- **Seitenmodul-Leiste** (Deck-Umschalter, nur diese Zone schaltet um):
  - **Qualität**: Testläufe, QA-Queue, CI-/Flake-Status
  - **Plattform**: Fleet-/Pod-Status, Deployments, Ops (Backups, Certs, Logs)
  - **KI**: LLM-Proxy-Backends, Modell-Slots, Routing, Dispatch-Log
  - **Wissen**: API-/Connector-Katalog, OpenSpec-Suche, Prompt-Bibliothek

## S3 — Help-Overlay-Layer & Zweck-Eindeutigkeit

Jede Leitstand-Komponente deklariert ein `purpose`-Metadatum: `{ zweck: string (1 Satz), datenquelle: string, aktionen: string[] }`. Die Deklarationen leben in einer zentralen, typisierten Registry-Datei (`components/website/src/lib/sdlc/leitstand-purpose-registry.ts`), damit Guard-Tests sie laden können, statt Svelte-Interna zu greppen. Der `[?]`-Toggle legt einen Overlay-Layer über die Fläche und rendert die Erklärungen in situ (Position der jeweiligen Komponente).

**Abnahmekriterium, kein Vorsatz:** Ein BATS-Guard failt, wenn (a) eine registrierte Leitstand-Komponente kein `purpose` trägt oder (b) zwei Komponenten denselben `zweck`-Text tragen. Positiv-Anker-Pflicht (T002356-M1) gilt: der Guard prüft zuerst, dass die Registry nicht leer ist.

## S4 — Design-System „Leitstand DS"

- **Token-Set** (eigenständig, Control Room): dunkle, kühle Grundtöne (nahe `#0a0c10`–`#12161d`), Linienfarben, Text-Stufen; semantischer Kern ist die **Signal-Ampel** (grün/amber/rot + info); Mono-Typo für Ziffern/IDs; kantige Radien (2–4 px); kompakte Abstände. Glow/Puls ausschließlich für „läuft gerade"-Zustände (Disziplin-Regel gegen Christbaum-Effekt).
- **Auslieferung:** CSS-Custom-Properties in `components/website/src/styles/sdlc-leitstand.css`, nur vom SDLC-Build geladen. **Print-Light** als Report-Stylesheet (`@media print` + explizite `.report`-Ansicht), kein zweites interaktives Theme.
- **Claude-Design-Workflow:** neues Projekt „SDLC Leitstand Design System"; Inhalte: Token-Karten, Komponenten-Previews (Statusband, Station, Ticket-Chip, KPI-Kachel, Attention, Help-Overlay), Icon-Satz (bestehende `components/website/public/cockpit/icons/` werden übernommen/erneuert). Sync über den etablierten design-sync-Kanal; Qualitäts-Gate für SVGs gilt (currentColor, keine Stray-Hex, kein Root-width/height, T000756).
- `design-system.astro` wird zum Showcase des Leitstand DS umgebaut (bestehende Seite, neuer Inhalt).

## S5 — API-/Connector-Katalog

- **Scanner** `scripts/sdlc/api-inventory.mjs`: wertet `components/website/src/pages/sdlc/api/**` aus (Dateisystem-Routen, exportierte HTTP-Methoden, Backend-Imports → Klassifikation Postgres/K8s-REST/kubectl/GitHub/Prometheus/FS) und ergänzt die MCP-Server aus `docs/agent-guide/registry/mcp.yaml` sowie die 7 factory-mcp-Tools. Output: `components/website/src/data/api-inventory.json` (deterministisch sortiert).
- **Kuratierte Felder** (Beschreibung, Tier, Deprecation-Hinweis) in `docs/agent-guide/registry/api-overlay.yaml`; der Scanner mergt sie. Fehlende Kuration ist erlaubt (Feld leer), falsche Referenzen (Overlay-Eintrag ohne gescannten Endpunkt) sind ein Fehler.
- **CI-Drift-Gate** nach dem test-inventory-Muster: Task regeneriert, CI vergleicht mit dem committeten Stand, Abweichung = rot. BATS-Test verifiziert Output-Semantik (Exit-Code + Kernfelder, keine Formatanker — T002716).
- **UI:** Katalog-Modul im Wissen-Deck — Suche, Gruppierung nach Pfadpräfix, Methoden-Badges, Backend-Kennzeichnung, Live-Health-Punkt für die vier HTTP-MCPs (:18080/:13001/:13003/:13005 via bestehende Health-Endpunkte).

## S6 — Lücken-Schließung im neuen Modell

| Lücke (Ist) | Lösung (Soll) |
|---|---|
| `observability.astro` ist statischer Platzhalter | Seite stirbt → Plattform-Deck speist sich aus den echten Quellen (`lib/sdlc/k8s.ts`, `factory-observability.ts`/Prometheus) |
| DORA/`DeliveryHistory.svelte` verwaist | `delivery-metrics.ts` → KPI-Modul der Kontextzone (Leerlauf-Zustand) |
| `factory-floor/stream.ts` pollt | Umstellung auf den bestehenden `cockpit-listen-hub` (LISTEN/NOTIFY) |
| Status-Maschine 3× hart kodiert | **außerhalb des Scopes** (Backend) — als eigenes Folge-Ticket erfassen |

## S7 — Fehlerbehandlung & Tests

- Bestehende Konventionen unverändert: `fetchedAt` + explizites `error`-Feld (D12/D13); fail-soft pro Sektion (fehlende Datenquelle blendet nur ihr Modul aus, Muster projekttickets-cockpit).
- Tests: BATS-Guards (api-inventory-Drift, purpose-Eindeutigkeit, Build-Target-Isolation der neuen Routen), vitest für DAL-Änderungen, `scripts/sdlc-cockpit-smoke.mjs` um Leitstand-Zonen erweitert. Output- statt Source-Verifikation (T002448-M4), Semantik statt Darstellung (T002716). E2E gegen den Dev-Stack später via dev-flow-e2e.

## S8 — Etappen (Epic-Parent + sequenzielle Changes)

| Etappe | Inhalt | Abhängigkeit |
|---|---|---|
| **E1 · Leitstand-DS** | Token-Set + `sdlc-leitstand.css`, Claude-Design-Projekt, Previews, design-sync, `design-system.astro`-Umbau | — |
| **E2 · API-Inventar + Drift-Gate** | Scanner, `api-inventory.json`, Overlay-Registry, BATS, CI | — (disjunkt zu E1) |
| **E3 · Leitstand-Shell** | Die 5 Zonen, Umbau `cockpit.astro`, Wiederverwendung Floor-/Detail-/Control-Komponenten | E1 |
| **E4 · Decks + Lücken** | 4 Decks, Observability live, DORA-KPIs, LISTEN-Umstellung, Katalog-UI | E2, E3 |
| **E5 · Help-Overlay + Absorption** | purpose-Registry + Overlay, Satelliten-Redirects, Print-Light, Politur | E3 |

**Dieser Plan-Lauf liefert:** dieses Design-Doc, das Epic-Parent-Ticket und den ersten OpenSpec-Change **E1+E2** (disjunkte Partials, parallelisierbar). E3–E5 folgen als eigene dev-flow-plan-Läufe auf dem Fundament.

## Offene Folge-Tickets (außerhalb dieses Epics)

- Status-Maschine-SSOT: 11 Status-Werte sind in `scripts/lib/ticket-help.sh`, `scripts/ticket-mcp/go/internal/tools/lifecycle.go` und `ticket.sh` dupliziert — Konsolidierung als eigenes Backend-Ticket.
- Aufräumen der ~15 verwaisten „Design System"-Projekte auf claude.ai/design (manuell durch den User; Löschung ist dort nicht Agent-Aufgabe).
