## p3 — Tests

Target files: `tests/spec/local-dev-mesh/k3d-tooling-removed.bats`, `tests/spec/local-dev-mesh/dev-stack-tasks.bats`, `tests/spec/security.bats`, `tests/unit/dev-build-safety.bats`, `tests/unit/staging.bats`, `components/website/src/data/test-inventory.json`

- [ ] **RED: Failing-Test-Step.**
  Erweitere `tests/spec/local-dev-mesh/k3d-tooling-removed.bats` um Prüfungen gegen die entfernten Dev-Stack- und Staging-Tasks (`dev:apply`, `dev:deploy`, `dev:build:website`, `dev:build:brett`, `staging:*`), die gelöschten Dateien (`Taskfile.staging.yml`, `scripts/staging-id.sh`, `k3d/staging-stack/`, etc.) sowie das Verbot von `k3d image import` in allen Taskfiles.
  Erstelle `tests/spec/local-dev-mesh/dev-stack-tasks.bats` zur Absicherung, dass `dev:redeploy:website` kein Build ausführt und `dev:secrets` nur in `NS_DEV` arbeitet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3d-tooling-removed.bats
# expected: FAIL
```

- [ ] **GREEN: Testbereinigung und Absicherung.**
  - `tests/unit/staging.bats` löschen.
  - Staging-bezogene Testfälle aus `tests/spec/security.bats` entfernen.
  - Testfall zu `build:website` aus `tests/unit/dev-build-safety.bats` entfernen.
  - `components/website/src/data/test-inventory.json` aktualisieren.

- [ ] **GREEN: Tests verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ tests/spec/security.bats tests/unit/dev-build-safety.bats
```
