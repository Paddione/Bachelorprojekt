---
title: "openspec-drift-gate — Implementation Plan"
ticket_id: T001979
domains: [ci, openspec]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-drift-gate — Implementation Plan

_Ticket: T001979_

Advisory-only Phase 1 spec-drift gate. A new script `scripts/openspec-drift-check.sh`
warns (never blocks) when a `feat:`/`fix:` PR changes files that map to an SSOT spec via
`openspec/component-map.yaml` but touches neither the SSOT spec nor a delta spec. The gate
runs as a dedicated `pull_request`-only step in the existing `test-bats` CI job. Exit-code
contract: `0` = ok / advisory warning, `1` = only under `DRIFT_CHECK_ENFORCE=1` (Phase-2
opt-in, unset in CI), `>=2` = script error (fails the CI step). Bypass via `SKIP_SPEC_DRIFT=1`.

## File Structure

| File | Ist-Zeilen | Budget | Änderung |
|---|---|---|---|
| `scripts/openspec-drift-check.sh` | 0 (neu) | 500 (`.sh`-Limit, unbaselined) | Neues Gate-Skript inkl. `--self-test`; ~150–190 Z. geplant |
| `.github/workflows/ci.yml` | 521 | ungated (`.yml` nicht in `s1.limits`) | +1 advisory Step im `test-bats`-Job (nach Z. 110) |
| `tests/spec/ci-cd.bats` | 324 | ungated (`.bats` nicht in `s1.limits`) | Neue `@test`-Blöcke (G-CD03) anhängen |
| `openspec/changes/openspec-drift-gate/specs/ci-cd.md` | vorhanden (Skeleton) | ungated (`.md`) | Delta-Spec füllen, Parent-SSOT `ci-cd` |

<!-- vitest: kein neuer Test nötig, weil dies ein Bash/CI-Feature ist; die einzige
     website/src-Erwähnung ist ein synthetischer Self-Test-Fixture-Pfad, keine echte Datei. -->

Referenz-Vorbilder (reale Signaturen): Parser + Longest-Prefix-Match
`scripts/openspec-context.sh:41-72`, Changed-Files
`BASE=$(git merge-base HEAD origin/main); git diff --name-only "$BASE" HEAD`
(`scripts/openspec-context.sh:31-35`), Struktur/`--self-test`/Exit-Codes
`scripts/check-commit-vs-diff.sh:36-126`, feat/fix-Weiche
`case "$COMMIT_TITLE" in feat:*|fix:*)` (`.github/workflows/post-merge.yml:152-157`),
CI-Step-Muster `.github/workflows/ci.yml:459-468`.

## Task 1 — Gate-Skript `scripts/openspec-drift-check.sh` (Kernlogik)

Neues Skript. Kopfkommentar dokumentiert den Exit-Code-Vertrag (0 = ok/advisory,
1 = nur `DRIFT_CHECK_ENFORCE=1`, `>=2` = Skript-Fehler). `set -uo pipefail` (kein `-e`,
damit `git`-Fallbacks nicht hart abbrechen — analog `check-commit-vs-diff.sh:31`).

Reihenfolge der Weichen: Repo-Root ermitteln → `--self-test` (Task 2) → Bypass
`SKIP_SPEC_DRIFT=1` → feat/fix-Erkennung → Mapping → Drift-Report.

```bash
#!/usr/bin/env bash
# openspec-drift-check.sh — advisory OpenSpec spec-drift gate (Phase 1).
# Warns when a feat/fix PR changes spec-mapped files without touching the spec.
# Exit codes: 0 = ok / advisory warning, 1 = drift under DRIFT_CHECK_ENFORCE=1,
#             >=2 = script error (CI step MUST fail). Bypass: SKIP_SPEC_DRIFT=1.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
[[ -n "$REPO_ROOT" ]] || { echo "openspec-drift-check: not inside a git repository" >&2; exit 2; }
MAP_FILE="$REPO_ROOT/openspec/component-map.yaml"
ENFORCE="${DRIFT_CHECK_ENFORCE:-0}"

# --- self-test hook (see Task 2) ---
if [[ "${1:-}" == "--self-test" ]]; then run_self_test; exit $?; fi

# --- explicit bypass (repo convention, mirrors SKIP_COMMIT_VS_DIFF) ---
if [[ "${SKIP_SPEC_DRIFT:-0}" == "1" ]]; then
  echo "openspec-drift-check: skipped (SKIP_SPEC_DRIFT=1)"; exit 0
fi

# --- feat/fix detection: PR title prefix, else branch-name fallback ---
PR_TITLE="${PR_TITLE:-}"
if [[ -n "$PR_TITLE" ]]; then
  if ! echo "$PR_TITLE" | grep -qE '^(feat|fix)(\([^)]+\))?(!)?:'; then
    echo "openspec-drift-check: skipped — not a feat/fix PR ($PR_TITLE)"; exit 0
  fi
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  case "$BRANCH" in
    feature/*|fix/*) ;;
    *) echo "openspec-drift-check: skipped — not a feature/fix branch ($BRANCH)"; exit 0 ;;
  esac
fi
```

