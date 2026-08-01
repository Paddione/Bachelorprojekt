# Proposal: mishap-bundle-dev-flow-scripts

## Why

Drei Mishaps im dev-flow und in Skripten (gesammelt als T002342), die bereits durch separate Fixes in main behoben wurden. Dieser Proposal dokumentiert die Fixes und stellt sie durch Regressionstests sicher:

- **M1:** plan-lint W3-Fehlerkennung bei partial-mode Plänen — Fixed in T002375-p6 (tasks.d/-Inhalte in W3-Check einbezogen)
- **M2:** CLAUDE.md referenzierte `plan-frontmatter-hook.sh` statt `vda.sh frontmatter` — Fixed direkt
- **M3:** Unerlaubte Commit-Scopes `chore(batch)` und `chore(ingest)` — Fixed auf `chore(factory)` bzw. `chore(agents)`

## What

1. **Regressionstest für M1:** BATS-Test, der ein Partial-Plan-Fixture mit Zeilenbereich-Referenzen (`:6-31`) lintet und sicherstellt, dass W3 nicht fälschlich feuert
2. **Verifikation M2:** grep-Check auf CLAUDE.md: kein `plan-frontmatter-hook.sh` ausserhalb des Deprecation-Hinweises
3. **Verifikation M3:** grep-Check auf `batch-workflow-gen.sh` + `brain-ingest.sh`: kein `chore(batch)` oder `chore(ingest)` mehr
4. **CI-Gates:** `task test:changed`, `task freshness:regenerate`, `task freshness:check`

_Ticket: T002342_
