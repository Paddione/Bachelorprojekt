# p2 — Tests

Target files: `tests/spec/langfuse-agent-tracing.bats`.

Die beiden `T900690`-Tests liegen bereits im Stage-Commit. Keine Änderung an der Datei nötig,
solange sie nach p1 grün sind.

### Task 1: Tests grün

```bash
bats tests/spec/langfuse-agent-tracing.bats
```

Vor p1 expected: FAIL für beide `T900690`-Tests. Nach p1 sind alle Tests der Datei grün.
