## p4 — Tests (RED liegt bereits auf dem Branch)

Target files: `tests/spec/openspec-workflow/orphan-archive.bats`,
`tests/spec/sdlc-isolation/orphan-archive-dispatch.bats`,
`components/website/src/data/test-inventory.json`

Beide Testdateien wurden in der Planungsphase geschrieben und committed. Sie fuehren die Skripte
aus und pruefen Ergebnisdateien, Baumzustand und abgesetzte `gh`-Aufrufe (Stubs fuer `gh` und
`psql` via `FACTORY_PG_URL`).

- [ ] **RED bestaetigen, bevor p1 bis p3 umgesetzt werden.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/orphan-archive.bats tests/spec/sdlc-isolation/orphan-archive-dispatch.bats
# expected: FAIL — 13/13 not ok (Skripte fehlen, Poller kennt die Aufgabe archive nicht)
```

- [ ] **GREEN nach p1 und p2.** Derselbe Aufruf, jetzt 13/13 ok. Die Tests nicht anpassen, um
  gruen zu werden; weicht das Verhalten vom Test ab, ist zuerst das Requirement zu pruefen.

- [ ] **Test-Inventar neu erzeugen.**

```bash
task test:inventory
git diff --stat components/website/src/data/test-inventory.json
```
