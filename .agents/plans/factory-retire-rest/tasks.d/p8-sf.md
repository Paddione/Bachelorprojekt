# p8 — Factory-Reste entfernen (8/8)

Ticket: T900728. Kontext: `design.md`. 35 Dateien.

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

- `tests/spec/openspec-pgvector/context-retrieve-cli.bats`
- `tests/spec/openspec-workflow/spec-atlas-generator.bats`
- `tests/spec/pipeline-interface.bats`
- `tests/spec/repo-hygiene/dead-path-references.bats`
- `tests/spec/repo-hygiene/precheck-foreign-session.bats`
- `tests/spec/repo-hygiene/windows-guards.bats`
- `tests/spec/repo-structure/website-moved.bats`
- `tests/spec/scripts/worktree-list.bats`
- `tests/spec/sdlc-cockpit/api-inventory-drift.bats`
- `tests/spec/sdlc-cockpit/daemon-endpoints.bats`
- `tests/spec/sdlc-cockpit/deck-kompakt-layout.bats`
- `tests/spec/sdlc-cockpit/endpoint-host-map.bats`
- `tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats`
- `tests/spec/sdlc-cockpit/leitstand-livedaten.bats`
- `tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats`
- `tests/spec/sdlc-cockpit/redesign-struktur.bats`
- `tests/spec/selection-integrity/live-snapshot.txt`
- `tests/spec/software-factory/decommission-guard.bats`
- `tests/spec/ticket-mcp.bats`
- `tests/spec/ticket-mcp/phase-events-at-column.bats`
- `tests/spec/ticket-mcp/triage-projection.bats`
- `tests/spec/ticket-system.bats`
- `tests/spec/ticket-system/areas-csv-trim.bats`
- `tests/spec/ticket-system/backfill-id-sequence.bats`
- `tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats`
- `tests/spec/ticket-system/list-status-comma-list.bats`
- `tests/spec/ticket-system/list-test-data-filter.bats`
- `tests/spec/unsloth-training-env/factory-traces.bats`
- `tests/unit/factory/otel-emit.bats`
- `tests/unit/qa-dal.bats`
- `tests/unit/scs-search.bats`
- `tests/unit/ticket-lastenheft.bats`
- `tests/unit/vda-frontmatter.bats`
- `tools/dsh/README.md`
- `tools/dsh/plugins/audit-log.mjs`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
