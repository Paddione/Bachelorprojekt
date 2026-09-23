## p4 — Tests (RED liegt bereits auf dem Branch)

Target files: `tests/spec/agent-skills/worktree-remove-managed.bats`,
`components/website/src/data/test-inventory.json`

- [ ] **RED bestaetigen, bevor p1 bis p3 umgesetzt werden.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-remove-managed.bats
# expected: FAIL — 5/5 not ok; Test 4 scheitert an "cannot remove a locked working tree"
```

- [ ] **GREEN nach p1 und p2.** Derselbe Aufruf liefert 5/5 ok. Tests nicht anpassen, um gruen zu
  werden.

- [ ] **Test-Inventar neu erzeugen.**

```bash
task test:inventory
```
