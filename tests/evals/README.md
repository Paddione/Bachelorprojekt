# tests/evals/ — Human-Owned Agent Evaluations

Stability probes that verify the repository keeps working **for agents**:
CLI surface, hook integrity, routing docs. Agents **run** these evals
(`task test:evals`) but never edit them.

## Ownership

- **Human-owned.** Every change under `tests/evals/` must come from a human
  session with an explicit reason.
- **Agents:** read + execute only. Do not create, modify, rename, or delete
  anything here — including "helpful" golden refreshes. If an eval is red,
  fix the code under test, never the eval.

## Enforcement

- **Local:** `.githooks/pre-commit` refuses staged `tests/evals/**` changes
  unless `EVALS_OVERRIDE=1` is set (human-only escape hatch).
- **CI:** the `test-evals` job fails a PR that touches `tests/evals/` unless
  the PR title or body contains `[evals-override]` (human-only token).

## Updating goldens (humans only)

```bash
task test:evals:update   # regenerates golden/task-list-all.txt
task test:evals          # verify
```

State the reason in the PR body together with the `[evals-override]` token.

## Inventory note

Evals are agent-capability probes, not requirement coverage — they are
intentionally **not** part of `test-inventory.json` (which scans only
`tests/local/`, `tests/prod/`, `tests/spec/`).
