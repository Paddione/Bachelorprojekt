# K6: Ticket- und Factory-Datenmodell

> Komponente des Brain-Architektur-Epics T002430.
> Stand: August 2026.

## Diagramm

```
┌───────────────────────────────────┐        ┌───────────────────────────────────┐
│   MENTOLDER-DB (workspace ns)      │        │  KORCZEWSKI-DB (workspace-korczewski)│
│   shared-db Pod (PostgreSQL 16)    │        │  shared-db Pod (PostgreSQL 16)      │
│  ┌───────────────────────────────┐ │        │ ┌───────────────────────────────┐  │
│  │ tickets.tickets       (1927)  │ │        │ │ tickets.tickets      (separat) │  │
│  │ tickets.ticket_links   (501)  │ │        │ │ tickets.ticket_links (separat)│  │
│  │ tickets.ticket_plans   (293)  │ │        │ │ tickets.ticket_plans (separat)│  │
│  │ tickets.factory_phase_        │ │        │ │ tickets.factory_phase_        │  │
│  │   events              (4476)  │ │        │ │   events             (separat)│  │
│  └───────────────────────────────┘ │        │ └───────────────────────────────┘  │
│  external_id-Raum: T000001…        │        │  external_id-Raum: T000001…        │
└──────────────┬──────────────────────┘        └──────────────┬──────────────────────┘
               │                                               │
               │  ⚠ ÜBERLAPPENDER external_id-RAUM: dieselbe   │
               │    ID (z.B. "T002436") bezeichnet in beiden   │
               │    DBs unterschiedliche, unabhängige Vorgänge.│
               │    mcp-postgres (:13001) ist FEST an die      │
               │    mentolder-DB gebunden — eine Abfrage nach  │
               │    einer korczewski-ID liefert still die      │
               │    gleichnamige mentolder-Zeile statt einer   │
               │    leeren Menge (Scope-Warnung in der         │
               │    MCP-Registry).                             │
               └───────────────────┬───────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │  Zugriffspfad       │   Zugriffspfad       │
              ▼                     ▼                      ▼
     ┌──────────────────┐  ┌─────────────────────┐  ┌────────────────────────┐
     │ ticket-mcp        │  │ scripts/ticket.sh    │  │ mcp-postgres (:13001)  │
     │ stdio, 26 Tools    │  │ BRAND/--brand/       │  │ nur mentolder, Ticket- │
     │ command: ticket-   │  │ TICKET_NS-Auflösung  │  │ Reads NICHT empfohlen  │
     │ mcp-go             │  │ (--brand > BRAND >   │  │ (Scope-Warnung)        │
     │ Bridge: 127.0.0.1: │  │  TICKET_NS > mento-  │  └────────────────────────┘
     │ 18235/mcp/ticket-  │  │  lder-Default)        │
     │ mcp                │  └──────────┬────────────┘
     └─────────┬──────────┘             │
               │                         │
               │  SCHREIBER               │  SCHREIBER
               ▼                         ▼
     ┌────────────────────────────────────────────────────┐
     │  scripts/factory/pipeline.js (Ticket-Statuswechsel  │
     │  während der Pipeline), dev-flow-execute (Merge=    │
     │  Abschluss), scripts/ticket.sh update-status (CLI), │
     │  ticket-mcp-Tools (transition_status,               │
     │  record_phase_event, stage_plan, set_touched_files) │
     └────────────────────────────────────────────────────┘
               │
               │  LESER
               ▼
     ┌────────────────────────────────────────────────────┐
     │  Factory-Floor (website/src/lib/factory-floor*.ts,  │
     │  /api/factory-floor/stream), /admin/dora,           │
     │  scripts/factory/queue.sh (Dispatcher-Poll),        │
     │  Agenten (via ticket-mcp list_tickets/get_ticket)   │
     └────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────┐
│           factory-mcp — HTTP, Port :13003 (ZWEI Implementierungen)     │
│                                                                         │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐ │
│  │ scripts/factory/mcp-go/      │      │ scripts/factory/             │ │
│  │  main.go                     │      │  mcp-server.mjs               │ │
│  │  Go, Streamable-HTTP          │      │  Node, Streamable-HTTP        │ │
│  │  PORT: FACTORY_MCP_PORT      │      │  PORT: FACTORY_MCP_PORT      │ │
│  │  (Default 13003)             │      │  (Default 13003)             │ │
│  │  systemd-Unit:                │      │  KEINE systemd-Unit gefunden │ │
│  │  factory-mcp.service          │      │  (nur historisch referenziert│ │
│  │  ("task agents:factory-mcp:  │      │  in mcp-go/README.md als     │ │
│  │  install")                    │      │  Vorgänger)                   │ │
│  │  + factory_ask (LLM Q&A)     │      │  laut mcp-go/README.md: Go   │ │
│  └───────────────┬───────────────┘      │  ist "Rewrite of mcp-server. │ │
│                  │ aktiv (systemd)       │  mjs mit einem neuen Tool"   │ │
│                  │                        └─────────────────────────────┘ │
│                  ▼                                                     │
│         Registry-Eintrag docs/agent-guide/registry/mcp.yaml:           │
│         endpoint http://localhost:13003/mcp, harness claude_code:      │
│         type http                                                      │
└───────────────────────────────────────────────────────────────────────┘
```

