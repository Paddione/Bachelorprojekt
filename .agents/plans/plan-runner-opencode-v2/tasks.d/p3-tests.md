# p3 — Tests

Target files: `tests/spec/llm-local-dev/plan-runner.bats`, `tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh`.

### Task 1: Tests grün

```bash
bats tests/spec/llm-local-dev/plan-runner.bats
```

Vor p1 expected: FAIL (der Stub lehnt `--dir` ab wie opencode v2). Danach alle grün.
