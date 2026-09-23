---
title: "application-pipeline-matching — Implementation Plan (Phase 2: Matching)"
ticket_id: T900234
domains: [database, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T900228
depends_on_plans: [application-pipeline, application-pipeline-typst-dossiers]
---

# application-pipeline-matching — Implementation Plan

_Ticket: T900234_

**Voraussetzung:** Phase 1 (T900228, Schema) UND Phase 3 (T900230,
`scripts/lib/application-pipeline-evidence.sh` + `scripts/vda/apply/evidence-catalog.yaml`)
müssen gemergt sein — dieser Plan ruft `app_pipeline_select_evidence` direkt auf, statt die
Auswahl-Logik zu duplizieren.

Scope: Requirement "Deterministic Keyword-Based Match Scoring" aus
`openspec/changes/application-pipeline-matching/specs/application-pipeline.md`. Kein ML-/
Embedding-Scoring, keine automatische Statustransition (siehe Proposal, "Explizit nicht in
dieser Phase").

## File Structure

```
components/website/src/db/migrations/20260917_application_pipeline_match_score.sql   (neu)
scripts/vda/apply/match.sh                                                           (neu)
tests/spec/application-pipeline/match-scoring.bats                                   (neu)
```

Budget: alle Dateien neu, nicht gebaselined. `.sh`-Limit 800 Zeilen (`s1.limits`) —
`match.sh` bleibt mit dem unten skizzierten Umfang deutlich darunter (~70 Zeilen geschätzt).
`.sql` ist in `s1.limits` nicht gelistet (kein Gate).

## Task 1: Schema-Erweiterung `match_score`/`match_evidence_ids` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/match-scoring.bats
# expected: FAIL (Migration existiert noch nicht, Spalten fehlen)
```

Guard für fehlendes `psql`-Binary: `command -v psql >/dev/null 2>&1 || skip "psql binary not
installed"`. Erstes Szenario prüft per `psql`, dass `applications.jobs` die Spalten
`match_score NUMERIC` und `match_evidence_ids TEXT[]` besitzt.

**GREEN — Fix-Step:**

Erstelle `components/website/src/db/migrations/20260917_application_pipeline_match_score.sql`:

```sql
ALTER TABLE applications.jobs
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS match_evidence_ids TEXT[];
```

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein (erstes Szenario).

## Task 2: Matching-CLI `scripts/vda/apply/match.sh` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

Weitere Szenarien in derselben `match-scoring.bats` (kein zusätzlicher Testlauf-Befehl nötig, da
Task 1 den Runner bereits aufruft — für plan-lint STRUCT2 zählt der Task-1-Aufruf):
- Job mit Requirements-Text, der mehrere Evidenz-Katalog-Keywords trifft (z.B. "Kubernetes,
  CI/CD, Linux") → `match_score` > 70, `match_evidence_ids` enthält die getroffenen Katalog-IDs,
  nach Trefferzahl sortiert (Spec-Szenario "Job with strong evidence-catalog overlap receives a
  high score").
- Job mit Requirements-Text ohne Keyword-Treffer → `match_score` auf dokumentiertem Default
  (nicht NULL, kein Crash), `match_evidence_ids` enthält die `default: true`-Katalogeinträge
  (Spec-Szenario "Job with no evidence-catalog overlap receives the default fallback score").

**GREEN — Fix-Step:**

Erstelle `scripts/vda/apply/match.sh`. Parameter: `--job-id <id>` (Pflicht). Ablauf:
1. Requirements-Text des Jobs per psql-Helper laden.
2. `source scripts/lib/application-pipeline-evidence.sh; app_pipeline_select_evidence "$requirements"`
   (Phase 3) aufrufen — liefert die passenden Katalog-Einträge inkl. Keyword-Trefferzahl je Eintrag.
3. Score-Formel: `score = min(100, treffer_summe * 20)` (deterministisch, keine externen
   Abhängigkeiten) — bei leerem Treffer-Set (Default-Pfad aus Task 1 der Evidence-Katalog-Logik)
   liegt der Score beim dokumentierten Default (20, ein einzelner Default-Eintrag).
4. `UPDATE applications.jobs SET match_score = $1, match_evidence_ids = $2 WHERE id = $3` über
   `pool`/psql-Helper.

Run des BATS-Tests aus dem RED-Step muss jetzt vollständig GREEN sein (alle drei Szenarien).

## Task 3: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil eine neue Test-Datei angelegt wurde:

```bash
task test:inventory   # components/website/src/data/test-inventory.json committen
```

<!-- vitest: kein neuer Test nötig, weil dieser Plan ausschließlich SQL-Migration, Bash-CLI und
BATS-Tests umfasst, keine Dateien unter components/website/src/lib/** oder .../pages/api/** -->
