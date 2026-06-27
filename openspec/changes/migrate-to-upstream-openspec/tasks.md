# Tasks: OpenSpec improvements batch (T001267 umbrella)

_Umbrella for: T001261, T001263, T001264 (done), T001265. Out of scope: T001262 + T001266 (parked)._
_Factory input format: `- [ ]` checkboxes, hierarchical numbering per ticket._

## T001261 — Backfill SSOT specs (hoch, mittel)

- [ ] 1.1 Investigate each of the 11 stub specs; for each, decide: backfill (source from archive) OR delete (work never done)
- [ ] 1.2 For each backfill target, read the corresponding `openspec/changes/archive/<date>-<slug>/tasks.md` + delta
- [ ] 1.3 Rewrite each stub spec with real Requirements/Scenarios; cite the source as `<!-- from archive/.../tasks.md line N -->` comments
- [ ] 1.4 For each delete target, remove the spec file and any associated change folder (do NOT touch archived changes)
- [ ] 1.5 Run a sed/awk pass to wrap the intro paragraph of all 60 specs in `## Purpose` H2
- [ ] 1.6 Run a second pass to add `## Requirements` H2 before the first `### Requirement:` in each spec
- [ ] 1.7 Manual review of every modified spec; `git diff openspec/specs/` before commit
- [ ] 1.8 Update `scripts/openspec-validate.ts` to require `## Purpose` and `## Requirements` H2 (so future stubs can't slip through)
- [ ] 1.9 `task test:openspec` still passes
- [ ] 1.10 Open PR: `chore(openspec): backfill 11 SSOT stubs + add Purpose/Requirements headers [T001261]`

## T001263 — Install /opsx:* workflow commands (mittel, klein)

- [ ] 2.1 (host setup, not committed) `npm i -g @fission-ai/openspec@1.3.1`
- [ ] 2.2 `openspec init --tools opencode,claude --profile core --force`
- [ ] 2.3 Verify 4 files in `.opencode/commands/opsx-*.md`
- [ ] 2.4 Verify 4 dirs in `.claude/skills/openspec-*/SKILL.md`
- [ ] 2.5 `openspec config list` — confirm `profile: core`, `workflows: propose,explore,apply,archive`
- [ ] 2.6 Update `.agents/skills/dev-flow-plan/SKILL.md` — replace `task openspec:propose` reference with `/opsx:propose`
- [ ] 2.7 Update `.agents/skills/dev-flow-execute/SKILL.md` — replace `task openspec:apply` reference with `/opsx:apply`
- [ ] 2.8 Smoke test in a worktree: invoke `/opsx:propose` via agent prompt path; confirm change dir is created
- [ ] 2.9 Open PR: `feat(openspec): install upstream workflow commands in .opencode + .claude [T001263]`

## T001264 — Remove openspec-mcp + delete project.md (niedrig) [DONE 2026-06-27]

- [x] 3.1 Remove `openspec` entry from `.opencode/opencode.jsonc`
- [x] 3.2 Remove `openspec` entry from `.mcp.json`
- [x] 3.3 Delete `openspec/project.md`
- [x] 3.4 Transition T001264 → `done` with `resolution: shipped`
- [x] 3.5 Commit: `chore(openspec): remove unused openspec-mcp + delete dead project.md [T001264]` (commit cdc8d61f)

## T001265 — Polish (niedrig, klein)

- [ ] 4.1 Document the frontmatter convention in `AGENTS.md` (new "OpenSpec conventions" section)
- [ ] 4.2 Add to `openspec/config.yaml:rules:`:
    - `specs: ["Purpose auf Deutsch, Requirements auf Englisch, Scenarios auf Englisch (GIVEN/WHEN/THEN)"]`
    - `design: ["Goals/Non-Goals explizit trennen", "Decisions mit Begründung"]`
- [ ] 4.3 Audit all `.github/workflows/*.yml` for missing `OPENSPEC_TELEMETRY: '0'` env; add to each (workflow-level or per-job)
- [ ] 4.4 Add `openspec completion install` note to `AGENTS.md` under a new "Dev experience" section
- [ ] 4.5 `task test:openspec` still passes
- [ ] 4.6 Open PR: `chore(openspec): polish — frontmatter convention, rules, telemetry opt-out, completions [T001265]`

## Out of scope (parked)

- T001262 — Adopt upstream CLI (user instruction 2026-06-27: "leave as is for now")
- T001266 — Rewrite `openspec-workflow.md` SSOT (depends on T001262)

## Verification (after all PRs merge)

- [ ] `task test:openspec` passes
- [ ] `task test:changed` passes
- [ ] `task freshness:check` passes
- [ ] Manual review: in opencode, `/opsx:propose "test" --ticket T000001` (with a test ticket) creates `openspec/changes/test/specs/test.md` with non-stub content within 1 minute
- [ ] `task openspec:archive` (the bash wrapper) is still callable as a backward-compat fallback

---

## Rollback

Each ticket is a self-contained PR. To roll back:

```bash
git revert <merge-commit-sha>
```

No cross-PR dependencies. T001261 is the highest priority because the upstream migration (T001262) becomes safer once it lands.
