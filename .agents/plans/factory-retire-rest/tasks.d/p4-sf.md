# p4 — Factory-Reste entfernen (4/8)

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

- `scripts/llm/bench-ifstruct.sh`
- `scripts/llm/measure-factory-context.mjs`
- `scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md`
- `scripts/llm/routing-check.sh`
- `scripts/llm/start-gptoss-server.ps1`
- `scripts/llm/ui-config-seed.mjs`
- `scripts/llm/ui-config-seed.test.mjs`
- `scripts/mcp-gateway/doctor.sh`
- `scripts/mcp-gateway/start-mcp-unified.sh`
- `scripts/mcp-gateway/token-drift-heal.sh`
- `scripts/migrate-db.mjs`
- `scripts/migrate-factory.mjs`
- `scripts/one-shot/2026-07-21-feature-product-backfill.mjs`
- `scripts/one-shot/purge-fn-v8.sql`
- `scripts/opencode-plugins/mcp-client-tokens-env.ts`
- `scripts/openspec-atlas-groups.yaml`
- `scripts/openspec-embed-local.sh`
- `scripts/plan-touched-files.sh`
- `scripts/repo-hygiene-cron.sh`
- `scripts/repo-hygiene-precheck.sh`
- `scripts/rig_for_mixamo.py`
- `scripts/runtime-drift-check.sh`
- `scripts/sdlc-cockpit-smoke.mjs`
- `scripts/sdlc/api-inventory.mjs`
- `scripts/ticket-mcp-node/server.mjs`
- `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go`
- `scripts/ticket-mcp/go/internal/tools/list.go`
- `scripts/ticket-mcp/go/internal/tools/planning.go`
- `scripts/ticket-mcp/go/internal/tools/planning_test.go`
- `scripts/ticket-mcp/go/internal/tools/workflow.go`
- `scripts/ticket-reclaim.sh`
- `scripts/ticket-status-validate.sh`
- `scripts/ticket.sh`
- `scripts/triage/few-shot-examples.json`
- `scripts/vda/apply/evidence-catalog.yaml`
- `scripts/vda/factory-prep.sh`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
