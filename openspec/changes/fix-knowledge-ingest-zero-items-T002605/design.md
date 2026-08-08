# Design: fix-knowledge-ingest-zero-items-T002605

## Context

Alle vier Knowledge-Ingest-CronJobs (ns `workspace`, fleet) laufen grün, führen
aber null Embedding-Aufrufe aus. Die gemessene Evidenz (2026-08-04,
fleet-Produktions-DB via mcp-postgres, `pg_stat_user_tables` + direkte
Queries) zeigt: **die Quell-Tabellen der Ingest-Scripts sind leer bzw. wurden
nie befüllt** — die CronJobs selbst sind nicht kaputt.

Kette im Detail:

1. `ingest-prs.mjs` (ConfigMap-Kopie) selektiert aus `bachelorprojekt.features
   WHERE merged_at IS NOT NULL` — Tabelle hat 0 Zeilen und **0 Inserts seit
   jeher** (n_tup_ins=0). Die kanonische PR-Tabelle `tickets.pr_events` ist
   ebenfalls 0/0. Einzige lebende PR-Daten: `tickets.ticket_links`
   (`pr_number` auf 355 distinkten PRs) JOIN `tickets.tickets`.
2. `ingest-bug-tickets.mjs` selektiert aus `bugs.bug_tickets WHERE brand=$1` —
   Tabelle hat 0 Zeilen, 0 Inserts, und ist auf fleet weiterhin eine BASE
   TABLE. Das dokumentierte Sunset-Ziel (Back-compat-View über
   `tickets.tickets WHERE type='bug'`, siehe `scripts/migrate-bugs-to-tickets.mjs`)
   wurde hier nie angewendet; zudem ist `type='bug'` seit T002329 obsolet —
   Bugs tragen `type='fix'`.
3. Der Zero-Item-Zustand ist **stumm**: "Found 0 …" + Exit 0, kein Alarm, keine
   Warnung. Veraltete Chunks bleiben liegen ("Bug Tickets": 117 Chunks von
   früher) und täuschen via `last_indexed_at` einen lebenden Bestand vor.
4. `ingest-markdown.mjs` ist ein bewusster No-op im Cluster (kein Repo-Mount),
   meldet aber Exit 0 — ein scheinbar grüner CronJob ohne Funktion.
5. Es existieren **zwei auseinandergelaufene Kopien** der Ingest-Scripts:
   `scripts/knowledge/*.mjs` (lokal, fragt u.a. `body, labels` ab) und die
   ConfigMap-Kopie in `k3d/knowledge-ingest-cronjob.yaml`. Die BATS-Tests
   (`tests/unit/knowledge-ingest-*.bats`) prüfen nur die ConfigMap-Kopie via
   `kubectl kustomize`.

## Goals

- Die Knowledge-Ingest-CronJobs embedden wieder echte Items: PR-History und
  Bug-Tickets aus dem **lebenden** Ticket-Store (`tickets.*`).
- Die stille-grüne Fehlerklasse wird sichtbar: Zero-Item-Guard warnt/failt
  laut, wenn die Ingest-Query 0 Zeilen liefert, während der Live-Store Zeilen
  hat.
- Der Markdown-CronJob wird als bewusst lokal-only gekennzeichnet
  (suspendiert + dokumentiert) statt als grüner No-op gefahren.
- Beide Script-Kopien (lokal + ConfigMap) konvergieren; die BATS-Suite deckt
  den Zielzustand ab.

## Non-Goals

- **Keine Reparatur des `tickets.pr_events`-Befüllungs-Pipelines** (SDLC
  Timeline / delivery-metrics — leere Tabelle ist ein separates Thema, gehört
  nicht in diesen Fix). Der PR-Ingest liest stattdessen die vorhandenen
  Live-Daten (`ticket_links` + `tickets`). Wenn Task 1 belegt, dass eine
  Befüllung existiert oder geplant ist, wird die Entscheidung im Gate
  festgehalten.
- Keine Änderung am Website-SDLC-Stack, an Voyage/bge-Embedding-Routing
  (T002570 ist bereits gemergt) oder an der T002604-NetworkPolicy.
- Keine Datenmigration von `bugs.bug_tickets` → `tickets.tickets` (die Daten
  sind dort bereits; die Tabelle ist leer).

