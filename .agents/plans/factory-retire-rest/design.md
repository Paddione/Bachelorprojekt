# factory-retire-rest — Design (T900728)

Die Software Factory ist seit T900399 stillgelegt. Dieser Plan entfernt die verbliebenen Reste außerhalb der Website (CI, Skripte, Taskfiles, Env, Tests, Doku, Skills). `FACTORY-PLAN-REF` bleibt, das Plan-Staging hängt daran.

Ausgenommen (Historie/generiert, nicht anfassen): `docs/superpowers/`, `docs/adr/`, `.agents/docs/reorg-phase2/`, `.agents/plans/`, `.agents/memory/`, `scripts/migrations/`, `CHANGELOG.md`, `docs/generated/`, `docs/code-quality/repo-index.json`, `components/website/src/data/{test,api}-inventory.json`, `goals-data.generated.json`. Generierte Dateien regeneriert `task freshness:regenerate`.

## Messung

```bash
PRE=b4612a29a5bc02842f7019d3a08ecb3ce5ef74e0
git grep -l -i -E 'software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:' "$PRE" -- . ':!openspec' | wc -l
```

Die Dateilisten `tests/fixtures/sf-retirement/rest.txt` (287 Dateien) sind gegen `$PRE` erzeugt. Dateien, die zwischenzeitlich weggefallen sind, überspringen. Neu hinzugekommene Treffer gehören in ein Folge-Ticket.
