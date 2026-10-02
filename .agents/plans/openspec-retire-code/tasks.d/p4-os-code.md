# p4 — OpenSpec aus Code, CI und Skills lösen (4/7)

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

- `taskfiles/Taskfile.process.yml`
- `taskfiles/Taskfile.quality.yml`
- `tests/evals/routing-docs-guard.bats`
- `tests/factory-eval/fixtures/T001935/expected.json`
- `tests/factory-eval/fixtures/T001940/expected.json`
- `tests/factory-eval/fixtures/T001956/expected.json`
- `tests/fixtures/brain/retrieval-baseline.json`
- `tests/fixtures/brain/retrieval-eval.jsonl`
- `tests/fixtures/mishap-dedupe-korpus.json`
- `tests/local/AGENT-LOCK-03-precommit.bats`
- `tests/spec/.spec-runtime.tsv`
- `tests/spec/active-sessions-hub/ssot-harness-stable-session.bats`
- `tests/spec/agent-lock-session-identity.bats`
- `tests/spec/agent-skills/archive-stage-new-ssot.bats`
- `tests/spec/agent-skills/finalize-archive-frontmatter.bats`
- `tests/spec/agent-skills/finalize-archive-state.bats`
- `tests/spec/agent-skills/finalize-hardening.bats`
- `tests/spec/agent-skills/finalize-plan-ref-whitespace.bats`
- `tests/spec/agent-skills/post-merge-finalize-create-new.bats`
- `tests/spec/agent-skills/post-merge-finalize-t900096.bats`
- `tests/spec/agent-skills/skill-path-references.bats`
- `tests/spec/agent-skills/worktree-git-op-finish.bats`
- `tests/spec/agent-skills/worktree-mid-rebase-guard.bats`
- `tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats`
- `tests/spec/agent-visual-decision.bats`
- `tests/spec/agentic-trends-radar.bats`
- `tests/spec/archive.bats`
- `tests/spec/batch-openspec-embed-fixes.bats`
- `tests/spec/batch-repo-hygiene-ops-fixes.bats`
- `tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats`
- `tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats`
- `tests/spec/brain-k4-brain-wiki/chunking.bats`
- `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats`
- `tests/spec/brain-quality-goals.bats`
- `tests/spec/ci-cd.bats`
- `tests/spec/ci-cd/branch-allowlist-ssot.bats`
- `tests/spec/ci-cd/branch-reaper-empty-answer.bats`
- `tests/spec/ci-cd/branch-reaper-freshness-regen.bats`
- `tests/spec/ci-cd/branch-reaper-local-ref.bats`
- `tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats`
- `tests/spec/ci-cd/branch-reaper-spec-atlas-allowlist.bats`
- `tests/spec/ci-cd/branch-reaper-sweep.bats`
- `tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats`
- `tests/spec/ci-cd/branch-reaper-unmerged-keep.bats`
- `tests/spec/ci-cd/branch-reaper.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
