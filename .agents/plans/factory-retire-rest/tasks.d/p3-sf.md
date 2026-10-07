# p3 — Factory-Reste entfernen (3/8)

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

- `scripts/arbitration/synthesize.mjs`
- `scripts/bge-mcp/server.mjs`
- `scripts/build-test-inventory.sh`
- `scripts/check-pod-phase-filter.sh`
- `scripts/code-quality/baseline-key-count-assertion.mjs`
- `scripts/code-quality/loop.sh`
- `scripts/devflow-build-loop.sh`
- `scripts/factory-task-packet.sh`
- `scripts/find-changed-e2e-tests.sh`
- `scripts/find-changed-tests.sh`
- `scripts/finetune/README.md`
- `scripts/finetune/collect_factory_traces.py`
- `scripts/finetune/collect_teacher_traces.py`
- `scripts/finetune/export_gguf.py`
- `scripts/generate-bitwarden-export.py`
- `scripts/glimmer-worker-mcp/server.mjs`
- `scripts/hooks/precompact-prune.sh`
- `scripts/install-dev-tools.sh`
- `scripts/lib/application-pipeline-db.sh`
- `scripts/lib/llm-stack-measure.sh`
- `scripts/lib/mcp-http-security.mjs`
- `scripts/lib/mcp-http-security.test.mjs`
- `scripts/lib/ticket-help.sh`
- `scripts/llm-proxy/backends.mjs`
- `scripts/llm-proxy/factory-pin.test.mjs`
- `scripts/llm-proxy/fixups.mjs`
- `scripts/llm-proxy/request-log.mjs`
- `scripts/llm-proxy/request-log.test.mjs`
- `scripts/llm-proxy/runner.mjs`
- `scripts/llm-proxy/runner.test.mjs`
- `scripts/llm/agent-bench/cases/f1-store-cleanup/source.md`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/brief.md`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/checks/run.sh`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/p1.md`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/tasks.md`
- `scripts/llm/agent-bench/lib/recorder.mjs`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
