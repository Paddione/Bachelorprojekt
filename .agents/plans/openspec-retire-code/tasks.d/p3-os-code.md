# p3 — OpenSpec aus Code, CI und Skills lösen (3/7)

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

- `scripts/llm/agent-bench/cases/f2-link-guard/case.json`
- `scripts/llm/agent-bench/cases/f3-status-board/case.json`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/case.json`
- `scripts/llm/agent-bench/cases/f4-worktree-remove-replay/replay.json`
- `scripts/llm/agent-bench/lib/roles/_shared.mjs`
- `scripts/llm/agent-bench/lib/roles/code-worker.mjs`
- `scripts/llm/agent-bench/lib/roles/orchestrator.mjs`
- `scripts/llm/agent-bench/lib/roles/planner.mjs`
- `scripts/llm/loadouts.json`
- `scripts/llm/plan-runner.mjs`
- `scripts/llm/plan-runner/plan.mjs`
- `scripts/llm/start-tablet-rerank.ps1`
- `scripts/openspec-atlas-lib.mjs`
- `scripts/openspec-atlas.sh`
- `scripts/openspec-context.sh`
- `scripts/openspec-drift-check.sh`
- `scripts/openspec-embed-local.sh`
- `scripts/openspec-embed.mjs`
- `scripts/openspec-embed.test.mjs`
- `scripts/openspec-half-archive-check.sh`
- `scripts/openspec-header-inject.sh`
- `scripts/openspec-main-staging-guard.sh`
- `scripts/openspec-merge.mjs`
- `scripts/openspec-orphan-archive.sh`
- `scripts/openspec-orphan-detect.sh`
- `scripts/openspec-status-map.sh`
- `scripts/openspec-telemetry-optout.py`
- `scripts/openspec-validate.ts`
- `scripts/openspec.sh`
- `scripts/plan-context.sh`
- `scripts/plan-intel-filter.sh`
- `scripts/plan-intel.sh`
- `scripts/plan-preflight.sh`
- `scripts/task-context.sh`
- `scripts/ticket-mcp-node/server.mjs`
- `scripts/ticket-mcp/go/internal/tools/mishap.go`
- `scripts/ticket-mcp/go/internal/tools/mishap_no_conversion_test.go`
- `scripts/ticket-mcp/go/internal/tools/workflow.go`
- `scripts/triage/few-shot-examples.json`
- `scripts/vda.sh`
- `scripts/vda/apply/evidence-catalog.yaml`
- `scripts/vda/frontmatter.sh`
- `scripts/vendor-sync.py`
- `scripts/worktree-clean-check.sh`
- `taskfiles/Taskfile.brain.yaml`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
