# p5 — Factory-Reste entfernen (5/8)

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

- `scripts/vda/factory.sh`
- `scripts/vda/factory/slots.sh`
- `scripts/vda/ticket.sh`
- `scripts/vda/ticket/_devmesh-guard.sh`
- `scripts/vda/ticket/_ticket-core.sh`
- `scripts/vda/ticket/assert-phase-chain.sh`
- `scripts/vda/ticket/backfill-id.sh`
- `scripts/vda/ticket/enqueue.sh`
- `scripts/vda/ticket/list.sh`
- `scripts/vda/ticket/stage-plan.sh`
- `scripts/vda/ticket/update-status.sh`
- `scripts/worktree-create.sh`
- `scripts/worktree-list.sh`
- `taskfiles/Taskfile.brain.yaml`
- `taskfiles/Taskfile.finetune.yml`
- `taskfiles/Taskfile.openclaw.yml`
- `taskfiles/Taskfile.process.yml`
- `taskfiles/Taskfile.test.yml`
- `templates/application-pipeline/cover-letter.typ`
- `templates/application-pipeline/resume.typ`
- `tests/README.md`
- `tests/e2e/playwright.config.ts`
- `tests/e2e/playwright.local.config.ts`
- `tests/e2e/playwright.pr.config.ts`
- `tests/e2e/specs/dev-status-tabs.spec.ts`
- `tests/e2e/specs/fa-48-factory-devflow.spec.ts`
- `tests/e2e/specs/fa-49-factory-observability.spec.ts`
- `tests/e2e/specs/fa-58-admin-cockpit.spec.ts`
- `tests/e2e/specs/fa-60-realtime-ws.spec.ts`
- `tests/e2e/specs/fa-factory-floor.spec.ts`
- `tests/e2e/specs/fa-factory-injection.spec.ts`
- `tests/e2e/specs/fa-kommissionierung.spec.ts`
- `tests/e2e/specs/fa-mobile-factory.spec.ts`
- `tests/e2e/specs/fa-qa-review.spec.ts`
- `tests/e2e/specs/fa-scs-scout.spec.ts`
- `tests/evals/golden/task-list-all.txt`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
