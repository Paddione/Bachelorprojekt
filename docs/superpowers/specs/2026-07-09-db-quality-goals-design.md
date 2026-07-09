---
ticket_id: null
plan_ref: openspec/changes/db-quality-goals/tasks.md
status: active
date: 2026-07-09
---

# DB Quality Goals — neue G-DB-Kategorie in `.claude/lib/goals.md`

**Branch:** `feature/db-quality-goals`
**Datum:** 2026-07-09
**Baseline (live, 2026-07-09, gegen `shared-db`/`website`-DB im fleet-Cluster verifiziert):** 5 neue Ziele
**Target:** 5 neue Ziele (`G-DB01`, `G-DB03`, `G-DB04`, `G-DB06`, `G-DB08`) reproduzierbar gemessen und in
`scripts/health-goals-check.sh` verdrahtet.
**Aufwand:** klein (5 Bash/SQL-Messbefehle, analog zu G-AGENTIC*)
**Reproduzierbar:** ja — alle 5 Checks sind read-only `psql`/`kubectl`-Einzeiler.

## Intent (WARUM)

`.claude/lib/goals.md` deckt bereits Repo-Struktur, Code-Qualität, K8s-Manifeste, Security, Docs,
DORA und Agentic-Tooling ab (`G-RH*`, `G-CQ*`, `G-K8S*`, `G-SEC*`, `G-DOC*`, `G-DORA*`, `G-AGENTIC*`) —
aber **keine einzige Metrik für die Datenbank selbst**, obwohl es bereits einen `database-specialist`-
Agenten und `bachelorprojekt-db`-Routing gibt und der Messzyklus-Abschnitt bereits eine ID `G-DATA01`
erwähnt, die nie definiert wurde. Das ist eine Lücke: strukturelle DB-Gesundheit (fehlende Indizes,
Datenintegrität, Backup-Disziplin, Query-Performance) ist der gleichen Silent-Failure-Klasse
zuzuordnen wie die bereits gefangenen Doku-/Config-Drifts.

**Brainstorming-Entscheidungen (interaktive Session, 2026-07-09):**
1. Vier Fokusbereiche gewählt: Schema-Hygiene, Backup/Recovery, Datenqualität/Konsistenz,
   Query-Performance.
2. Messung ausschließlich **read-only** (mcp-postgres-Query oder `psql`-Helper aus
   `mcp-tool-guide.md`) — keine aktiven `EXPLAIN ANALYZE`-Läufe, um keine Prod-Last zu erzeugen.
3. Von ursprünglich 8 Kandidaten (`G-DB01`–`G-DB08`) wurden 3 verworfen bzw. ausgelagert:
   - `G-DB02` (NOT-NULL-Kandidaten) — verworfen: Messung wäre pro nullable Spalte ein Full-Scan,
     unverhältnismäßig teuer für den Erkenntnisgewinn.
   - `G-DB05` (Restore-Test-Frequenz) — ausgelagert auf separates Folge-Ticket: es existiert
     aktuell **keine** Automatisierung, die einen Restore-Test protokolliert; das ist echte neue
     Tooling-Arbeit, kein 1-Zeilen-Messbefehl, und sprengt den Rahmen dieses Changes.
   - `G-DB07` (NULL-Anteil in Pflichtfeldern) — verworfen nach Stichprobe: `ticket_comments.ticket_id`
     ist 0/1582 NULL (sauber), kein belastbarer Kandidat gefunden.
4. `G-DB03` wurde während der Recherche **umdefiniert**: ursprünglich als "Schema-Drift zwischen
   Brand-Datenbanken" angenommen — tatsächlich sind `mentolder`/`korczewski` **keine** getrennten
   Datenbanken/Schemas, sondern ein `brand`-Spaltenwert (`text`) in gemeinsamen Tabellen (44 Tabellen
   mit `brand`-Spalte gefunden). Neue Definition: Tabellen mit `brand`-Spalte ohne `CHECK`-Constraint,
   der die Werte auf `{mentolder, korczewski}` einschränkt (aktuell 0 von 44 Tabellen haben einen
   solchen Constraint).
5. **Live-Nebenfund während der Recherche:** das `db-backup`-CronJob (Schedule `0 2 * * *`) hatte zum
   Zeitpunkt der Recherche 3 aufeinanderfolgende fehlgeschlagene Läufe (letzter Erfolg vor 6 Tage 19h),
   vermutlich im Filen-Upload-Schritt. Per Bug-Triage-Konvention (CFR-Gate) als **T001738** geticketed
   (severity major, priority hoch) — Root-Cause-Fix ist NICHT Teil dieses Changes. `G-DB04` wird
   trotzdem sofort mit rotem Ist-Wert aufgenommen (verlinkt T001738), statt auf den Fix zu warten —
   genau dafür ist das Health-Goals-System da.

