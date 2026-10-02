# p1 — openspec/ löschen

Target files: `openspec/`.

Vorbedingung prüfen: `bats tests/spec/os-retirement-prose.bats tests/spec/os-retirement-code.bats` ist grün.
Sonst abbrechen und im Ticket melden.

### Task 1: Löschen

```bash
git rm -r -q openspec/
```

### Task 2: Reste

`git grep -il openspec` mit den Ausschlüssen aus `design.md` ausführen. Jeder Treffer außerhalb der
Allowlist: Verweis streichen wie in `openspec-retire-prose` bzw. `-code`. `task freshness:regenerate`
räumt generierte Indexe.