## Decisions

**D1 — Diagnose vor Lösung (T002448-M5, Pflicht):** Task 1 verifiziert die
Evidenz im Cluster (Queries + pg_stat + kubectl-ConfigMap-Abgleich), protokolliert
sie als Ticket-Kommentar und entscheidet belegt über D2–D4. Der Lösungs-Task
(p2) wird erst nach dem Diagnose-Task ausgeführt.

**D2 — Bug-Quelle:** `ingest-bug-tickets.mjs` liest `tickets.tickets
WHERE brand = $1 AND type IN ('bug','fix')` (Live-Store, 635 mentolder
`fix`-Tickets). `fixed_in_pr` wird per Subquery über `tickets.ticket_links`
(kind='fixes') aufgelöst. Die Legacy-Tabelle `bugs.bug_tickets` wird nicht
mehr gelesen. (Gate in Task 1: Filter-Entscheidung mit Counts belegen.)

**D3 — PR-Quelle:** `ingest-prs.mjs` liest
`tickets.ticket_links l JOIN tickets.tickets t ON l.from_id = t.id
WHERE l.pr_number IS NOT NULL` (355 distinkte PRs). Titel = `t.title`,
Beschreibung = `t.description`. `merged_at` fällt weg (kein lebendes Feld) —
wird in den Metadaten auf `null` gesetzt bzw. weggelassen. Alternativ-Option
`tickets.pr_events` wird in Task 1 geprüft; ist die Tabelle weiterhin leer und
ohne Schreiber, gilt die ticket_links-Lösung. (Gate: Entscheidung mit Counts
dokumentieren.)

**D4 — Markdown:** `knowledge-ingest-markdown` wird suspendiert
(`spec.suspend: true`) und der lokale Pfad (`task knowledge:reindex
SOURCE=markdown`, erfordert Repo-Mount) wird im YAML-Kommentar und in der
Runbook-Doku festgehalten. Kein grüner No-op-CronJob mehr.

**D5 — Zero-Item-Guard:** In `ingest-bug-tickets.mjs` und `ingest-prs.mjs`
wird nach der Query geprüft: `rows.length === 0` UND
`SELECT COUNT(*)` gegen den Live-Store (`tickets.tickets` bzw.
`ticket_links`) > 0 → Warnung auf stderr + `process.exit(1)` (KronJob wird rot
= sichtbar). Bei 0 Zeilen UND 0 Live-Zeilen (ehrlich leer) bleibt Exit 0 mit
Hinweis.

**D6 — Script-Konvergenz:** Die lokalen `scripts/knowledge/*.mjs` und die
ConfigMap-Kopie in `k3d/knowledge-ingest-cronjob.yaml` erhalten denselben
Zielzustand; `lib-knowledge-pg.mjs` wird nur dort erweitert, wo der Guard
lebt (eine Kopie in ConfigMap + lokale Datei — beide Versionen sind
handgepflegt, keine Auto-Sync-Kette; das wird im Plan als bekannte
Drift-Quelle notiert).

## Risks / Trade-offs

- **[Risk] PR-Datenqualität über ticket_links:** Titel/Beschreibung stammen aus
  `tickets.tickets` (Ticket-Texte), nicht aus den echten GitHub-PR-Bodies;
  `merged_at` fehlt. → Trade-off akzeptiert: Daten sind live und vorhanden
  (355 PRs); eine vollständige PR-History braucht die pr_events-Befüllung
  (Out of Scope, in Task 1 als Nachfolge-Vorschlag festgehalten).
- **[Risk] Guard schlägt bei ehrlich-leerem Store fehl:** Wenn der Live-Store
  tatsächlich 0 Zeilen hat, darf der Guard nicht failen. → Guard prüft
  Live-Store-Count, nicht nur Query-Ergebnis.
- **[Risk] BATS-Tests decken nur die ConfigMap-Kopie:** Lokale Script-Kopien
  können weiter driften. → p3 prüft zusätzlich per grep, dass beide Kopien die
  Live-Quellen referenzieren (dokumentierte Grenze der Testabdeckung).
- **[Risk] Suspend des Markdown-CronJobs übersehen Dokumentation:** →
  Entscheidung wird in p1 protokolliert und im YAML-Kommentar + CLAUDE.md
  verankert.
