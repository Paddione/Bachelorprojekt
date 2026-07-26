# Tasks: Mishap Bundle (dev-flow-plan, dev-flow-execute)

## Manifest
- p1-update-dev-flow-plan: `.opencode/skills/opencode-flow-plan/SKILL.md`
- p2-update-dev-flow-execute: `.opencode/skills/opencode-flow-execute/SKILL.md`
- p3-tests: `scripts/`

## Partials

### p1-update-dev-flow-plan
Update `opencode-flow-plan` skill documentation:
1. In Fix-Path (Step 2.8), add mention of `specs/<parent-ssot-slug>.md`.
2. In Step A.3/2.7, change Lavish-Board "PFLICHT" to "empfohlenes Werkzeug" with consent note.

### p2-update-dev-flow-execute
Update `opencode-flow-execute` skill documentation:
1. In Step 0, replace the `git pull --rebase origin main` logic with a check to ensure the branch is `main`, falling back to `git fetch origin main:main` otherwise.

### p3-tests
Verify changes:
1. Run `scripts/plan-lint.sh` on the updated skills.
2. Run `scripts/openspec.sh validate` on the changes.
3. Verify `dev-flow-execute` Step 0 logic via a small test script in `scripts/test-dev-flow-execute-sync.sh`.
