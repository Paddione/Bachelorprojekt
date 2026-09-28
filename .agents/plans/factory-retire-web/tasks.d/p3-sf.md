# p3 — Factory-Reste entfernen (3/4)

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

- `components/website/src/lib/markdown.ts`
- `components/website/src/lib/parallel-status.ts`
- `components/website/src/lib/qa-dal.ts`
- `components/website/src/lib/sdlc/factory-budget.test.ts`
- `components/website/src/lib/sdlc/factory-budget.ts`
- `components/website/src/lib/sdlc/factory-ci.test.ts`
- `components/website/src/lib/sdlc/factory-ci.ts`
- `components/website/src/lib/sdlc/factory-floor-client.test.ts`
- `components/website/src/lib/sdlc/factory-floor-client.ts`
- `components/website/src/lib/sdlc/factory-floor-filters.ts`
- `components/website/src/lib/sdlc/factory-floor.order.test.ts`
- `components/website/src/lib/sdlc/factory-floor.test.ts`
- `components/website/src/lib/sdlc/factory-floor.ts`
- `components/website/src/lib/sdlc/factory-metrics-derive.test.ts`
- `components/website/src/lib/sdlc/factory-metrics-derive.ts`
- `components/website/src/lib/sdlc/factory-metrics.test.ts`
- `components/website/src/lib/sdlc/factory-metrics.ts`
- `components/website/src/lib/sdlc/factory-observability.test.ts`
- `components/website/src/lib/sdlc/factory-observability.ts`
- `components/website/src/lib/sdlc/health-goal-tickets.ts`
- `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`
- `components/website/src/lib/sdlc/llm-proxy-factory.ts`
- `components/website/src/lib/sdlc/tickets/cockpit-db.ts`
- `components/website/src/lib/session-agent-factory.test.ts`
- `components/website/src/lib/session-agent-factory.ts`
- `components/website/src/lib/stores/factory-floor-store.test.ts`
- `components/website/src/lib/stores/factory-floor-store.ts`
- `components/website/src/lib/stores/help-overlay-store.ts`
- `components/website/src/lib/tickets-db.test.ts`

## Abschluss

```bash
bats tests/spec/sf-retirement-web.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
