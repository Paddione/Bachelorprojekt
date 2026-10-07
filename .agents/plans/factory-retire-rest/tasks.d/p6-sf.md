# p6 — Factory-Reste entfernen (6/8)

Ticket: T900728. Kontext: `design.md`. 36 Dateien.

## Regeln

Die Software Factory ist seit T900399 stillgelegt. Reste entfernen.

**Bleibt unangetastet:**
- `FACTORY-PLAN-REF` (Format des Plan-Verweises in Tickets, von `ticket.sh stage-plan` und
  `dev-flow-execute` genutzt).
- DB-Objekte, die in der Live-DB noch existieren: `tickets.factory_phase_events` (Phase-Chain von
  dev-flow-execute, `ticket.sh phase`, `assert-phase-chain`), `tickets.factory_control`,
  `tickets.factory_model_slots`, `tickets.factory_run_budget`, `tickets.v_factory_metrics`,
  `factory_schema_migrations`. Code, der sie für noch genutzte Funktionen liest oder schreibt, bleibt.
  Tabellen löschen braucht eine eigene Migration (Folge-Ticket, nicht hier).
- Das Wort „factory“ in fremder Bedeutung (Factory-Funktion, Test-Factory, Hersteller).

Pro Datei die erste passende Regel:

1. **Datei gehört nur zur Factory** (Pfad enthält `factory`, z. B. `sdlc/factory/*.svelte`,
   `tests/factory-eval/`, `build-factory-runner.yml`) → `git rm`. Importe/Aufrufer in anderen Dateien
   derselben Liste mit entfernen.
2. **Code-Zweig, Route, Task, CI-Job, Env-/Secret-Eintrag nur für die Factory** → entfernen.
   Bei `environments/sealed-secrets/*.yaml` den verschlüsselten Key und den passenden Eintrag in
   `environments/schema.yaml` entfernen, nichts neu versiegeln.
3. **Test prüft Factory-Verhalten** → `@test` löschen, leere Datei löschen.
4. **Prosa/Kommentar** → Factory-Satz streichen.

Nach jeder Datei: `grep -inE 'software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:' <datei> | grep -vE 'FACTORY-PLAN-REF|tickets\.(v_)?factory_|factory_schema_migrations'` ist leer (oder Datei gelöscht).
Für Website-Dateien danach `cd components/website && pnpm exec astro check` bzw. die betroffenen Vitest-Dateien.

## Dateien

- `tests/factory-eval/fixtures/T000725/expected.json`
- `tests/factory-eval/fixtures/T000725/ticket.json`
- `tests/factory-eval/fixtures/T000726/expected.json`
- `tests/factory-eval/fixtures/T000726/ticket.json`
- `tests/factory-eval/fixtures/T000925/expected.json`
- `tests/factory-eval/fixtures/T000925/ticket.json`
- `tests/factory-eval/fixtures/T001894/expected.json`
- `tests/factory-eval/fixtures/T001894/meta.json`
- `tests/factory-eval/fixtures/T001894/ticket.json`
- `tests/factory-eval/fixtures/T001935/expected.json`
- `tests/factory-eval/fixtures/T001935/meta.json`
- `tests/factory-eval/fixtures/T001935/ticket.json`
- `tests/factory-eval/fixtures/T001940/expected.json`
- `tests/factory-eval/fixtures/T001940/meta.json`
- `tests/factory-eval/fixtures/T001940/ticket.json`
- `tests/factory-eval/fixtures/T001956/expected.json`
- `tests/factory-eval/fixtures/T001956/meta.json`
- `tests/factory-eval/fixtures/T001956/ticket.json`
- `tests/factory-eval/fixtures/T001977/expected.json`
- `tests/factory-eval/fixtures/T001977/meta.json`
- `tests/factory-eval/fixtures/T001977/ticket.json`
- `tests/fixtures/context-retrieve/golden-queries.json`
- `tests/fixtures/mishap-dedupe-korpus.json`
- `tests/fixtures/task-context-channel/intel.json`
- `tests/fixtures/task-context-channel/proposal.md`
- `tests/fixtures/task-context-channel/tasks.d/p3-gate-wiring.md`
- `tests/fixtures/task-context-channel/tasks.md`
- `tests/lib/factory-test-fixtures.sh`
- `tests/local/FA-AR-01-filter-diff.bats`
- `tests/local/FA-AR-02-classify-risk.bats`
- `tests/local/learning-db-schema.bats`
- `tests/spec/.spec-runtime.tsv`
- `tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats`
- `tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats`
- `tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats`
- `tests/spec/agent-skills/worktree-remove-managed.bats`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
