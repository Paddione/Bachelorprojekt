---
title: "mishap-bundle-dev-flow-scripts — Implementation Plan"
ticket_id: T002342
domains: [scripts, dev-flow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-bundle-dev-flow-scripts — Implementation Plan

_Ticket: T002342_

## File Structure

```
CHANGED:
  tests/unit/plan-lint.bats              — add regression test for W3 partial-mode + line-suffix
  tests/unit/fixtures/plan-lint/w3-partial-line-suffix.md  — new test fixture (index plan)
  tests/unit/fixtures/plan-lint/w3-partial-line-suffix/    — new fixture directory
VERIFIED (already fixed, no code change needed):
  scripts/plan-lint.sh                   — T002375-p6 fix already in place
  CLAUDE.md                              — already references vda.sh frontmatter
  scripts/batch-workflow-gen.sh          — already uses chore(factory) scope
  scripts/brain-ingest.sh                — already uses chore(agents) scope
```

## Tasks

### 1. Regressionstest für W3-Partial-Mode (Mishap 1)

**Files:** `tests/unit/plan-lint.bats`, `tests/unit/fixtures/plan-lint/`

Erstelle ein Partial-Plan-Fixture und einen BATS-Test:

1. Erstelle Verzeichnis: `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/`
2. Erstelle Index-Plan `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.md` mit:
   - `## File Structure` die `scripts/register-scope.sh` listet
   - `## Partials`-Tabelle, die auf `tasks.d/p1-impl.md` verweist
3. Erstelle `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.d/p1-impl.md` mit:
   - einem Task, der `scripts/register-scope.sh:6-31` (mit Zeilenbereich-Suffix) referenziert
4. Füge Test in `tests/unit/plan-lint.bats` hinzu:
   - Lintet das Partial-Plan-Fixture
   - Erwartet: exit 0, KEIN W3 für `scripts/register-scope.sh`
5. Führe den Test aus — erwartet: FAIL (RED), weil kein Fix in tests.d/ nötig ist — der Fix ist bereits im Code (T002375-p6). Der Test dient als Regression Guard.

```bash
bash tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats --filter "W3 partial"
# expected: FAIL (red — the fix is not yet implemented, tests are new and reference the fixture)
```

### 2. Verifikation Mishap 2 — CLAUDE.md

**Files:** CLAUDE.md

Prüfe dass CLAUDE.md `vda.sh frontmatter` referenziert und `plan-frontmatter-hook.sh` nur im Deprecation-Hinweis.

```bash
# Verify: vda.sh frontmatter is the active reference
grep -n 'vda.sh frontmatter' CLAUDE.md
# Expected: line 49 — active command reference

# Verify: plan-frontmatter-hook.sh only appears in deprecation context
grep -n 'plan-frontmatter-hook.sh' CLAUDE.md
# Expected: ONLY on line 49 inside the deprecation notice
# Expected: FAIL if additional references exist outside deprecation
```

### 3. Verifikation Mishap 3 — Commit-Scopes

**Files:** scripts/batch-workflow-gen.sh, scripts/brain-ingest.sh

Prüfe dass keine unerlaubten Scopes (`batch`, `ingest`) in Commit-Messages generiert werden.

```bash
# Verify batch-workflow-gen.sh uses only valid scopes
grep -E 'git commit.*chore\(' scripts/batch-workflow-gen.sh
# Expected: only chore(factory) — FAIL if chore(batch) appears

# Verify brain-ingest.sh uses only valid scopes
grep -E 'git commit.*chore\(|--title.*chore\(' scripts/brain-ingest.sh
# Expected: only chore(agents) — FAIL if chore(ingest) appears

# Verify both scopes exist in commitlint config allowlist
grep -E "'factory'|'agents'" commitlint.config.cjs
# Expected: both present in NAMED_SCOPES array
```

### 4. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## File Budgets

| File | Budget (Zeilen) | Ist |
|------|-----------------|-----|
| `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.md` | n/a (neu) | ~40 |
| `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.d/p1-impl.md` | n/a (neu) | ~20 |
| `tests/unit/plan-lint.bats` | 600 (bestehend) | 221 + ~30 |
