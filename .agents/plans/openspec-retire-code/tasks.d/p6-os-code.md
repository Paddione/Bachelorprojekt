# p6 — OpenSpec aus Code, CI und Skills lösen (6/7)

Ticket: T900725. Kontext: `design.md`. 42 Dateien.

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

- `tests/spec/openspec-workflow.bats`
- `tests/spec/openspec-workflow/archive-atomic-guards.bats`
- `tests/spec/openspec-workflow/archive-consistency.bats`
- `tests/spec/openspec-workflow/archive-deliverable-guard.bats`
- `tests/spec/openspec-workflow/archive-no-merge.bats`
- `tests/spec/openspec-workflow/archive-regen-spec-atlas.bats`
- `tests/spec/openspec-workflow/archive-status-offline-staging.bats`
- `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats`
- `tests/spec/openspec-workflow/delta-scenario-guard.bats`
- `tests/spec/openspec-workflow/design-location-guard.bats`
- `tests/spec/openspec-workflow/half-archive-fork-scaling.bats`
- `tests/spec/openspec-workflow/half-archive-guard.bats`
- `tests/spec/openspec-workflow/half-archive-uncommitted.bats`
- `tests/spec/openspec-workflow/half-archive-unprefixed.bats`
- `tests/spec/openspec-workflow/main-staging-guard.bats`
- `tests/spec/openspec-workflow/orphan-archive.bats`
- `tests/spec/openspec-workflow/orphan-detect.bats`
- `tests/spec/openspec-workflow/propose-help.bats`
- `tests/spec/openspec-workflow/propose-tasks-testpath-guard.bats`
- `tests/spec/openspec-workflow/spec-atlas-generator.bats`
- `tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats`
- `tests/spec/openspec-workflow/status-map-fail-closed-guard.bats`
- `tests/spec/openspec-workflow/ticket-file-required.bats`
- `tests/spec/openspec-worktree-anchor.bats`
- `tests/spec/plan-partials-embedding/build-chunks.bats`
- `tests/spec/plan-partials-embedding/coverage-gate.bats`
- `tests/spec/plan-partials-embedding/k1-embeds.bats`
- `tests/spec/plan-partials-embedding/manifest-parser.bats`
- `tests/spec/pr-refresh.bats`
- `tests/spec/pre-commit-freshness.bats`
- `tests/spec/repo-hygiene/worktree-clean-check-existence.bats`
- `tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats`
- `tests/spec/rustdesk-server.bats`
- `tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats`
- `tests/spec/selection-integrity/live-snapshot.txt`
- `tests/spec/sessions-server/annotation-links.bats`
- `tests/spec/t001353-mishap-bundle-ci-tickets.bats`
- `tests/spec/t001591.bats`
- `tests/unit/brain-verify-refs.bats`
- `tests/unit/check-commit-vs-diff.bats`
- `tests/unit/cockpit-epics.test.ts`
- `tests/unit/scripts/stage-plan.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
