# p7 — OpenSpec aus Code, CI und Skills lösen (7/7)

Ticket: T900725. Kontext: `design.md`. 54 Dateien.

## Regeln

Skills, Commands und Registry von OpenSpec lösen.

1. Löschen (`git rm -r`): `.opencode/skills/openspec-*`, Symlinks `.claude/skills/openspec-*`,
   `.claude/commands/opsx/`, `.opencode/commands/opsx-*.md`.
2. Registry: Einträge der gelöschten Skills/Commands aus `docs/agent-guide/registry/*.yaml` und
   `skills-lock.json` entfernen.
3. `dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore` und ihre `references/`: Schritte mit
   `/opsx:propose|apply|archive`, `openspec-propose`, `openspec/changes/…` streichen. Der Plan-Ort
   ist `.agents/plans/<slug>/` (`design.md`, `tasks.md`, `tasks.d/`). Der Archivschritt ist
   `ticket.sh archive-plan` + Löschen des Plan-Ordners per PR (siehe `plan-archive-steps.md`).
   Die Warnung „Change-Ordner openspec/changes/… nicht gefunden“ in
   `scripts/devflow-post-merge-finalize.sh` gehört zu A1b-Code, nicht hierher.
4. Alle anderen Dateien der Liste: OpenSpec-Erwähnung wie in A1a streichen.

Nach jeder Datei: `grep -in -e openspec -e opsx <datei>` ist leer (oder Datei gelöscht).

## Dateien

- `.claude/agents/bachelorprojekt-db.md`
- `.claude/agents/bachelorprojekt-infra.md`
- `.claude/agents/bachelorprojekt-ops.md`
- `.claude/agents/bachelorprojekt-security.md`
- `.claude/agents/bachelorprojekt-test.md`
- `.claude/agents/bachelorprojekt-website.md`
- `.claude/commands/opsx/apply.md`
- `.claude/commands/opsx/archive.md`
- `.claude/commands/opsx/explore.md`
- `.claude/commands/opsx/propose.md`
- `.opencode/commands/dev-flow-exe.md`
- `.opencode/commands/dev-flow-execute.md`
- `.opencode/commands/opsx-apply.md`
- `.opencode/commands/opsx-archive.md`
- `.opencode/commands/opsx-explore.md`
- `.opencode/commands/opsx-propose.md`
- `.opencode/skills/OVERVIEW.md`
- `.opencode/skills/bachelorprojekt-vim/references/project-profile.md`
- `.opencode/skills/dev-flow-e2e/SKILL.md`
- `.opencode/skills/dev-flow-execute/SKILL.md`
- `.opencode/skills/dev-flow-execute/references/implementer-handoff.md`
- `.opencode/skills/dev-flow-plan/SKILL.md`
- `.opencode/skills/dev-flow/DEV-FLOW.SKILL.md`
- `.opencode/skills/git-workflow/SKILL.md`
- `.opencode/skills/mishap-tracker/SKILL.md`
- `.opencode/skills/opencode-git-workflow/SKILL.md`
- `.opencode/skills/openspec-apply-change/SKILL.md`
- `.opencode/skills/openspec-archive-change/SKILL.md`
- `.opencode/skills/openspec-explore/SKILL.md`
- `.opencode/skills/openspec-propose/SKILL.md`
- `.opencode/skills/references/SKILL.md`
- `.opencode/skills/references/agent-active-plans.md`
- `.opencode/skills/references/deploy-routing.md`
- `.opencode/skills/references/dev-flow-execute-phases.md`
- `.opencode/skills/references/dev-flow-gotchas.md`
- `.opencode/skills/references/dev-flow-plan-phases.md`
- `.opencode/skills/references/openspec-explore-procedures.md`
- `.opencode/skills/references/plan-archive-steps.md`
- `.opencode/skills/references/plan-artifact-level.md`
- `.opencode/skills/references/plan-quality-gates.md`
- `.opencode/skills/references/repo-hygiene-ops.md`
- `.opencode/skills/references/ticket-ops-procedures.md`
- `.opencode/skills/references/ticket-stage-procedure.md`
- `.opencode/skills/references/verification-block.md`
- `.opencode/skills/sdlc-autopilot/SKILL.md`
- `.opencode/skills/system-audit/SKILL.md`
- `.opencode/skills/system-audit/references/phase-c-tickets.md`
- `docs/agent-guide/registry/agents.yaml`
- `docs/agent-guide/registry/api-overlay.yaml`
- `docs/agent-guide/registry/capabilities.yaml`
- `docs/agent-guide/registry/networks.yaml`
- `docs/agent-guide/registry/plan-guards.yaml`
- `docs/agent-guide/registry/runtimes.md`
- `docs/agent-guide/registry/skills.yaml`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
