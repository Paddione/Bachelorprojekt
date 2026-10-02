# p7 — Regressionstest

Target files: `tests/spec/website-svelte-check.bats` (liegt seit dem Plan-Commit vor).

Kontext: `design.md` D2.

### Task 1: Failing Test vor p1–p6 bestätigen

Auf dem Plan-Stand (vor p1):

```bash
bats tests/spec/website-svelte-check.bats
```

expected: FAIL. Test 2 schlägt fehl, weil der CI-Job kein `svelte-check` ausführt. Test 1 wird
übersprungen, weil `svelte-check` noch nicht installiert ist.

### Task 2: Grün nach p1–p6

```bash
bats tests/spec/website-svelte-check.bats
```

Beide Tests `ok`, Test 1 ohne `skip`. Meldet Test 1 Fehler, nennt die Ausgabe Datei und Zeile.
Die Datei gehört zu genau einem Partial, dort nachbessern.

### Task 3: Test-Inventar

```bash
task test:inventory
```

`components/website/src/data/test-inventory.json` mitcommitten, falls der Befehl sie ändert.
