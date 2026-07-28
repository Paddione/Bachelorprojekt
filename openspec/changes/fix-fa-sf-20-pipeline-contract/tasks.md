## 1. Remove stale test file

- [ ] 1.1 Remove `tests/local/FA-SF-20-pipeline-contract.bats`

## 2. Update generated indexes

- [ ] 2.1 Remove `tests/local/FA-SF-20-pipeline-contract.bats` reference from `docs/code-quality/repo-index.json`
- [ ] 2.2 Remove `tests/local/FA-SF-20-pipeline-contract.bats` reference from `website/src/data/test-inventory.json`

## 3. Verify

- [ ] 3.1 Run `task test:factory` and confirm 0 failures related to FA-SF-20
- [ ] 3.2 Run `task freshness:check` to verify generated files are up to date
- [ ] 3.3 Run `openspec validate fix-fa-sf-20-pipeline-contract` to validate the change

## 4. Commit & PR

- [ ] 4.1 Commit with Conventional Commits message: `fix(tests): remove stale FA-SF-20-pipeline-contract.bats referencing deleted pipeline.js [T002421]`
- [ ] 4.2 Push branch and create PR