## Schnittstellen

### Ticket-Datenbanken (brand-getrennt)

| Aspekt | mentolder-DB | korczewski-DB |
|--------|--------------|----------------|
| Namespace | `workspace` | `workspace-korczewski` |
| Pod-Selector | `shared-db`/`shared-db-dev` (`scripts/factory/lib.sh:49`) | dito, andere NS |
| `external_id`-Format | `T000001…` | `T000001…` (**identischer Zahlenraum**, siehe Diagramm-Warnung) |
| Standard-Auswahl | `TICKET_NS`/`BRAND` default `mentolder` (`scripts/ticket.sh:18,39`) | explizit über `--brand korczewski` / `BRAND=korczewski` |

### Tabellen (Belegung, mentolder-DB, per `mcp-postgres` COUNT-Queries erhoben, 2026-08-02)

| Tabelle | Zeilen (mentolder) | Befund |
|---------|---------------------|--------|
| `tickets.tickets` | 1927 | gefüllt |
| `tickets.ticket_links` | 501 | gefüllt |
| `tickets.ticket_plans` | 293 (davon 291 mit nichtleerem `content`) | **gefüllt** — widerspricht der wörtlichen Epic-Aussage zu D2, siehe Abschnitt "Defekt-Referenz" unten |
| `tickets.factory_phase_events` | 4476 | gefüllt |

> korczewski-DB: nicht erhoben — `mcp-postgres` (:13001) ist fest an die mentolder-DB gebunden (siehe Scope-Warnung im Diagramm); ein Query gegen die korczewski-DB hätte einen separaten Port-Forward/Kontext-Wechsel erfordert, der außerhalb des für diese Erhebung read-only verfügbaren Werkzeugs liegt. **Unklar.**

### Zugriffspfade

| Pfad | Transport | Scope | Aufrufer |
|------|-----------|-------|----------|
| `ticket-mcp` | stdio (`command: ticket-mcp-go`, Bridge `127.0.0.1:18235/mcp/ticket-mcp`) | beide Brands via `brand`-Argument | Agenten, `bachelorprojekt-test`, `bachelorprojekt-db` (Ticket-Reads) |
| `scripts/ticket.sh` | CLI, direkter `kubectl exec` gegen den Postgres-Pod | brand-Auflösung `--brand` > `BRAND` env > `TICKET_NS` env > Default `mentolder` (`scripts/ticket.sh:18,39,54`) | dev-flow-Skripte, Factory-Pipeline, manuelle Bedienung |
| `mcp-postgres` (:13001) | HTTP | **nur mentolder**, feste `DATABASE_URL` | Nicht-Ticket-Tabellen (Registry-Warnung rät explizit von Ticket-Reads ab) |

### factory-mcp (HTTP, Port :13003) — zwei Implementierungen

