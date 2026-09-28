# p7 — Factory-Reste entfernen (7/8)

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

- `tests/spec/application-pipeline/evidence-catalog.bats`
- `tests/spec/application-pipeline/import-bootstrap.bats`
- `tests/spec/application-pipeline/ingest-cli.bats`
- `tests/spec/application-pipeline/match-scoring.bats`
- `tests/spec/application-pipeline/schema.bats`
- `tests/spec/batch-repo-hygiene-ops-fixes.bats`
- `tests/spec/ci-cd.bats`
- `tests/spec/ci-cd/branch-reaper.bats`
- `tests/spec/ci-cd/changed-tests-collection-parity.bats`
- `tests/spec/ci-cd/changed-tests-env-hermetic.bats`
- `tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats`
- `tests/spec/ci-cd/factory-shard-optimization.bats`
- `tests/spec/ci-cd/hybrid-runner-placement.bats`
- `tests/spec/ci-cd/mishap-t002425.bats`
- `tests/spec/ci-cd/spec-dir-convention.bats`
- `tests/spec/ci-cd/test-inventory-coverage.bats`
- `tests/spec/database.bats`
- `tests/spec/dev-flow-plan/task-context.bats`
- `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats`
- `tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats`
- `tests/spec/factory/vda-frontmatter.bats`
- `tests/spec/harness-workflow-split/harness-enum.bats`
- `tests/spec/health-goals/goals-data-path-consistency.bats`
- `tests/spec/health-goals/llm-stack-goals.bats`
- `tests/spec/llm-local-dev/comfy-image-mcp.bats`
- `tests/spec/llm-local-dev/glimmer-serving-profile.bats`
- `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`
- `tests/spec/llm-local-dev/opencode-compaction.bats`
- `tests/spec/local-llm-proxy.bats`
- `tests/spec/local-llm-proxy/dispatch-capture.bats`
- `tests/spec/local-llm-proxy/factory-model-lock.bats`
- `tests/spec/local-llm-proxy/ui-config-seed.bats`
- `tests/spec/mcp-gateway.bats`
- `tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats`
- `tests/spec/mcp-tooling.bats`
- `tests/spec/merge-arbitration/apply-escalation.bats`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