Mapping + Changed-Files (Parser-Semantik 1:1 aus `openspec-context.sh` übernommen —
identische Präzedenz, kein Drift zur Kontext-Injektion):

```bash
BASE=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse origin/main 2>/dev/null || echo "HEAD^")
mapfile -t CHANGED < <(git diff --name-only "$BASE" HEAD 2>/dev/null || true)

declare -A PREFIX_TO_SPEC; declare -a PREFIX_ORDER
while IFS= read -r line; do
  line="${line%%#*}"; line="${line#"${line%%[! ]*}"}"
  if [[ "$line" == "- prefix:"* ]]; then
    current_prefix="${line#- prefix: }"; current_prefix="${current_prefix//[\'\"]/}"
    current_prefix="${current_prefix%"${current_prefix##*[! ]}"}"
  elif [[ "$line" == "spec:"* ]]; then
    spec_slug="${line#spec: }"; spec_slug="${spec_slug//[\'\"]/}"
    spec_slug="${spec_slug%"${spec_slug##*[! ]}"}"
    [[ -n "${current_prefix:-}" && -n "$spec_slug" ]] && \
      { PREFIX_TO_SPEC["$current_prefix"]="$spec_slug"; PREFIX_ORDER+=("$current_prefix"); }
  fi
done < "$MAP_FILE"

declare -A MATCHED MATCH_FILE
for f in "${CHANGED[@]}"; do
  for prefix in "${PREFIX_ORDER[@]}"; do
    if [[ "$f" == "$prefix"* ]]; then
      slug="${PREFIX_TO_SPEC[$prefix]}"; MATCHED["$slug"]=1
      [[ -z "${MATCH_FILE[$slug]:-}" ]] && MATCH_FILE["$slug"]="$f"; break
    fi
  done
done
```

"Spec angefasst?" (Design E4: direkter SSOT-Edit ODER Delta-Spec nach Parent-Slug):

```bash
spec_touched() {  # $1 = slug
  local f
  for f in "${CHANGED[@]}"; do
    [[ "$f" == "openspec/specs/${1}.md" ]] && return 0
    [[ "$f" == openspec/changes/*/specs/${1}.md ]] && return 0
  done
  return 1
}

drift=0
for slug in "${!MATCHED[@]}"; do
  spec_touched "$slug" && continue
  echo "DRIFT: $slug <- ${MATCH_FILE[$slug]}"
  echo "::warning::openspec-drift: code mapped to spec '$slug' changed but no spec/delta touched"
  [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && \
    echo "- DRIFT: \`$slug\` <- \`${MATCH_FILE[$slug]}\`" >> "$GITHUB_STEP_SUMMARY"
  drift=$((drift + 1))
done

if [[ "$drift" -gt 0 ]]; then
  echo "openspec-drift-check: $drift spec-drift warning(s) (advisory)"
  [[ "$ENFORCE" == "1" ]] && exit 1
fi
exit 0
```

S4-Hinweis: Das neue `scripts/openspec-drift-check.sh` wird in Task 3 von `ci.yml`
aufgerufen und in Task 4 von `tests/spec/ci-cd.bats` getestet → kein Orphan.

## Task 2 — `--self-test`-Modus (synthetische Fälle)

Implementiere die Funktion `run_self_test` (Vorbild `check-commit-vs-diff.sh:52-126`):
temporäres Git-Repo via `mktemp -d`, minimale `openspec/component-map.yaml` +
`openspec/specs/`-Ordner, zwei Commits (main-Basis + Feature-Diff), dann das Skript
mit gesetzten Env-Vars aufrufen. Vier Fälle gemäß Design E8:

1. `feat:`-PR ändert `website/src/lib/tickets/x.ts` ohne Spec → genau eine `DRIFT:`-Zeile, Exit 0.
2. Gleicher Diff + Delta-Spec `openspec/changes/demo/specs/<slug>.md` → keine `DRIFT:`-Zeile, Exit 0.
3. `chore:`-PR-Titel → Skip-Meldung, keine Prüfung, Exit 0.
4. `SKIP_SPEC_DRIFT=1` → Skip-Meldung, Exit 0.

`run_self_test` gibt bei Erfolg `openspec-drift-check: self-test passed` aus und `return 0`,
sonst `return 1`. Assertions greifen auf stdout (`grep -c 'DRIFT: '`) und den Exit-Status zu.

