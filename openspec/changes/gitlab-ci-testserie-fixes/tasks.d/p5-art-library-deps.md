# p5 — art-library: Test macht sich selbst lauffähig (T011903)

## Ziel

`assets/art-library/_tooling/` hat ein eigenes package.json (ajv, ajv-formats,
cheerio), getrennt vom Root-node_modules. Nur `task test:art-library`
(Taskfile.yml:664) führt vorher `cd assets/art-library/_tooling && npm install
--silent` aus. Ein direkter bats-Aufruf — wie ihn die GitLab-Pipeline und jeder
manuelle Lauf machen — überspringt das und bricht mit ERR_MODULE_NOT_FOUND ab.
Der einzige Fall der Serie ohne veraltete Erwartung: eine strukturelle
Umgebungsabhängigkeit.

Entscheidung: Weg (a) aus dem Ticket — der Test macht sich selbst lauffähig.
Ein Test, der nur über einen bestimmten Wrapper grün wird, ist in jeder anderen
Umgebung eine Falle (genau das hat ihn hier zum Fehlschlag gebracht).

## Steps

1. **RED.** Direkter Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/test_art_library_manifest.bats
# expected: FAIL (ERR_MODULE_NOT_FOUND — _tooling/node_modules fehlt)
```

2. **GREEN.** In `tests/unit/test_art_library_manifest.bats` einen
   `setup_file()`-Block ergänzen:

```bash
setup_file() {
  if [[ ! -d "${REPO}/assets/art-library/_tooling/node_modules" ]]; then
    ( cd "${REPO}/assets/art-library/_tooling" && npm install --silent ) \
      || skip "art-library tooling dependencies not installable (npm install failed)"
  fi
}
```

   Muster: `tests/spec/sealed-secret-cluster-drift.bats` (externer
   Abhängigkeits-Guard in der Setup-Phase, sauberer skip statt stillem Rot).
   `REPO` ist in der Datei bereits definiert (Zeile 6).

3. **Verifikation.** Beide Pfade prüfen:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/test_art_library_manifest.bats
task test:art-library
```

## Acceptance

- Der direkte bats-Aufruf ist grün (installiert selbst oder skippt sauber mit
  Begründung bei nicht installierbarem npm install).
- `task test:art-library` bleibt grün (Wrapper-Pfad unverändert).
- Kein Produktcode geändert.
