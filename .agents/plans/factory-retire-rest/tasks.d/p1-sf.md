# p1 — Factory-Reste entfernen (1/8)

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

- `.claude/workflows/agentic-trends-radar.js`
- `.dockerignore`
- `.githooks/post-commit-embed`
- `.github/workflows/build-factory-runner.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/factory-post-merge-e2e.yml`
- `.github/workflows/post-merge.yml`
- `.github/workflows/renovate.yml`
- `.gitlab-ci.yml`
- `.lavish/kit/action-policy.js`
- `.lavish/kit/adapter.js`
- `.lavish/kit/daemon/routes/factory.ts`
- `.lavish/kit/daemon/routes/stream.ts`
- `.lavish/kit/daemon/server.ts`
- `.lavish/kit/daemon/sources/factory-mcp.ts`
- `.opencode/prompts/orchestrator.md`
- `.opencode/skills/dev-flow-execute/SKILL.md`
- `.opencode/skills/dev-flow-execute/references/implementer-handoff.md`
- `.opencode/skills/mishap-tracker/SKILL.md`
- `.opencode/skills/references/dev-flow-execute-phases.md`
- `.opencode/skills/references/dev-flow-plan-phases.md`
- `.opencode/skills/references/factory-resume-contract.md`
- `.opencode/skills/references/repo-hygiene-ops.md`
- `.opencode/skills/references/subagent-provisioning.md`
- `AGENTS.md`
- `CLAUDE.md`
- `assets/Mentolder/INVENTORY.md`
- `assets/feature-intake/feature-candidates.md`
- `commitlint.config.cjs`
- `dev-local/components/llm-services/deployment.yaml`
- `docker/factory-runner/Dockerfile`
- `docker/factory-runner/wakeup-listener.mjs`
- `docs/agent-guide/maps/toolset-map.md`
- `docs/agent-guide/registry/api-overlay.yaml`
- `docs/agent-guide/registry/capabilities.yaml`

## Abschluss

```bash
bats tests/spec/sf-retirement-rest.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