## Task 3 — CI-Einbindung in `.github/workflows/ci.yml`

Neuer Step im `test-bats`-Job, direkt nach dem Freshness-Step (Z. 110), `pull_request`-only.
KEIN `continue-on-error`: das Skript gibt bei Drift selbst Exit 0 zurück (advisory), ein
Exit `>=2` (Syntax-/Logikfehler) MUSS die CI weiterhin rot machen. `PR_TITLE` wird — wie im
Ticket-Tag-Step (Z. 459-468) — über eine Env-Var aus dem Event-Payload gereicht, nicht
direkt interpoliert.

```yaml
      - name: OpenSpec spec-drift advisory gate [T001979]
        if: github.event_name == 'pull_request'
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          # Advisory Phase 1: drift => exit 0 (warnings only). exit >=2 means the
          # script itself broke and MUST fail CI — so NO continue-on-error here.
          bash scripts/openspec-drift-check.sh
```

## Task 4 — RED→GREEN: BATS-Tests in `tests/spec/ci-cd.bats`

Hänge die G-CD03-Blöcke an `tests/spec/ci-cd.bats` an (SSOT-Kommentar `openspec/specs/ci-cd.md`
ist bereits Datei-Header). `REPO_ROOT` ist im vorhandenen `setup()` gesetzt. Die grep-Regexes
matchen die in Task 1/3 gezeigten Snippets wörtlich (`DRIFT: `, `DRIFT_CHECK_ENFORCE`,
`SKIP_SPEC_DRIFT`, `--self-test`, `openspec-drift-check.sh`).

```bash
# --- G-CD03: advisory OpenSpec spec-drift gate (T001979) ---
@test "G-CD03: openspec-drift-check.sh exists and is executable" {
  [ -x "$REPO_ROOT/scripts/openspec-drift-check.sh" ]
}

@test "G-CD03: drift gate --self-test passes" {
  run bash "$REPO_ROOT/scripts/openspec-drift-check.sh" --self-test
  [ "$status" -eq 0 ]
}

@test "G-CD03: SKIP_SPEC_DRIFT=1 bypasses with exit 0" {
  run env SKIP_SPEC_DRIFT=1 bash "$REPO_ROOT/scripts/openspec-drift-check.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"skipped"* ]]
}

@test "G-CD03: chore titles are skipped (no drift evaluation)" {
  run env PR_TITLE="chore: housekeeping" bash "$REPO_ROOT/scripts/openspec-drift-check.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"skipped"* ]]
}

@test "G-CD03: script emits greppable DRIFT: lines and honours enforce switch" {
  grep -qE 'DRIFT: ' "$REPO_ROOT/scripts/openspec-drift-check.sh"
  grep -q 'DRIFT_CHECK_ENFORCE' "$REPO_ROOT/scripts/openspec-drift-check.sh"
}

@test "G-CD03: ci.yml wires the advisory drift step (pull_request only)" {
  grep -q 'openspec-drift-check.sh' "$REPO_ROOT/.github/workflows/ci.yml"
}
```

**Failing-Test-Step (RED).** Füge die G-CD03-Blöcke zuerst hinzu, BEVOR das Skript existiert,
und lauf sie:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL (rot — scripts/openspec-drift-check.sh existiert noch nicht,
#                 daher schlagen die G-CD03-Blöcke fehl)
```

**Fix-Step (GREEN).** Implementiere Task 1–3, mache das Skript ausführbar
(`chmod +x scripts/openspec-drift-check.sh`) und lauf dieselben Tests erneut:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# jetzt grün: alle G-CD03-Blöcke bestehen
```

## Task 5 — Delta-Spec `openspec/changes/openspec-drift-gate/specs/ci-cd.md`

Fülle die Delta-Spec (Parent-SSOT `ci-cd`) im OpenSpec-Format: `## ADDED Requirements`,
`### Requirement: Advisory OpenSpec Drift Gate` (englisch), mit `#### Scenario:`-Blöcken
(Given/When/Then) für: Drift-Warnung, Delta-Spec-Unterdrückung, chore/Bypass-Skip,
Enforce-Modus, Self-Test. Danach:

```bash
bash scripts/openspec.sh validate
```

## Task 6 — Test-Inventar aktualisieren

Nach der Test-Änderung in Task 4 das Inventar regenerieren und mitcommitten (CI-Gate):

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/ci-cd.bats
```

## Task 7 — Finale Verifikation

```bash
bash scripts/openspec-drift-check.sh --self-test   # self-test grün
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats  # G-CD03 grün
bash scripts/plan-lint.sh openspec/changes/openspec-drift-gate/tasks.md
task test:changed
task freshness:regenerate
task freshness:check
```
