# p4 — Factory-Reste entfernen (4/4)

Ticket: T900727. Kontext: `design.md`. 29 Dateien.

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

- `components/website/src/lib/tickets-schema.ts`
- `components/website/src/lib/tickets/cockpit-labels.ts`
- `components/website/src/lib/tickets/migrations.ts`
- `components/website/src/lib/tickets/pipeline-order.ts`
- `components/website/src/lib/tickets/tables/factory-control.ts`
- `components/website/src/lib/tickets/tables/tickets.ts`
- `components/website/src/middleware/redirect-map.test.ts`
- `components/website/src/middleware/redirect-map.ts`
- `components/website/src/pages/sdlc/api/cockpit/actions.test.ts`
- `components/website/src/pages/sdlc/api/cockpit/actions.ts`
- `components/website/src/pages/sdlc/api/factory-budget.ts`
- `components/website/src/pages/sdlc/api/factory-control.ts`
- `components/website/src/pages/sdlc/api/factory-floor.ts`
- `components/website/src/pages/sdlc/api/factory-floor/[extId].ts`
- `components/website/src/pages/sdlc/api/factory-floor/[extId]/ci.ts`
- `components/website/src/pages/sdlc/api/factory-floor/[extId]/deploy.ts`
- `components/website/src/pages/sdlc/api/factory-floor/[extId]/inject.ts`
- `components/website/src/pages/sdlc/api/factory-floor/[extId]/release.ts`
- `components/website/src/pages/sdlc/api/factory-floor/ci.test.ts`
- `components/website/src/pages/sdlc/api/factory-floor/inject.test.ts`
- `components/website/src/pages/sdlc/api/factory-floor/stream.ts`
- `components/website/src/pages/sdlc/api/factory-metrics.ts`
- `components/website/src/pages/sdlc/api/factory-observability.ts`
- `components/website/src/pages/sdlc/api/factory/force-tick.ts`
- `components/website/src/pages/sdlc/api/factory/parallel-status.ts`
- `components/website/src/pages/sdlc/api/llm-proxy/factory.test.ts`
- `components/website/src/pages/sdlc/api/llm-proxy/factory.ts`
- `components/website/src/pages/sdlc/cockpit.astro`
- `components/website/vitest.config.ts`

## Abschluss

```bash
bats tests/spec/sf-retirement-web.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