| Implementierung | Datei | Sprache | Default-Port-Env | systemd-Unit | Status |
|------------------|-------|---------|-------------------|--------------|--------|
| Go | `scripts/factory/mcp-go/main.go` (`func port()`, Zeile 36) | Go, Streamable-HTTP, stdlib-only | `FACTORY_MCP_PORT` (Default `13003`) | `scripts/factory/mcp-go/factory-mcp.service` — aktiv installiert via `task agents:factory-mcp:install` | **aktiv** (registrierter systemd-Dienst) |
| Node | `scripts/factory/mcp-server.mjs` (Zeile 9) | Node, `@modelcontextprotocol/sdk` | `FACTORY_MCP_PORT` (Default `13003`) | keine gefunden | **tot/dupliziert** — laut `scripts/factory/mcp-go/README.md` Zeile 4 ist Go "Go rewrite of `scripts/factory/mcp-server.mjs` with one new tool (`factory_ask`)" |

**Latenter Konflikt:** Beide Implementierungen binden denselben Default-Port über dieselbe Env-Variable. Würde die `.mjs`-Datei manuell gestartet, während der Go-systemd-Dienst bereits `:13003` hält, kollidieren beide (Bind-Fehler oder gegenseitiges Verdrängen je nach Startreihenfolge). Die `.mjs`-Datei ist im Repo nicht gelöscht, obwohl sie durch die Go-Implementierung ersetzt wurde — eine formal existierende, faktisch tote zweite Schnittstelle auf demselben Port.

### Factory-Queue-Selektivität (Dispatcher)

`scripts/factory/queue.sh` (SELECT gegen `tickets.tickets`, Zeilen 17-51) dispatcht **nur** zwei Typ-/Status-Kombinationen; alles andere bleibt stumm in der Queue liegen:

| # | Bedingung | Kommentar im Code |
|---|-----------|--------------------|
| 1 | `type IN ('feature','feat') AND status='backlog' AND readiness.lastenheft_locked=true AND readiness.factory_excluded=false` | Feature-Backlog: nur Lastenheft-lock=true gilt als AI-ready |
| 2 | `type NOT IN ('project','incident') AND status='plan_staged' AND readiness.execution_released!=false (Default true) AND readiness.factory_excluded=false` | Alle anderen Typen (bug, chore, task, …) mit gestagtem Plan; `project` (Epics) und `incident` (needs_human) sind explizit ausgeschlossen |

`factory_excluded` (T002361) gilt für beide Zweige und überlebt einen späteren Statuswechsel — nur ein expliziter `ticket.sh plan-meta set --readiness factory_excluded=false` hebt ihn auf.

### Komponenten der Software Factory (Kurzbeschreibung)

| Skript | Funktion |
|--------|----------|
| `scripts/factory/queue.sh` | Liest den dispatchbaren Backlog (siehe Tabelle oben) als JSON, read-only |
| `scripts/factory/wakeup.sh` | Vom systemd-USER-Timer (`factory.timer`) gefeuerter Wrapper; single-flight per `flock`, entsperrt git-crypt, ruft headless `claude -p`-Dispatcher-Ticks; "Inversion of Intelligence" — trägt selbst keine Scheduling-Logik |
| `scripts/factory/dispatcher-bridge.sh` | Ersetzt den früheren Workflow-Tool-Aufruf durch eine bash-Schleife: liest die Prep-Datei, führt Budget-Checks aus, startet jede Pipeline als eigene `claude -p`-Session; bei `launch_count=0` nur Metriken |
| `scripts/factory/schedule.sh` | Poll gegen den Backlog + Conflict-Gate + Slot-Claim (von `wakeup.sh`/`dispatcher.js` konsolidiert) |
| `scripts/factory/dispatcher.js` | Phase-2-Dispatcher: Watchdog-Sweep → Poll → Conflict-Gate/Slot-Claim → Pipeline-Start → Metriken |

## Silent-Failure-Pfade / formal existierende, faktisch tote Schnittstellen

