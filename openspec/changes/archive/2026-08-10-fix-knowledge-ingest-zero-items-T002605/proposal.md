# Proposal: fix-knowledge-ingest-zero-items-T002605

## Why

Alle Knowledge-Ingest-CronJobs im Cluster (ns `workspace`, fleet) beenden mit
Exit 0 und "Done." — führen aber **null Embedding-Aufrufe** aus:

- `knowledge-ingest-prs` → `Found 0 PRs to ingest`
- `knowledge-ingest-bugs` → `Found 0 bug tickets for brand "mentolder"`
- `knowledge-reindex-all` (weekly, nach 28h) → ebenfalls 0 PRs + 0 Bug-Tickets
- `knowledge-ingest-markdown` → `Markdown ingestion requires repo mount — skipping in cluster.`

Das ist eine stille-grüne Fehlerklasse: Die CronJobs melden Erfolg, obwohl
nichts indexiert wird. Die ursprüngliche Hypothese aus T002605 (gemeinsamer
Selektor-/Zeitfenster-Fehler) ist **durch Evidenz widerlegt** — kein Script
enthält einen Zeitfenster-Filter; die CronJobs geben die Tabellen-Zustände
korrekt wieder. Der Fehler liegt **upstream**: Die Quell-Tabellen sind leer.

### Evidence (gemessen 2026-08-04, fleet-Produktions-DB, mcp-postgres)

| Quelle | Zeilen | pg_stat (n_tup_ins) | Befund |
|---|---|---|---|
| `bachelorprojekt.features` (Legacy-PR-Store, gelesen von `ingest-prs.mjs`) | 0 | **0 — nie geschrieben** | leere Legacy-Tabelle |
| `bugs.bug_tickets` (Legacy-Bug-Store, gelesen von `ingest-bug-tickets.mjs`) | 0 | **0 — nie geschrieben** | weiterhin BASE TABLE; Sunset auf Back-compat-View (per `scripts/migrate-bugs-to-tickets.mjs`) auf fleet nie angewendet |
| `tickets.pr_events` (kanonische PR-Tabelle) | 0 | **0 — nie geschrieben** | ebenfalls nie befüllt |
| `tickets.tickets` | 2010 live (2665 ins) | aktiv | der lebende Ticket-Store; Bugs sind `type='fix'` (635 mentolder + 18 korczewski), **keine `type='bug'`-Zeilen** (T002329-Umbenennung) |
| `tickets.ticket_links` | 369 Links mit `pr_number` (355 distinkte) | aktiv | einzige lebende PR-Datenquelle im System |

Zusatzbefunde:

- Kein Zeitfenster-Filter in irgendeinem ConfigMap-Script — die "Selektor-/
  Zeitfenster"-Hypothese (T002605-Verdacht) ist damit **widerlegt**.
- Deployed ConfigMap im Cluster == Repo (kein Drift, per kubectl geprüft);
  CronJobs laufen, `LAST SCHEDULE` aktuell.
- `knowledge.collections`: "Bug Tickets" hält 117 **veraltete** Chunks (werden
  nie gelöscht, weil 0 Dokumente verarbeitet werden — irreführendes
  `last_indexed_at`); "PR History" hat 0 Chunks.
- T002604-NetworkPolicy (ECONNREFUSED zur Website) ist **nicht relevant**: Die
  CronJobs erreichen die DB nachweislich (sie liefern Counts zurück).

## What

- **Diagnose als Task 1** (T002448-M5: Beweis vor Lösungsentwurf): Die obige
  Evidenz wird im Cluster verifiziert und im Ticket dokumentiert; offene
  Entscheidungen werden belegt (Bug-Typ-Filter, PR-Datenquelle, Markdown-Pfad).
- **Bug-Ingest auf Live-Store umstellen**: `ingest-bug-tickets.mjs` liest
  künftig `tickets.tickets WHERE brand = $1 AND type IN ('bug','fix')`
  statt der leeren Legacy-Tabelle `bugs.bug_tickets`.
- **PR-Ingest auf Live-Quelle umstellen**: `ingest-prs.mjs` liest künftig aus
  `tickets.ticket_links` (JOIN `tickets.tickets` für Titel/Beschreibung) —
  Entscheidungs-Gate in Task 1, da `tickets.pr_events` nie befüllt wurde.
- **Zero-Item-Guard**: Beide Ingest-Scripts warnen/failen laut, wenn ihre
  Query 0 Zeilen liefert, während der Live-Store Zeilen hat — die
  stille-grüne Fehlerklasse wird sichtbar.
- **Markdown-Pfad**: CronJob wird suspendiert (`spec.suspend: true`) und als
  bewusst lokal-only dokumentiert (`task knowledge:reindex SOURCE=markdown`
  mit Repo-Mount) — statt eines scheinbar grünen No-op-CronJobs.
- **Konvergenz der Script-Kopien**: `scripts/knowledge/*.mjs` (lokal) und die
  ConfigMap-Kopie in `k3d/knowledge-ingest-cronjob.yaml` werden auf denselben
  Stand gebracht (bestehende BATS-Tests prüfen nur die ConfigMap-Kopie).

_Ticket: T002605_
