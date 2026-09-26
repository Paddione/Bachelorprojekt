---
title: "p-tests — Detection tests with stubbed gh"
ticket_id: T900503
domains: [ci, openspec]
status: active
---

# p-tests — Detection tests with stubbed gh

Files: `tests/spec/openspec-workflow/orphan-detect.bats` (target_files dieses Partials; disjunkt zu p1; läuft nach p1).

## Task T.1: RED — Detection-Tests schreiben, Scheitern nachweisen

1. `tests/spec/openspec-workflow/orphan-detect.bats` neu anlegen. `gh` als
   Stub im `PATH`-Stubdir (Muster: argv-abhängige Fixture-Antworten wie in
   `hermes-mcp-access.bats`): contents-Aufrufe liefern zwei Slugs (einer
   verwaist, einer WIP), `.ticket`-Aufrufe liefern Tids, PR-Suchen liefern
   je nach Query Treffer oder Leere, commits-Aufrufe liefern alte und junge
   Daten.
2. Fälle: verwaister Slug wird selektiert; Slug ohne gemergten Fix-PR wird
   mit Grund geskippt; zu junger Slug wird geskippt; Slug mit offenem PR
   wird geskippt; `--dry-run` schreibt keine Slug-Zeile nach stdout.
3. RED-Nachweis vor p1 — expected: FAIL: `bats
   tests/spec/openspec-workflow/orphan-detect.bats` ist rot (Skript fehlt).

## Task T.2: GREEN — Tests gegen p1 verifizieren

1. Nach p1: `bats tests/spec/openspec-workflow/orphan-detect.bats` ist grün.
2. `task test:inventory` laufen lassen und
   `components/website/src/data/test-inventory.json` mitcommitten (neue
   Testdatei im CI-Inventar).

## Verify (Partial)

```bash
bats tests/spec/openspec-workflow/orphan-detect.bats
task test:changed
task freshness:regenerate
task freshness:check
```
