---
title: "p1 — Eval-Set erweitern, Baseline-Artefakt erzeugen, ADR-009 landen"
ticket_id: T900448
domains: [brain, eval]
status: active
---

# p1 — Eval-Set erweitern, Baseline-Artefakt erzeugen, ADR-009 landen

Files: `tests/fixtures/brain/retrieval-eval.jsonl`, `tests/fixtures/brain/retrieval-baseline.json` (neu), `docs/adr/ADR-009-brain-3layer-architektur.md` (target_files dieses Partials; disjunkt zu p2/p3).

## S1-Budgets (Messung 2026-09-26, Branch feature/brain-eval-baseline-T900448)

Messbefehle (Pflichtquellen aus plan-quality-gates.md):

```bash
wc -l tests/fixtures/brain/retrieval-eval.jsonl docs/adr/ADR-009-brain-3layer-architektur.md
for f in tests/fixtures/brain/retrieval-eval.jsonl tests/fixtures/brain/retrieval-baseline.json docs/adr/ADR-009-brain-3layer-architektur.md; do
  echo -n "$f baseline="; jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json
done
grep -A15 '  limits:' docs/code-quality/gates.yaml
bash scripts/plan-lint.sh residual_budget tests/fixtures/brain/retrieval-eval.jsonl
```

Ergebnis:

| Datei | Ist (wc -l) | S1-Schwelle | Restbudget |
|---|---|---|---|
| `tests/fixtures/brain/retrieval-eval.jsonl` | 2 | keine — Extension `.jsonl` hat kein s1.limits-Limit, kein Baseline-Eintrag | n/a (S1-ungated, `residual_budget` leer) |
| `tests/fixtures/brain/retrieval-baseline.json` | Datei existiert noch nicht | keine — Extension `.json` hat kein s1.limits-Limit, kein Baseline-Eintrag | n/a (S1-ungated, neue Datei, einzeiliges JSON) |
| `docs/adr/ADR-009-brain-3layer-architektur.md` | 78 | keine — Extension `.md` hat kein s1.limits-Limit, kein Baseline-Eintrag | n/a (S1-ungated, Inhalt unverändert per git add) |

Das S1-Gate misst keine dieser drei Dateien (B1b greift nicht, kein Split nötig). Neue Datei (`retrieval-baseline.json`) bleibt als einzeiliges Informationsartefakt bewusst klein.

## Task 1.1: Eval-Set von 2 auf 12 Cases erweitern

Kontext: Runner `scripts/brain-retrieval-eval.py` verlangt pro JSONL-Zeile `id` (eindeutig, nicht-leer), `query` (nicht-leer), `relevant_slugs` (nicht-leere Liste ohne Duplikate); optional `top_k` (positiv) und `filters` (nur Keys `type/tags/status/source_kind/as_of`, sonst Exit 2). Slugs sind Wiki-Dateistemme (`path.stem`, verifiziert in `scripts/brain-index.py`). Alle Queries unten wurden am 2026-09-26 gegen `/home/patrick/brain/wiki` (677 Seiten, alle `status: active`, keine Seite mit `valid_until`) verifiziert; Ränge beziehen sich auf diesen Stand.

1. Die zwei bestehenden Zeilen (`brain-foundation`, `brain-runbook`) unverändert lassen.
2. Zehn neue Zeilen anhängen (je ein JSON-Objekt pro Zeile, `top_k: 5`):

| id | query | filters | relevant_slugs | verifizierter Treffer |
|---|---|---|---|---|
| `adr-fleet` | fleet konsolidierung adr | `{"source_kind":"adr"}` | `["docs-adr-adr-001-fleet-konsolidierung-001"]` | Rang 1 |
| `adr-merge` | merge equals closure definition done | `{"source_kind":"adr"}` | `["docs-adr-adr-005-merge-equals-abschluss-001"]` | Rang 1 |
| `diagram-schema` | database schema diagram tickets | `{"source_kind":"diagram"}` | `["docs-db-schema-diagram-001"]` | Rang 1 |
| `core-agents` | agent routing orchestrator subagent | `{"source_kind":"core-doc"}` | `["agents-001"]` | Rang 2 |
| `specs-deploy` | sealed secrets gitops flux | `{}` | `["openspec-specs-workspace-deploy-005"]` | Rang 1, ohne Filter |
| `health-goal` | health goal vitest coverage | `{"source_kind":"health-goal"}` | `["claude-lib-goals-009"]` | Rang 1 |
| `filter-tags` | fleet konsolidierung | `{"source_kind":"adr","tags":["fleet-konsolidierung"]}` | `["docs-adr-adr-001-fleet-konsolidierung-001"]` | einziger Treffer |
| `filter-type` | brain ingest runbook | `{"source_kind":"runbook","type":"moc"}` | `["docs-runbooks-brain-ingest"]` | einziger Treffer |
| `asof-in-window` | fleet konsolidierung adr | `{"source_kind":"adr","as_of":"2026-09-26"}` | `["docs-adr-adr-001-fleet-konsolidierung-001"]` | Rang 1, alle Treffer `current` |
| `asof-out-window` | fleet konsolidierung adr | `{"source_kind":"adr","as_of":"2020-01-01"}` | `["docs-adr-adr-001-fleet-konsolidierung-001"]` | keine Treffer — `as_of` liegt vor allen `valid_from`, `_matches` schließt `future` aus |

