---
title: "factory-eval-scale — Implementation Plan"
ticket_id: T001980
domains: [factory, tests, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-eval-scale — Implementation Plan

_Ticket: T001980. Design spec: `docs/superpowers/specs/2026-07-19-factory-eval-scale-design.md`._

Turns the existing golden-fixture scorer (`scripts/factory/eval.mjs`, 3 fixtures) into a
usable private benchmark: a semi-automatic fixture generator, a `--replay` mode that runs the
current agent setup against fixtures at their historical `base_commit`, and score persistence
into the Factory verify phase event. All new heavy logic lands in fresh helper modules so the
budget-negative, `s1.ignore` `scripts/factory/pipeline.js` monolith is touched only minimally.

## File Structure

Budget column is the plan-lint effective budget (`gates.yaml` limit − live `wc -l`, or the
frozen baseline where higher). New files have no live `wc -l` yet; their budget is the static
extension limit they must stay under.

| `path` | ist | budget |
|---|---|---|
| `scripts/factory/eval.mjs` | 167 | 333 |
| `scripts/factory/eval-replay.mjs` | 0 | 500 |
| `scripts/factory/eval-gen.mjs` | 0 | 500 |
| `scripts/factory/eval-context.cjs` | 0 | 200 |

Additional touched files (ungated extensions / sanctioned exception — no numeric budget claim):

- `scripts/factory/pipeline.js` — 767 lines, listed in `gates.yaml` `s1.ignore` (sanctioned
  monolith, T000460). plan-lint still computes a negative residual for it, so this plan does
  **not** grow it: the eval-context logic is **extracted** into the new pure module
  `scripts/factory/eval-context.cjs` and only wired in with a single inline `require(...)` at
  the existing verify anchor (`scripts/factory/pipeline.js:489-502`).
- `Taskfile.factory.yml` — `.yml`, ungated: adds `factory:eval:gen` + `factory:eval:replay`.
- `.github/workflows/ci.yml` — `.yml`, ungated: advisory `::warning::` step.
- `scripts/factory/README.md` — `.md`, ungated: new Eval section.
- `AGENTS.md` — `.md`, ungated: advisory mandatory-step doc.
- `tests/spec/software-factory.bats` — `.bats`, ungated: new `FA-SF-59` block; `FA-SF-58` stays.
- `tests/factory-eval/fixtures/**` — `.json`, ungated: ~5 new curated fixtures + `meta.json`;
  existing `T000725`, `T000726`, `T000925` stay unchanged.
- `openspec/changes/factory-eval-scale/specs/software-factory.md` — delta spec (already drafted).

## Task 1 — meta.json support + scorecard mode/base_commit in eval.mjs

Backward-compatible fixture-schema extension. `scripts/factory/eval.mjs` (ist 167, budget 333).

- [ ] Add a `loadMeta(fixtureId)` helper next to `loadJSON` (`scripts/factory/eval.mjs:28-30`):
      read `tests/factory-eval/fixtures/<id>/meta.json` when present, else return `null`
      (fallback: current `HEAD`, no error). Existing fixtures without `meta.json` stay valid.
- [ ] In `main()` (`scripts/factory/eval.mjs:95-136`), for the default (non-replay) path add
      `mode: 'live'` and `base_commit: meta?.base_commit ?? null` to each pushed score object,
      so every scorecard entry carries `mode` and `base_commit` (design AK 4).
- [ ] Keep the argument loop's existing `--fixtures-dir` / `--out-dir` / `--dry-run` handling
      byte-for-byte; only append new flag branches in Task 3. `FA-SF-58` must stay green:
      `node scripts/factory/eval.mjs` with no flags scores the live diff exactly as today.
- [ ] Verify no behaviour drift for the default path:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-58"
# expected: PASS (default eval.mjs behaviour unchanged)
```

## Task 2 — RED: failing replay-dry-run test (FA-SF-59)

Add the red→green failing test **before** implementing replay. New `@test` entries go into
`tests/spec/software-factory.bats` per the repo's one-file-per-SSOT-spec convention (do not
create a ticket-numbered file). `FA-SF-58` is left untouched.

- [ ] Add `FA-SF-59: eval.mjs --replay --dry-run records mode=replay and touches no LLM`:
      create a temp fixture dir with `ticket.json`, `expected.json`, and a `meta.json`
      carrying a real `base_commit` (`git rev-parse HEAD`); run
      `node scripts/factory/eval.mjs --replay --fixture <id> --dry-run --fixtures-dir <tmp> --out-dir <tmp>/out`;
      assert exit 0, output contains `replay`, and `jq -r '.scores[0].mode' <tmp>/out/latest.json`
      equals `replay`.
- [ ] Run the new test on the current branch — it must fail, because today `--replay` is an
      unrecognised flag (only `--dry-run` is honoured) so the scorecard has no `mode` field:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-59"
# expected: FAIL (red — replay mode not yet implemented)
```

- [ ] Add a second `@test` `FA-SF-59: eval-context helper builds compact JSON for a known fixture`
      that requires `scripts/factory/eval-context.cjs` and asserts it returns a compact JSON
      string for a fixture id that exists and an empty/`null` result otherwise. This also starts
      red (module absent) and turns green in Task 5.
- [ ] Regenerate the test inventory and stage it (CI inventory check fails otherwise):

```bash
task test:inventory   # regenerates website/src/data/test-inventory.json
```

## Task 3 — GREEN: replay mode (eval-replay.mjs + eval.mjs wiring)

Replay orchestration lives in a new module so `eval.mjs` stays well under budget.

- [ ] Create `scripts/factory/eval-replay.mjs` (new, ESM, budget 500; target ~120-180 lines):
      export `runReplay({ fixtureId, fixturesDir, meta, dryRun })`. Per fixture it SHALL:
  - create an ephemeral worktree at `meta.base_commit` using the git-crypt-safe semantics of
    `scripts/worktree-create.sh` (skeleton `--no-checkout` then key-copy / filter-neutralize,
    per T000426/T000925) — never a bare `git worktree add`, which trips the git-crypt smudge
    filter (intel.json risk);
  - when `dryRun` is true: build the worktree, return an empty `touchedFiles` list and make **no**
    implement/LLM call, then remove the worktree (design AK 3 — the testable path);
  - when `dryRun` is false: invoke the existing Factory implement machinery (same opencode
    implementer invocation `scripts/factory/pipeline.js` uses), then collect
    `git diff --name-only` inside the worktree;
  - always tear the worktree down (`git worktree remove --force`) in a `finally` block.
  Keep this a pure orchestration module (no import of DB/website layers — S2: no new cycles).
- [ ] Wire flags into `scripts/factory/eval.mjs` (ist 167 → ~190, budget 333): add `--replay`
      and `--fixture <id>` to the arg loop; when `--replay` is set, dynamically nothing —
      statically `import { runReplay } from './eval-replay.mjs'` at top and branch in `main()`
      so replay fixtures score `runReplay(...)`-collected `touchedFiles` and each score object
      gets `mode: 'replay'` and `base_commit: meta.base_commit`. Without `--replay` the code
      path is the unchanged live-diff path from Task 1.
- [ ] Make the Task 2 `FA-SF-59` replay-dry-run test pass:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-59"
# expected: PASS (replay dry-run now records mode=replay)
```

## Task 4 — Fixture generator + Taskfile targets

- [ ] Create `scripts/factory/eval-gen.mjs` (new, ESM, budget 500; target ~120-160 lines):
      entrypoint `task factory:eval:gen -- <TICKET_EXT_ID>`. It SHALL:
  - read the ticket via `bash scripts/ticket.sh get --id <ext_id>` (JSON: `external_id`,
    `type`, `brand`, `title`) and map those into a `ticket.json` skeleton (leaving
    `description`/`area` as editable fields for human curation);
  - resolve the linked PR number from `tickets.ticket_links` (`kind='pr'`,
    `pr_number IS NOT NULL`) via `scripts/ticket.sh get-ticket-links --id <ext_id>`;
  - derive `expected.json.files` from `gh pr diff <pr> --name-only`, with
    `min_recall`/`min_precision`/`forbidden`/`tests` emitted as a curatable skeleton;
  - compute `base_commit` from the PR merge-base and write
    `meta.json = { base_commit, pr_number, generated_at, source: "eval-gen" }`;
  - **refuse to overwrite** an existing `tests/factory-eval/fixtures/<ext_id>/` directory —
    exit non-zero naming the existing path (design AK 1, spec scenario "never overwrites").
- [ ] Add to `Taskfile.factory.yml` (ungated) next to the existing `eval:` target
      (`Taskfile.factory.yml:45-48`), using the `enqueue` `CLI_ARGS`/`MATCH` pattern
      (`Taskfile.factory.yml:37-43`):
  - `factory:eval:gen` → `node scripts/factory/eval-gen.mjs {{index .MATCH 0}}`;
  - `factory:eval:replay` → `node scripts/factory/eval.mjs --replay {{.CLI_ARGS}}`.
- [ ] Add an `FA-SF-59` `@test` that asserts `task factory:eval:gen -- T000726` refuses to
      overwrite the existing fixture (non-zero exit, existing-path message), and that both new
      Taskfile targets are dry-run resolvable:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-59"
# expected: PASS (generator + Taskfile targets)
```

- [ ] `task test:inventory` again if new `@test` entries were added, and stage the inventory.

## Task 5 — Extract eval-context helper + minimal pipeline.js wiring

Score persistence with **no** net growth of the budget-negative `s1.ignore` monolith — the
logic is **extracted** into a pure CommonJS helper and only referenced inline.

- [ ] Create `scripts/factory/eval-context.cjs` (new, CommonJS, budget 200; target ~50-90
      lines): export `buildEvalContext(extId, { fixturesDir, outDir })` — return a compact JSON
      **string** (`JSON.stringify` of `{ fixture, mode, base_commit, score, pass }` sliced to
      the `detail` length budget) when `tests/factory-eval/fixtures/<extId>/` exists and a
      matching entry is found in `docs/factory-eval/latest.json`, else return `null`. Pure
      module: filesystem only, no DB/require of `pipeline.js` (S2 — no cycle; S4 — reachable
      because `pipeline.js` requires it and `FA-SF-59` covers it).
- [ ] Wire it into `scripts/factory/pipeline.js` at the verify anchor
      (`scripts/factory/pipeline.js:489-502`): inline `const evalCtx = (() => { try { return
      require('./eval-context.cjs').buildEvalContext(String(A.ticket_id), { ... }) } catch {
      return null } })()` — mirroring the existing inline `require('./otel-emit.cjs')` pattern
      (`scripts/factory/pipeline.js:86`) — and pass `evalCtx` as the `detail` argument to the
      verify `phaseEvent('verify','done', evalCtx || 'noise-only'|…)` calls. `phaseEvent`
      already slices `detail` to 240 chars (`scripts/factory/pipeline.js:83`) and forwards it to
      `scripts/ticket.sh phase … --detail …` (`scripts/ticket.sh:477-501`) which writes
      `tickets.factory_phase_events.detail` (TEXT — no migration, design E5). Keep the diff to
      the smallest possible line delta.
- [ ] Confirm `pipeline.js` still passes its structural contract (FA-SF-20) after the edit:

```bash
node --check scripts/factory/pipeline.js
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-20"
# expected: PASS (pipeline.js structure intact)
```

## Task 6 — CI advisory step + docs (AGENTS.md, README)

- [ ] Add an advisory step to the `Factory + OpenSpec + Guards` job in
      `.github/workflows/ci.yml` (after "MCP tooling guardrail",
      `.github/workflows/ci.yml:174-175`): compute `git diff --name-only origin/main...HEAD`
      and, if it matches any agent-setup path (`.opencode/agent-models.jsonc`,
      `scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js`, `AGENTS.md`),
      emit `echo "::warning::Agenten-Setup geändert — lokal 'task factory:eval:replay' ausführen"`.
      Advisory only: the step never exits non-zero (design E4 — never a hard gate; CI runners
      have no GPU/LM-Studio).
- [ ] Document the workflow in `scripts/factory/README.md` (new "Eval / Private Benchmark"
      section after the OTel section, `scripts/factory/README.md:134`): fixture layout incl.
      `meta.json`, `task factory:eval:gen` / `task factory:eval:replay`, when replay is
      advisory-mandatory (agent-setup changes), the known gap that `tests` commands are still
      not executed (design E6), and the overfitting caveat — trace-reading stays mandatory
      (design Risks).
- [ ] Document the advisory mandatory step in `AGENTS.md` (Quality Gates section,
      `AGENTS.md:95`): after any agent-setup change, run `task factory:eval:replay` locally and
      record the scorecard before merge.
- [ ] Add an `FA-SF-59` `@test` asserting the CI advisory step exists and references
      `factory:eval:replay` and the agent-setup paths, plus a doc-presence assertion for the
      README/AGENTS Eval sections:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-59"
# expected: PASS (CI advisory + docs present)
```

## Task 7 — ~5 curated example fixtures

- [ ] Generate ~5 fixture proposals via `task factory:eval:gen -- <TICKET>` from merged
      Factory bug/feature tickets (prefer bug tickets per design E1), then hand-curate
      `min_recall`/`min_precision`/`forbidden`/`tests` for each. Each fixture ships
      `ticket.json` + `expected.json` + `meta.json` under `tests/factory-eval/fixtures/`.
      The existing three (`T000725`, `T000726`, `T000925`) stay unchanged (design E7 — the
      remaining ~25 grow later over the documented workflow, not in this PR).
- [ ] Sanity-run the scorer over all fixtures (default live mode) to confirm they load and
      score without error:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-58"
# expected: PASS (all fixtures incl. new ones load and score)
```

## Task 8 — Final verification

- [ ] Regenerate the test inventory and stage `website/src/data/test-inventory.json`
      alongside the `tests/spec/software-factory.bats` changes:

```bash
task test:inventory
```

- [ ] Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Validate the OpenSpec change and the plan itself:

```bash
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/factory-eval-scale/tasks.md
```