| # | Pfad | Befund | Sichtbarkeit |
|---|------|--------|--------------|
| 1 | `tickets.ticket_plans` | **Widerlegt für mentolder** (293 Zeilen, 291 mit Inhalt) — siehe Defekt-Referenz unten für die Einordnung der ursprünglichen Epic-Aussage | per COUNT-Query verifiziert |
| 2 | `scripts/factory/mcp-server.mjs` neben `scripts/factory/mcp-go/main.go` | Beide binden `:13003` per Default über dieselbe Env-Var; die `.mjs`-Fassung ist per README als abgelöst dokumentiert, aber nicht gelöscht — keine aktive Kollision, solange niemand sie manuell startet, aber eine tote Zweitschnittstelle mit Bind-Risiko | keine Laufzeit-Warnung; nur README-Text |
| 3 | CLI-Statusübergänge (`scripts/ticket.sh update-status`) vs. Timeline | **Teilweise widerlegt**: `scripts/vda/ticket/update-status.sh` emittiert seit T001444 automatisch Phase-Events für `in_progress`, `in_review`, `qa_review`, `done`, `blocked` (Zeilen 21-27). Für alle anderen Statuswerte (`backlog`, `plan_staged`, `triage`, `archived`, …) gibt es **keine** automatische Emission — diese Übergänge bleiben in `factory_phase_events`/`v_timeline` unsichtbar | kein Log/Warnung bei fehlender Emission — stiller Lückenpfad für die nicht gelisteten Statuswerte |

### Zusätzlich beobachtet (NEU, nicht Teil der Epic-D-Liste D1-D9)

- **Punkt 3 oben** ist präziser als "CLI-Übergänge erscheinen nicht in der Timeline" — tatsächlich deckt der Auto-Phase-Mechanismus fünf der am häufigsten genutzten Statuswerte ab. Die Lücke betrifft die übrigen Statuswerte (insbesondere `backlog`→`plan_staged` bzw. `triage`), die für den DORA-Funnel relevant sein können, aber nicht mit-instrumentiert sind.

## Defekt-Referenz (T002430)

Wörtlich aus dem Epic (`project_t002430-brain-architektur-epic` Memory, 2026-07-28):

> **D2**: `ticket_plans` leer.

Frühere Bestätigung im Repo: `openspec/changes/archive/2026-08-01-epic-canvas-k5/design.md:44` ("OF2: ticket_plans ist leer — bestätigt", im Kontext der Epic-Canvas-Funktion, die bewusst IndexedDB/LocalStorage statt `ticket_plans` nutzt).

**Aktueller Befund (2026-08-02, mentolder-DB):** `tickets.ticket_plans` enthält 293 Zeilen, davon 291 mit nichtleerem `content`. Die Tabelle ist **nicht mehr repo-weit leer** — die Aussage war entweder zum Zeitpunkt der Epic-Formulierung (2026-07-28) zutreffend und die Tabelle wurde seither befüllt (z.B. durch `ticket-mcp`s `stage_plan`/`set_plan_meta`-Tools), oder sie bezog sich ausschließlich auf einen Teilbereich (z.B. eine bestimmte Brand-DB oder einen bestimmten Zeitraum). Die korczewski-DB wurde für diese Dokumentation nicht erhoben (siehe oben, **unklar**). Status: **teilweise überholt** — D2 sollte im Epic-Tracking neu bewertet werden, statt unverändert als offen zu gelten.

| Defekt | Betrifft K6? | Status |
|--------|-------------|--------|
| D2: `ticket_plans` leer | ✅ (namentlich zugeordnet) | **Widerlegt für mentolder** (293/291 gefüllte Zeilen) — siehe Neubewertung oben; korczewski unklar |

## Ist/Soll-Abgrenzung

| Aspekt | IST | SOLL (aus Erhebung ableitbar) |
|--------|-----|-------------------------------|
| `ticket_plans`-Befüllung | 293 Zeilen (mentolder), aktiv genutzt | Epic-Text (D2) auf Basis dieser Erhebung aktualisieren |
| factory-mcp-Implementierungen | 2 im Repo, 1 aktiv (Go, systemd) | `.mjs`-Datei entfernen oder klar als deprecated markieren, um das Bind-Kollisionsrisiko zu beseitigen |
| CLI→Timeline-Kopplung | 5 von N Statuswerten automatisch instrumentiert | Vollständige oder bewusst dokumentierte Teilabdeckung (aktuell nicht dokumentiert) |
| Brand-Trennung | Zwei physisch getrennte DBs (unterschiedliche Namespaces), überlappender ID-Raum | Bereits durch `brand`-Argument/`TICKET_NS` sauber adressiert — kein Soll-Delta, aber Fehlerquelle bei falscher Tool-Wahl (`mcp-postgres` statt `ticket-mcp`) |

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-08 | T002436 | Dieses Dokument: Visualisierung, Datenerhebung, Defekt-Neubewertung (D2) |
