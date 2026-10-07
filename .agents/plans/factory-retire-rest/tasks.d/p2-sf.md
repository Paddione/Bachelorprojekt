# p2 — Factory-Reste entfernen (2/8)

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

- `docs/brain/k5-openspec.md`
- `docs/brain/k6-ticket-factory.md`
- `docs/brain/k7-agenten-mcp.md`
- `docs/db-audit/2026-07-09-index-and-nplus1-audit.md`
- `docs/diagrams/architecture.md`
- `docs/diagrams/brain-architektur-gesamtbild.md`
- `docs/factory-eval/latest.json`
- `docs/factory-eval/scorecard-2026-06-17T02-35-14-379Z.json`
- `docs/finetune/tandem-model-evaluation.md`
- `docs/runbooks/db-audit-playbook.md`
- `docs/runbooks/decommission-k3s-node.md`
- `docs/runbooks/mcp-http-local-security.md`
- `docs/runbooks/rejoin-k3s-node.md`
- `docs/sdlc/cockpit-action-inventory.md`
- `docs/spec-atlas.md`
- `docs/windows-dev-setup.md`
- `environments/schema.yaml`
- `environments/sealed-secrets/dev.yaml`
- `environments/sealed-secrets/fleet-korczewski.yaml`
- `environments/sealed-secrets/fleet-mentolder.yaml`
- `environments/sealed-secrets/korczewski.yaml`
- `environments/sealed-secrets/mentolder.yaml`
- `environments/sealed-secrets/staging.yaml`
- `environments/staging.yaml`
- `k3d/dev-pod/deployment.yaml`
- `k3d/monitoring/otel-collector-auth-secret.yaml`
- `k3d/monitoring/otel-collector.yaml`
- `k3d/secrets.yaml`
- `k3d/shared-db-endpoint-policy.yaml`
- `migrations/20260719-brand-check-constraints.sql`
- `prod-fleet/dev/kustomization.yaml`
- `scripts/agent-collision.sh`
- `scripts/agent-lock-activity.sh`
- `scripts/agent-lock-reap.sh`
- `scripts/agent-lock.sh`
- `scripts/arbitration/apply.sh`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
