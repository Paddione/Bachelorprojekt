# Tasks: Mishap-Bundle — repo/ci, tasks/test, agent-lock

## File Structure
```
.github/workflows/quality-loop.yml  → M1
scripts/ci-pr-health.sh             → M1
Taskfile.yml                        → M2
scripts/agent-lock.sh               → M3
tests/spec/mishap-bundle/           → Tests (NEU)
```

## Manifest

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| p1 | m1-ci-health | impl | .github/workflows/quality-loop.yml, scripts/ci-pr-health.sh | — |
| p2 | m2-test-gate | impl | Taskfile.yml | — |
| p3 | m3-agent-lock-s1 | impl | scripts/agent-lock.sh | — |
| p4 | tests | tests | tests/spec/mishap-bundle/ci-test-agentlock.bats | p1,p2,p3 |

## Partials

### p1: M1 — CI-PR-Health verbessern
- quality-loop.yml: Retry für flaky BATS-Tests
- ci-pr-health.sh: Robustere Fehlererkennung

### p2: M2 — test:all im Worktree
- Taskfile.yml: test:changed JS-Gruppen graceful-skip wenn vitest fehlt

### p3: M3 — agent-lock.sh auf ≤500 Zeilen kürzen
- Funktionen auslagern oder komprimieren

### p4: Tests
- `tests/spec/mishap-bundle/ci-test-agentlock.bats`
