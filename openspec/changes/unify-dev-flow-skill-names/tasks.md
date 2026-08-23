---
title: "unify-dev-flow-skill-names — Implementation Plan"
ticket_id: T014086
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unify-dev-flow-skill-names — Implementation Plan

_Ticket: T014086_

## File Structure

```
.opencode/skills/dev-flow-{plan,execute,chore}     (neu: Symlinks -> ../../.claude/skills/dev-flow-*)
.opencode/skills/opencode-flow-{plan,execute,chore} (entfernt)
tests/spec/harness-workflow-split.bats             (HWS-1 + Header)
tests/spec/dev-flow-plan/guard-parity.bats         (Pfad)
tests/spec/agent-skills/devflow-worktree-cwd-guard.bats (Pfade)
tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats (Pfad + Testnamen)
tests/e2e/specs/agent-guide-walkthrough.spec.ts    (tools.find ids)
docs/agent-guide/registry/tools.yaml               (3 Eintraege, related, init_prompts)
docs/agent-guide/registry/capabilities.yaml        (Reason-String)
docs/agent-guide/maps/*, docs/agent-guide/20-werkzeuge.md,
components/website/src/lib/agent-guide.generated.json (regeneriert via task agent-guide:emit)
.opencode/opencode.jsonc                           (Kommentarblock)
AGENTS.md                                          (Workflow Rules + Skill Dispatch Protocol)
.opencode/skills/opencode-git-workflow/SKILL.md    (3 Referenzen)
scripts/{openspec.sh,agent-lock.sh,openspec-embed-local.sh,openspec-main-staging-guard.sh} (Kommentare)
```

## Tasks

- [ ] 1. Symlinks umbenennen: `opencode-flow-{plan,execute,chore}` entfernen,
      `dev-flow-{plan,execute,chore} -> ../../.claude/skills/dev-flow-*` anlegen
      (gleiche Relative-Link-Form wie die `openspec-*`-Skills).
- [ ] 2. BATS-Guards auf neue Pfade umstellen (harness-workflow-split HWS-1 inkl.
      Negativ-Check „kein opencode-flow-* mehr", guard-parity,
      devflow-worktree-cwd-guard, ticket-lock-closure-T003102).
- [ ] 3. E2E-Walkthrough (`tools.find(t => t.id === 'opencode-flow-plan')`) auf
      `dev-flow-plan` umstellen; Registry tools.yaml-Eintraege umbenennen
      (+ related/init_prompts/how_to_start_de), capabilities.yaml Reason-String.
- [ ] 4. Doku/Konfig-Follow-ups: `.opencode/opencode.jsonc` Kommentar,
      AGENTS.md (Workflow Rules + Skill Dispatch Protocol),
      opencode-git-workflow SKILL.md, Skript-Kommentare.
- [ ] 5. Regenerieren: `task agent-guide:emit`; pruefen dass maps +
      agent-guide.generated.json nur noch `dev-flow-*` nennen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** HWS-1 auf den neuen Zustand umstellen und laufen
      lassen, BEVOR die Symlinks getauscht sind — der Test muss am alten Zustand
      scheitern.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats
# expected: FAIL (red — symlinks heissen noch opencode-flow-*)
```

- [ ] **Fix-Step (GREEN).** Symlinks tauschen und alle weiteren Schritte 1–5
      umsetzen; danach alle betroffenen Suiten gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats \
  tests/spec/dev-flow-plan/guard-parity.bats \
  tests/spec/agent-skills/devflow-worktree-cwd-guard.bats \
  tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats
node scripts/agent-guide/validate.mjs
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
