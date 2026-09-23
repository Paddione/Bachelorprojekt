## p3 — Tests (RED liegt bereits auf dem Branch)

Target files: `tests/spec/agent-skills/archive-stage-new-ssot.bats`,
`components/website/src/data/test-inventory.json`

- [ ] **RED bestaetigen, bevor p1 und p2 umgesetzt werden.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/archive-stage-new-ssot.bats
# expected: FAIL — Tests 1, 3, 4, 6 not ok; 2 und 5 ok (Regressionen, die gruen bleiben muessen)
```

- [ ] **GREEN nach p1 und p2.** 6/6 ok. Tests nicht anpassen, um gruen zu werden.

- [ ] **Test-Inventar neu erzeugen.**

```bash
task test:inventory
```
