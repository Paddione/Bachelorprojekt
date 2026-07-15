# Proposal: db-quality-goals

## Why

`.claude/lib/goals.md` deckt bereits Repo-Struktur, Code-Qualität, K8s-Manifeste, Security, Docs,
DORA und Agentic-Tooling ab (`G-RH*`, `G-CQ*`, `G-K8S*`, `G-SEC*`, `G-DOC*`, `G-DORA*`, `G-AGENTIC*`) —
aber keine einzige Metrik für die Datenbank selbst, obwohl bereits ein `database-specialist`-Agent
und `bachelorprojekt-db`-Routing existieren und der Messzyklus-Abschnitt eine nie definierte ID
`G-DATA01` erwähnt. Strukturelle DB-Gesundheit (fehlende Indizes, Datenintegrität, Backup-Disziplin,
Query-Performance) ist derselben Silent-Failure-Klasse zuzuordnen wie die bereits gefangenen
Doku-/Config-Drifts.

Während der Recherche wurde zudem ein aktives Live-Problem gefunden (T001738: `db-backup`-CronJob
mit 3 aufeinanderfolgenden Fehlschlägen, letzter Erfolg vor 6 Tage 19h) — genau die Klasse Problem,
die `G-DB04` künftig automatisch sichtbar macht.

## What

Fünf neue, read-only reproduzierbar messbare Ziele (`G-DB01`, `G-DB03`, `G-DB04`, `G-DB06`, `G-DB08`)
in `.claude/lib/goals.md` und `scripts/health-goals-check.sh` verdrahten:

- **G-DB01** — FK-Spalten ohne Index (Baseline 4)
- **G-DB03** — `brand`-Spalten ohne CHECK-Constraint (Baseline 44 von 44 Tabellen)
- **G-DB04** — Backup-Alter seit letztem erfolgreichen `db-backup`-Job (Baseline 6d19h 🔴, verlinkt T001738)
- **G-DB06** — Orphan-Rows über 2-3 FK-Paare (Baseline 0, verifiziert an `ticket_plans`→`tickets`)
- **G-DB08** — Seq-Scan-Anteil auf Tabellen >10k Rows (dokumentierte Baseline, kein hartes Target initial)

Details, verworfene Kandidaten (G-DB02, G-DB05, G-DB07) und Backlog-Notizen für zwei weitere
Ziel-Richtungen (Observability/Runtime-Health, DX/Agent-Effizienz) siehe
`docs/superpowers/specs/2026-07-09-db-quality-goals-design.md`.

_Ticket: T001739_
