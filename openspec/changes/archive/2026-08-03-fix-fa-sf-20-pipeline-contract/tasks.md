## 1. Deckung nachweisen (vor jedem Entfernen)

- [x] 1.1 `@test`-Titel jeder Legacy-Datei gegen `tests/spec/software-factory.bats` prüfen
- [x] 1.2 Rumpf-Diff nach Normalisierung der Pfadvariablen — muss leer sein
- [x] 1.3 `tests/spec/software-factory.bats` grün laufen lassen (484 Tests, 0 Fehler)
- [x] 1.4 Fehlenden Fall portieren: `FA-SF-30: dispatcher reads prep from a file, not via child_process (T001812)`

## 2. Legacy-Dateien entfernen

- [x] 2.1 `tests/local/FA-SF-20-pipeline-contract.bats`
- [x] 2.2 `tests/local/FA-SF-30-dispatcher-contract.bats`
- [x] 2.3 `tests/local/FA-SF-31-workflow-entrypoint.bats`
- [x] 2.4 `tests/local/FA-SF-37-retry.bats`
- [x] 2.5 `tests/local/FA-SF-39-canary-wire.bats`
- [x] 2.6 `tests/local/FA-SF-40-provision.bats`
- [x] 2.7 `tests/local/FA-SF-43-worktree-gitcrypt.bats`
- [x] 2.8 `tests/local/FA-SF-44-verify-diff-killswitch.bats`
- [x] 2.9 `tests/local/FA-SF-45-conflict-gate-deadlock.bats`
- [x] 2.10 `tests/local/FA-SF-46-cleanup.bats`
- [x] 2.11 `tests/local/FA-SF-59-aci-loop.bats`
- [x] 2.12 `tests/local/FA-SF-60-partial-deploy.bats`
- [x] 2.13 `tests/local/FA-SF-63-scout-deterministic.bats`

## 3. Generierte Indizes

- [x] 3.1 `task test:inventory` regenerieren und committen

## 4. Verify

- [x] 4.1 `task test:factory` — 182 Tests, 0 Fehler
- [x] 4.2 `tests/spec/software-factory.bats` erneut grün (mit portiertem Test)
- [ ] 4.3 `task freshness:check`
- [ ] 4.4 `openspec validate fix-fa-sf-20-pipeline-contract`

## 5. Commit & PR

- [ ] 5.1 Commit: `fix(tests): remove 13 legacy FA-SF bats files referencing deleted pipeline.js [T002421]`
- [ ] 5.2 Push branch und PR erstellen
