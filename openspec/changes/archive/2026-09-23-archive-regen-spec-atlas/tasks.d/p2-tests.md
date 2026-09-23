## p2 — Tests (RED liegt bereits auf dem Branch)

Target files: `tests/spec/openspec-workflow/archive-regen-spec-atlas.bats`,
`components/website/src/data/test-inventory.json`

- [ ] **RED bestaetigen, bevor p1 umgesetzt wird.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-regen-spec-atlas.bats
# expected: FAIL — Tests 1 und 2 not ok, Test 3 ok (Regression T003136)
```

- [ ] **GREEN nach p1.** 3/3 ok. Tests nicht anpassen, um gruen zu werden.

- [ ] **Test-Inventar neu erzeugen.**

```bash
task test:inventory
```
