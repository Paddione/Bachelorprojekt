# p4 — Tests

Target files: `tests/spec/langfuse-agent-tracing.bats`.

Die `T900691`-Tests und die angepasste Host-Erwartung in Test 2 liegen im Stage-Commit.

### Task 1: Tests grün

```bash
bats tests/spec/langfuse-agent-tracing.bats
```

Vor p1–p3 expected: FAIL für Test 2 und alle `T900691`-Tests. Danach alle Tests der Datei grün.
