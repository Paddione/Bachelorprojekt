# K6: Ticket-Datenmodell

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
     │  dev-flow-execute (Merge=Abschluss),               │
     │  scripts/ticket.sh update-status (CLI),            │
     │  ticket-mcp-Tools (transition_status,               │
     │  record_phase_event, stage_plan, set_touched_files) │
     └────────────────────────────────────────────────────┘
               │
               │  LESER
               ▼
     ┌────────────────────────────────────────────────────┐
     │  /admin/dora, Agenten (via ticket-mcp               │
     │  list_tickets/get_ticket)                           │
     └────────────────────────────────────────────────────┘


```

## Schnittstellen

### Ticket-Datenbanken (brand-getrennt)

| Aspekt | mentolder-DB | korczewski-DB |
|--------|--------------|----------------|
| Namespace | `workspace` | `workspace-korczewski` |
| Pod-Selector | `shared-db`/`shared-db-dev` | dito, andere NS |
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
| `scripts/ticket.sh` | CLI, direkter `kubectl exec` gegen den Postgres-Pod | brand-Auflösung `--brand` > `BRAND` env > `TICKET_NS` env > Default `mentolder` (`scripts/ticket.sh:18,39,54`) | dev-flow-Skripte, manuelle Bedienung |
| `mcp-postgres` (:13001) | HTTP | **nur mentolder**, feste `DATABASE_URL` | Nicht-Ticket-Tabellen (Registry-Warnung rät explizit von Ticket-Reads ab) |

### Retired: MCP-Server, Dispatcher-Queue, Komponenten (T900399/T900728)

Die Abschnitte über den ehemaligen MCP-Server (Go/Node, Port :13003), die Dispatcher-Queue-Selektivität und die Factory-Komponenten sind mit dem Factory-Teardown entfallen — die beschriebenen Skripte, Units und Tasks existieren nicht mehr. Historischer Stand: siehe Git-Historie dieser Datei vor T900728.

## Silent-Failure-Pfade / formal existierende, faktisch tote Schnittstellen

| # | Pfad | Befund | Sichtbarkeit |
|---|------|--------|--------------|
| 1 | `tickets.ticket_plans` | **Widerlegt für mentolder** (293 Zeilen, 291 mit Inhalt) — siehe Defekt-Referenz unten für die Einordnung der ursprünglichen Epic-Aussage | per COUNT-Query verifiziert |
| 2 | CLI-Statusübergänge (`scripts/ticket.sh update-status`) vs. Timeline | **Teilweise widerlegt**: `scripts/vda/ticket/update-status.sh` emittiert seit T001444 automatisch Phase-Events für `in_progress`, `in_review`, `qa_review`, `done`, `blocked` (Zeilen 21-27). Für alle anderen Statuswerte (`backlog`, `plan_staged`, `triage`, `archived`, …) gibt es **keine** automatische Emission — diese Übergänge bleiben in `tickets.factory_phase_events`/`v_timeline` unsichtbar | kein Log/Warnung bei fehlender Emission — stiller Lückenpfad für die nicht gelisteten Statuswerte |

### Zusätzlich beobachtet (NEU, nicht Teil der Epic-D-Liste D1-D9)

- **Punkt 2 oben** ist präziser als "CLI-Übergänge erscheinen nicht in der Timeline" — tatsächlich deckt der Auto-Phase-Mechanismus fünf der am häufigsten genutzten Statuswerte ab. Die Lücke betrifft die übrigen Statuswerte (insbesondere `backlog`→`plan_staged` bzw. `triage`), die für den DORA-Funnel relevant sein können, aber nicht mit-instrumentiert sind.

## Defekt-Referenz (T002430)

Wörtlich aus dem Epic (`project_t002430-brain-architektur-epic` Memory, 2026-07-28):

> **D2**: `ticket_plans` leer.

Frühere Bestätigung im Repo (`2026-08-01-epic-canvas-k5/design.md:44`): "OF2: ticket_plans ist leer — bestätigt", im Kontext der Epic-Canvas-Funktion, die bewusst IndexedDB/LocalStorage statt `ticket_plans` nutzt.

**Aktueller Befund (2026-08-02, mentolder-DB):** `tickets.ticket_plans` enthält 293 Zeilen, davon 291 mit nichtleerem `content`. Die Tabelle ist **nicht mehr repo-weit leer** — die Aussage war entweder zum Zeitpunkt der Epic-Formulierung (2026-07-28) zutreffend und die Tabelle wurde seither befüllt (z.B. durch `ticket-mcp`s `stage_plan`/`set_plan_meta`-Tools), oder sie bezog sich ausschließlich auf einen Teilbereich (z.B. eine bestimmte Brand-DB oder einen bestimmten Zeitraum). Die korczewski-DB wurde für diese Dokumentation nicht erhoben (siehe oben, **unklar**). Status: **teilweise überholt** — D2 sollte im Epic-Tracking neu bewertet werden, statt unverändert als offen zu gelten.

| Defekt | Betrifft K6? | Status |
|--------|-------------|--------|
| D2: `ticket_plans` leer | ✅ (namentlich zugeordnet) | **Widerlegt für mentolder** (293/291 gefüllte Zeilen) — siehe Neubewertung oben; korczewski unklar |

## Ist/Soll-Abgrenzung

| Aspekt | IST | SOLL (aus Erhebung ableitbar) |
|--------|-----|-------------------------------|
| `ticket_plans`-Befüllung | 293 Zeilen (mentolder), aktiv genutzt | Epic-Text (D2) auf Basis dieser Erhebung aktualisieren |
| CLI→Timeline-Kopplung | 5 von N Statuswerten automatisch instrumentiert | Vollständige oder bewusst dokumentierte Teilabdeckung (aktuell nicht dokumentiert) |
| Brand-Trennung | Zwei physisch getrennte DBs (unterschiedliche Namespaces), überlappender ID-Raum | Bereits durch `brand`-Argument/`TICKET_NS` sauber adressiert — kein Soll-Delta, aber Fehlerquelle bei falscher Tool-Wahl (`mcp-postgres` statt `ticket-mcp`) |

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-08 | T002436 | Dieses Dokument: Visualisierung, Datenerhebung, Defekt-Neubewertung (D2) |
| 2026-10 | T900728 | Factory-Teardown: Pipeline-/MCP-/Dispatcher-Abschnitte entfernt, umbenannt nach `k6-ticket-datenmodell.md` |