Damit ist je ein Case pro Wiki-Gruppe runbooks/adr/specs/diagrams/core-docs enthalten, plus zwei `as_of`-Fälle und zwei Feld-Filter-Fälle (D2 aus design.md). Der `asof-out-window`-Case dokumentiert bewusst Exklusion statt Treffer: erwartetes Ergebnis `returned_results: 0`, `recall_at_k: 0.0` bei Runner-Exit 0 (kein Threshold-Gate). Da keine Wiki-Seite `valid_until` trägt, ist das Freshness-Label `stale` gegen das echte Wiki unerreichbar; der `stale_results`-Zähler bleibt 0 und der Out-of-Window-Case belegt stattdessen den `as_of`-Ausschlusspfad.
3. Set validieren:
   ```bash
   test "$(wc -l < tests/fixtures/brain/retrieval-eval.jsonl | tr -d ' ')" = "12"
   python3 -c "import json; [json.loads(l) for l in open('tests/fixtures/brain/retrieval-eval.jsonl') if l.strip()]; print('jsonl ok')"
   test -z "$(jq -r .id tests/fixtures/brain/retrieval-eval.jsonl | sort | uniq -d)"
   python3 scripts/brain-retrieval-eval.py --wiki-dir "$HOME/brain/wiki" --eval-set tests/fixtures/brain/retrieval-eval.jsonl --top-k 5 --format human
   echo "runner-exit=$?"
   ```
   Assertion: alle vier Befehle Exit 0; 12 Cases; 11 Treffer-Cases mit `Recall@k=1.000000`; `asof-out-window` mit `Recall@k=0.000000 returned=0`; Summary mit `stale=0`. Weicht ein Treffer-Case von Recall 1.0 ab, ist das Wiki seit 2026-09-26 gedriftet: `returned_slugs`-Diff prüfen und sichtbar machen (R2 aus design.md), nicht still übernehmen.

## Task 1.2: Baseline-Artefakt als JSON-Informationsartefakt erzeugen

Einmaliger Runner-Lauf gegen das echte Wiki, als committed JSON abgelegt (D3 aus design.md; kein Gate-Input, keine Threshold-Prüfung irgendwo).

1. Artefakt erzeugen:
   ```bash
   python3 scripts/brain-retrieval-eval.py --wiki-dir "$HOME/brain/wiki" --eval-set tests/fixtures/brain/retrieval-eval.jsonl --top-k 5 --format json > tests/fixtures/brain/retrieval-baseline.json
   echo "runner-exit=$?"
   ```
   Assertion: Exit 0, Datei nicht-leer, einzeiliges JSON (`sort_keys=True` im Runner).
2. Inhalt asserten (Erwartungswerte am Wiki-Stand 2026-09-26: 11 von 12 Cases Recall 1.0, MRR aus Rängen 2,3,1,1,1,2,1,1,1,1,1,kein Treffer):
   ```bash
   jq -e '.schema_version == 1 and .case_count == 12 and .metrics.recall_at_k == 0.916667 and .metrics.mrr == 0.777778 and .metrics.stale_results == 0' tests/fixtures/brain/retrieval-baseline.json
   ```
   Assertion: Exit 0. Bei Drift gilt die Task-1.1-Regel: Diff sichtbar machen, nicht still übernehmen.
3. Determinismus belegen (Byte-identische Wiederholbarkeit):
   ```bash
   python3 scripts/brain-retrieval-eval.py --wiki-dir "$HOME/brain/wiki" --eval-set tests/fixtures/brain/retrieval-eval.jsonl --top-k 5 --format json > /tmp/p1-baseline-rerun.json
   cmp tests/fixtures/brain/retrieval-baseline.json /tmp/p1-baseline-rerun.json
   ```
   Assertion: Exit 0 (identische Bytes; Begründung: sortierte Seiten-Iteration, `sort_keys`, gerundete Scores, `as_of`-Fixpunkte statt Wanduhr für die Freshness-Filter).
4. Offline-Eigenschaft belegen:
   ```bash
   test -z "$(grep -n 'socket\|urllib\|requests\|http\.client\|httpx' scripts/brain-retrieval-eval.py scripts/brain-index.py)"
   ```
   Assertion: Exit 0 (Runner und Index lesen nur lokale Pfade `--wiki-dir`/`--eval-set`, kein Netz-Import).

## Task 1.3: ADR-009 per git add landen

`docs/adr/ADR-009-brain-3layer-architektur.md` (Status Final, 78 Zeilen, Ticket T900447) liegt untracked im Worktree und wird inhaltlich unverändert aufgenommen; kein Index-Update nötig — `docs/adr/` enthält nur ADR-001 bis ADR-009-Dateien, keinen Index.

```bash
git status --short -- docs/adr/ADR-009-brain-3layer-architektur.md
test -z "$(ls docs/adr | grep -i index)"
git add docs/adr/ADR-009-brain-3layer-architektur.md
git status --short -- docs/adr/ADR-009-brain-3layer-architektur.md
test "$(wc -l < docs/adr/ADR-009-brain-3layer-architektur.md | tr -d ' ')" = "78"
```

Assertion: erster Status zeigt `??`, nach `git add` zeigt er `A`; alle Befehle Exit 0.

## Akzeptanzkriterien

- `tests/fixtures/brain/retrieval-eval.jsonl` hat 12 valide Cases (Schema des Runners, Exit 0 im Human-Lauf), alle Slugs real und am Wiki-Stand 2026-09-26 verifiziert.
- `tests/fixtures/brain/retrieval-baseline.json` ist committed, `case_count` 12, Metriken wie in Task 1.2 assertiert, informationshalber ohne Gate-Wirkung.
- Zwei aufeinanderfolgende Runner-Läufe sind byte-identisch (Determinismus); Runner und Index importieren kein Netz-Modul (Offline).
- `docs/adr/ADR-009-brain-3layer-architektur.md` ist per `git add` aufgenommen, Inhalt unverändert.
- Keine andere Datei wurde angefasst (disjunkte target_files; BATS-Verdrahtung und Verify-Gates gehören zu p3 bzw. zum Index).
