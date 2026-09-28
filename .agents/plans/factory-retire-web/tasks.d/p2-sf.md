# p2 — Factory-Reste entfernen (2/4)

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

- `components/website/src/components/sdlc/factory/FloorControlCard.svelte`
- `components/website/src/components/sdlc/factory/InsightsTab.svelte`
- `components/website/src/components/sdlc/factory/KiRoutingPanel.svelte`
- `components/website/src/components/sdlc/factory/KillSwitchCard.svelte`
- `components/website/src/components/sdlc/factory/LavishDelegationCard.svelte`
- `components/website/src/components/sdlc/factory/LlmLoadoutPanel.svelte`
- `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte`
- `components/website/src/components/sdlc/factory/MobileTabBar.svelte`
- `components/website/src/components/sdlc/factory/PhaseBadge.svelte`
- `components/website/src/components/sdlc/factory/PhaseStepper.svelte`
- `components/website/src/components/sdlc/factory/PilotLight.svelte`
- `components/website/src/components/sdlc/factory/ShippedColumn.svelte`
- `components/website/src/components/sdlc/factory/ShippedColumn.test.ts`
- `components/website/src/components/sdlc/factory/SlotCapCard.svelte`
- `components/website/src/components/sdlc/factory/SpawnHarnessCard.svelte`
- `components/website/src/components/sdlc/factory/StagedColumn.svelte`
- `components/website/src/components/sdlc/factory/StationColumn.svelte`
- `components/website/src/components/sdlc/factory/StatusStrip.svelte`
- `components/website/src/components/sdlc/factory/SuggestedFiles.svelte`
- `components/website/src/components/sdlc/factory/WorkpieceCard.svelte`
- `components/website/src/components/sdlc/factory/factory-chart-colors.ts`
- `components/website/src/components/sdlc/factory/mobile-tab-bar-constants.ts`
- `components/website/src/components/sdlc/factory/types.ts`
- `components/website/src/db/migrations/20260804_cockpit_notify_triggers.sql`
- `components/website/src/lib/factory-constants.test.ts`
- `components/website/src/lib/factory-constants.ts`
- `components/website/src/lib/factory-floor-lanes.test.ts`
- `components/website/src/lib/factory-floor-lanes.ts`
- `components/website/src/lib/factory-floor-types.ts`

## Abschluss

```bash
bats tests/spec/sf-retirement-web.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
