# p3 — Legacy retirement + roster guard

Removes the six legacy domain agents and re-pins the spec guards to the new
roster. Runs after p1/p2 because the guard asserts the post-cutover state.

## Tasks

- [ ] Delete `.claude/agents/bachelorprojekt-ops.md`,
  `bachelorprojekt-db.md`, `bachelorprojekt-infra.md`, `bachelorprojekt-test.md`,
  `bachelorprojekt-website.md`, `bachelorprojekt-security.md`.
- [ ] Write `tests/spec/primary-agents-omo.bats` — roster guard: asserts
  `bp-build`/`bp-run`/`bp-ship` exist in `.opencode/agent-models.jsonc` and in
  `.claude/agents/`, and that no `bachelorprojekt-*` file remains. Red phase:
  on the base commit this suite fails with expected: FAIL (legacy roster
  still present); after p1–p3 it is green. Run it with
  `tests/unit/lib/bats-core/bin/bats tests/spec/primary-agents-omo.bats`.
- [ ] Edit `tests/spec/llm-local-dev/single-static-model.bats`: replace the
  `glimmer-primary` roster assertion with the `bp-*` triple.
- [ ] Edit `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`: repoint the
  worker job from `glimmer-primary` to the matching new primary.

## Acceptance

- [ ] New guard is red on base, green after this partial (rot-grün evidenced
  by CI on the stacked PRs).
- [ ] `grep -rn 'glimmer-primary' tests/ .opencode/ .claude/ AGENTS.md` shows
  no active references (history docs may mention it).
