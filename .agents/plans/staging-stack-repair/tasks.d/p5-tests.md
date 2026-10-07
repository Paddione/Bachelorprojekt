# p5 — Spec-Test grün und registriert

Target files: `tests/spec/staging-stack-repair.bats`. Design: `design.md` Abschnitt Tests.

Der Test ist mit dem Plan committet. Dieses Partial ändert ihn nur, wenn p1 bis p4 eine
Zusicherung als falsch formuliert entlarven, nie um einen roten Test passend zu machen.

### Task 1: Rot-Grün belegen

Vor p2 bis p4 (Stand des Plan-Commits):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/staging-stack-repair.bats
# expected: FAIL — Tests 1 bis 4
```

Nach p1 bis p4:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/staging-stack-repair.bats
# erwartet: 5/5 ok
```

### Task 2: Test-Inventar

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
```
