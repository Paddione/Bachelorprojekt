# p1 — Factory-Reste entfernen (1/4)

Ticket: T900727. Kontext: `design.md`. 29 Dateien.

## Regeln

Die Software Factory ist seit T900399 stillgelegt. Reste entfernen.

**Bleibt unangetastet:** `FACTORY-PLAN-REF` (Format des Plan-Verweises in Tickets, von
`ticket.sh stage-plan` und `dev-flow-execute` genutzt), das Wort „factory“ in fremder Bedeutung
(Factory-Funktion, Test-Factory, Hersteller).

Pro Datei die erste passende Regel:

1. **Datei gehört nur zur Factory** (Pfad enthält `factory`, z. B. `sdlc/factory/*.svelte`,
   `tests/factory-eval/`, `build-factory-runner.yml`) → `git rm`. Importe/Aufrufer in anderen Dateien
   derselben Liste mit entfernen.
2. **Code-Zweig, Route, Task, CI-Job, Env-/Secret-Eintrag nur für die Factory** → entfernen.
   Bei `environments/sealed-secrets/*.yaml` den verschlüsselten Key und den passenden Eintrag in
   `environments/schema.yaml` entfernen, nichts neu versiegeln.
3. **Test prüft Factory-Verhalten** → `@test` löschen, leere Datei löschen.
4. **Prosa/Kommentar** → Factory-Satz streichen.

Nach jeder Datei: `grep -inE 'software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:' <datei> | grep -v FACTORY-PLAN-REF` ist leer (oder Datei gelöscht).
Für Website-Dateien danach `cd components/website && pnpm exec astro check` bzw. die betroffenen Vitest-Dateien.

## Dateien

- `components/website/all_files.txt`
- `components/website/public/cockpit/MANIFEST.md`
- `components/website/public/cockpit/icons/enqueue-factory.svg`
- `components/website/public/factory/MANIFEST.md`
- `components/website/src/components/DependencyGraph.svelte`
- `components/website/src/components/PlanningOffice.svelte`
- `components/website/src/components/PortalSidekick.svelte`
- `components/website/src/components/PortalSidekick.test.ts`
- `components/website/src/components/assistant/PipelineSidekickView.svelte`
- `components/website/src/components/assistant/PipelineSidekickView.test.ts`
- `components/website/src/components/leitstand/Kontextzone.svelte`
- `components/website/src/components/leitstand/LeitstandStatusband.svelte`
- `components/website/src/components/leitstand/decks/DeckKi.svelte`
- `components/website/src/components/leitstand/decks/DeckPlattform.svelte`
- `components/website/src/components/sdlc/FactoryFloor.svelte`
- `components/website/src/components/sdlc/FactoryFloorLane.svelte`
- `components/website/src/components/sdlc/factory/AttentionStrip.svelte`
- `components/website/src/components/sdlc/factory/AwaitingDeployLane.svelte`
- `components/website/src/components/sdlc/factory/ContextBudgetCard.svelte`
- `components/website/src/components/sdlc/factory/ControlCard.svelte`
- `components/website/src/components/sdlc/factory/ControlPanel.svelte`
- `components/website/src/components/sdlc/factory/ConveyorBelt.svelte`
- `components/website/src/components/sdlc/factory/DailyCapCard.svelte`
- `components/website/src/components/sdlc/factory/DetailPanel.svelte`
- `components/website/src/components/sdlc/factory/DetailPanelSidebar.svelte`
- `components/website/src/components/sdlc/factory/DryRunCard.svelte`
- `components/website/src/components/sdlc/factory/FactoryBudgetPage.svelte`
- `components/website/src/components/sdlc/factory/FactoryKpiCard.svelte`
- `components/website/src/components/sdlc/factory/FactoryObservability.svelte`

## Abschluss

```bash
bats tests/spec/sf-retirement-web.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
