# p5 — OpenSpec aus Code, CI und Skills lösen (5/7)

Ticket: T900725. Kontext: `design.md`. 45 Dateien.

## Regeln

Verhalten ändert sich: OpenSpec wird als Mechanismus entfernt (ADR-010).
Pläne liegen bereits unter `.agents/plans/<slug>/`, das bleibt.

Pro Datei entscheiden und die erste passende Regel anwenden:

1. **Test prüft OpenSpec-Verhalten** (Validator, Archiv, Propose, Delta, `openspec/specs`-Inhalt,
   `openspec-status.json`) → den `@test`-Block löschen. Bleibt kein Test übrig → Datei löschen (`git rm`).
2. **Test nutzt `openspec/` nur als Beispiel-/Fixture-Pfad** → auf einen Pfad unter `.agents/plans/`
   oder eine Fixture unter `tests/fixtures/` umstellen, Testaussage beibehalten.
3. **Skript/Code liest oder schreibt `openspec/`** → diesen Zweig entfernen. Dient eine Funktion,
   ein Task oder ein Skript nur OpenSpec → komplett entfernen samt Aufrufern (Taskfile, CI, Hooks).
4. **CI-Workflow/Job/Step nur für OpenSpec** → löschen. Required-Check-Namen nicht umbenennen
   (das macht A3b), nur Schritte darin entfernen.
5. **Config-Eintrag** (renovate, commitlint-Scope, gitleaks-Allowlist, vitest-Include, package.json-Script) → Eintrag löschen.
6. **Kommentar/Prosa** → wie A1a: Verweis streichen.

Nach jeder Datei: `grep -in openspec <datei>` ist leer (oder Datei gelöscht). Für geänderte
`.bats`-Dateien `bats <datei>` ausführen. Für geänderte Skripte `bash -n` bzw. `shellcheck`.

## Dateien

- `tests/spec/ci-cd/factory-shard-optimization.bats`
- `tests/spec/ci-cd/gitlab-job-coverage.bats`
- `tests/spec/ci-cd/gitlab-parallel-non-blocking.bats`
- `tests/spec/ci-cd/hybrid-runner-placement.bats`
- `tests/spec/ci-cd/spec-shard-partition.bats`
- `tests/spec/ci-cd/test-inventory-coverage.bats`
- `tests/spec/ci-cd/unknown-scope-names-source.bats`
- `tests/spec/coverage-gate.bats`
- `tests/spec/dev-flow-execute.bats`
- `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`
- `tests/spec/dev-flow-plan/archive-staged-scope.bats`
- `tests/spec/dev-flow-plan/domains-vocabulary.bats`
- `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats`
- `tests/spec/dev-flow-plan/plan-dir-resolution.bats`
- `tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats`
- `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`
- `tests/spec/dev-flow-plan/plan-lint-task-count.bats`
- `tests/spec/dev-flow-plan/plan-preflight-staged-set.bats`
- `tests/spec/dev-flow-plan/task-context.bats`
- `tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats`
- `tests/spec/devflow-selection-archive-hardening.bats`
- `tests/spec/devflow-selection-archive-hardening/merge-commit-selection.bats`
- `tests/spec/divergence-guard/branch-name-guard.bats`
- `tests/spec/harness-workflow-split.bats`
- `tests/spec/local-dev-mesh/no-k3d-context.bats`
- `tests/spec/local-llm-proxy/embed-probe-timeout.bats`
- `tests/spec/local-llm-proxy/embed-skip-visibility.bats`
- `tests/spec/local-llm-proxy/gateway-consumer-lint.bats`
- `tests/spec/local-llm-proxy/gemma-kv-quant.bats`
- `tests/spec/mcp-gateway.bats`
- `tests/spec/mcp-gateway/agy-mcp-permissions.bats`
- `tests/spec/mcp-task-runner/spec-doc-covers-7-tools.bats`
- `tests/spec/openspec-embedding.bats`
- `tests/spec/openspec-embedding/dynamic-port-T003077.bats`
- `tests/spec/openspec-embedding/embed-local-retry-T004608.bats`
- `tests/spec/openspec-embedding/embed-probe-fail-fast.bats`
- `tests/spec/openspec-embedding/port-forward-identity-T002870.bats`
- `tests/spec/openspec-embedding/probe-diagnosis.bats`
- `tests/spec/openspec-embedding/slug-literal-match-T004829.bats`
- `tests/spec/openspec-embedding/windows-entrypoint-T900084.bats`
- `tests/spec/openspec-pgvector/context-retrieve-cli.bats`
- `tests/spec/openspec-pgvector/context-retrieve-fallback.bats`
- `tests/spec/openspec-pgvector/context-retrieve-recall.bats`
- `tests/spec/openspec-ticket-links-evaluation.bats`
- `tests/spec/openspec-upstream-cli.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
