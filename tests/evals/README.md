# tests/evals/ — Agent Evaluations

Stability probes that verify the repository keeps working **for agents**:
CLI surface, hook integrity, routing docs. Anyone (human or agent) may run
and maintain them — a red eval means: fix the code under test first, and
touch the eval itself only with a stated reason in the PR.

## Run

```bash
task test:evals          # run all evals
```

## Updating goldens

```bash
task test:evals:update   # regenerates golden/task-list-all.txt
task test:evals          # verify
```

State the reason in the PR body when a golden changes.

## Inventory note

Evals are agent-capability probes, not requirement coverage — they are
intentionally **not** part of `test-inventory.json` (which scans only
`tests/local/`, `tests/prod/`, `tests/spec/`).