## Die 5 Ziele

| ID | Domäne | Ziel | Klasse | Baseline (2026-07-09) → Target |
|---|---|---|---|---|
| G-DB01 | Schema-Hygiene | FK-Spalten ohne Index | Target | 4 → 0 |
| G-DB03 | Schema-Hygiene | `brand`-Spalten ohne CHECK-Constraint | Target | 44 → 0 (oder dokumentierte Teilmenge, falls Vollmigration zu groß) |
| G-DB04 | Backup/Recovery | Backup-Alter (Zeit seit letztem erfolgreichen `db-backup`-Job) | Gate | 6d19h 🔴 → ≤ 26h (verlinkt T001738) |
| G-DB06 | Datenqualität | Orphan-Rows über 2-3 FK-Paare | Gate | 0 ✓ (ticket_plans→tickets verifiziert) → 0 (halten) |
| G-DB08 | Query-Performance | Seq-Scan-Anteil auf Tabellen >10k Rows | Target | messbar (aktuell: `questionnaire_answers` 222/27530 ≈ 0.8 %, `chunks` 53/558 ≈ 9.5 %) → dokumentierte Baseline, kein hartes Target initial |

**Verifizierte Messgrundlagen (read-only, gegen `shared-db`/`website`-DB im fleet-Cluster, 2026-07-09):**

- **G-DB01:** `pg_constraint`/`pg_index`-EXCEPT-Query über alle FK-Constraints außerhalb
  `pg_catalog`/`information_schema`. Aktuelle Treffer: `sessions.templates.created_from_template_id`,
  `studio.sessions.client_id`, `studio.sessions.template_of`, `public.onboarding_state.brand`.
- **G-DB03:** `SELECT column_name FROM information_schema.columns WHERE column_name='brand'` (44
  Treffer) gegen `SELECT ... FROM pg_constraint WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE
  '%brand%'` (0 Treffer) — Differenz ist der Messwert.
- **G-DB04:** `kubectl get jobs -n workspace --context fleet -l ... --sort-by=.status.completionTime`
  gefiltert auf `status.conditions[].type=Complete`, Alter des jüngsten Treffers.
- **G-DB06:** `NOT EXISTS`-Query je FK-Paar (Startpunkt: `tickets.ticket_plans` → `tickets.tickets`,
  weitere Paare in der Plan-Phase zu bestimmen), Summe über alle Paare.
- **G-DB08:** `pg_stat_user_tables` gefiltert auf `n_live_tup > 10000`, sortiert nach `seq_scan`.
  `pg_stat_statements`-Extension ist aktiviert (verifiziert).

## Backlog — weitere Richtungen (nur dokumentiert, kein Change in dieser Runde)

Aus dem offenen Brainstorming-Teil zwei Richtungen mit grober Kandidaten-Skizze für eine **spätere**
Session (bewusst kein Ticket/Change jetzt, da beide zusammen mit G-DB* sonst Epic-Charakter hätten):

**Observability/Runtime-Health** (Live-Systemverhalten statt Repo-Struktur):
- Fehlerraten aus Pod-Logs (z.B. Error-Log-Zeilen/Stunde über alle `workspace`-Pods)
- Pod-Restart-Häufigkeit (`kubectl get pods --field-selector` Restart-Count-Schwelle)
- LLM-Pipeline-Verfügbarkeit (Ollama/TEI/LiteLLM Health-Endpoint-Erfolgsrate)

**DX / Agent-Effizienz** (wie zuverlässig arbeiten Subagenten wirklich):
- Plan-Lint-Fail-Rate (Anteil `plan-lint.sh`-Läufe, die beim ersten Versuch durchfallen)
- Mishap-Rate pro Ticket (`tickets.factory_phase_events`/Mishap-Buffer-Einträge pro abgeschlossenem
  Ticket)
- Kontext-Overflow-Häufigkeit bei Subagenten (aus Session-Transkripten, falls messbar)

## Nicht Teil dieses Changes

- Root-Cause-Fix für T001738 (db-backup-Ausfall) — separates Ticket.
- G-DB05 (Restore-Test-Automatisierung) — separates Folge-Ticket, da echte neue Tooling-Arbeit.
- Observability/Runtime-Health und DX/Agent-Effizienz als eigene Kategorien — Backlog, keine
  Ticket-Erstellung in dieser Runde.
