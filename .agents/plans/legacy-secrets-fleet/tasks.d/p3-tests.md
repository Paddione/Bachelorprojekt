# p3 — Tests

Target files: `tests/spec/fleet-operations/legacy-secrets-fleet.bats`, `tests/spec/fleet-operations.bats`,
`tests/unit/secrets-sync.bats`, `tests/spec/secrets-deploy-automation.bats`, `tests/spec/health-goals.bats`.

### Task 1: Bestandstests umstellen

Legacy-Vergleich in `fleet-operations.bats` entfernen; Pflichtschluessel-, Existenz- und
health-goals-Tests auf `fleet-mentolder`/`fleet-korczewski` umstellen.

### Task 2: Tests gruen

```bash
bats tests/spec/fleet-operations/legacy-secrets-fleet.bats tests/spec/fleet-operations.bats tests/unit/secrets-sync.bats tests/spec/secrets-deploy-automation.bats
```

Vor p1/p2 expected: FAIL fuer `legacy-secrets-fleet.bats`, danach alle gruen.
