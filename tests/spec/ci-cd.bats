#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# G-CD02: post-merge.yml muss konkurrierende Runs serialisieren (concurrency)
# und transiente Ticket-Status-Updates mit Backoff wiederholen (retry).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/post-merge.yml"
  BUILD_WF="$REPO_ROOT/.github/workflows/build-website.yml"
}

@test "G-CD02: post-merge.yml deklariert eine top-level concurrency-Group" {
  grep -qE '^concurrency:' "$WF"
}

@test "G-CD02: concurrency bricht laufende Deploys NICHT ab" {
  grep -qE 'cancel-in-progress:[[:space:]]*false' "$WF"
}

@test "G-CD02: beide Ticket-Status-Updates laufen durch retry()" {
  run grep -cE 'retry[[:space:]]+bash[[:space:]]+scripts/ticket.sh[[:space:]]+update-status' "$WF"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "G-CQ03: website/eslint.config.js exists" {
  [ -f "$REPO_ROOT/website/eslint.config.js" ]
}

@test "G-CQ03: website package.json has a lint script with --max-warnings 0" {
  run jq -r '.scripts.lint // ""' "$REPO_ROOT/website/package.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"eslint"* ]]
  [[ "$output" == *"--max-warnings 0"* ]]
}

@test "G-CQ03: ci.yml wires an ESLint gate step" {
  grep -Eq 'eslint|lint' "$REPO_ROOT/.github/workflows/ci.yml"
  grep -q -- '--max-warnings 0' "$REPO_ROOT/.github/workflows/ci.yml"
}

@test "G-CQ03: ESLint runs clean (0 warnings) when deps are installed" {
  if [ ! -x "$REPO_ROOT/website/node_modules/.bin/eslint" ]; then
    skip "website deps not installed in this context — enforced by CI vitest-website job"
  fi
  run bash -c "cd '$REPO_ROOT/website' && ./node_modules/.bin/eslint . --max-warnings 0"
  [ "$status" -eq 0 ]
}

# --- G-CD01: Brand-Parity im Website-Deploy (T001276) ---
# build-website.yml muss korczewski in einem Job deployen, der NICHT vom
# mentolder-Deploy-Job abhängt — ein mentolder-Fehler darf korczewski nicht
# still überspringen. SSOT: openspec/specs/ci-cd.md.

@test "G-CD01: build-website.yml hat einen build-image Job mit image+sha_tag outputs" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'build-image' in jobs, 'kein build-image Job'
outs = jobs['build-image'].get('outputs') or {}
assert 'image' in outs, 'build-image hat kein image output'
assert 'sha_tag' in outs, 'build-image hat kein sha_tag output'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: deploy-mentolder needs build-image und NICHT deploy-korczewski" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'deploy-mentolder' in jobs, 'kein deploy-mentolder Job'
needs = jobs['deploy-mentolder'].get('needs', [])
if isinstance(needs, str): needs = [needs]
assert 'build-image' in needs, 'deploy-mentolder muss build-image brauchen'
assert 'deploy-korczewski' not in needs, 'deploy-mentolder darf nicht von deploy-korczewski abhaengen'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: deploy-korczewski needs build-image und NICHT deploy-mentolder" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'deploy-korczewski' in jobs, 'kein deploy-korczewski Job'
needs = jobs['deploy-korczewski'].get('needs', [])
if isinstance(needs, str): needs = [needs]
assert 'build-image' in needs, 'deploy-korczewski muss build-image brauchen'
assert 'deploy-mentolder' not in needs, 'deploy-korczewski muss unabhaengig von deploy-mentolder sein'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: beide Deploy-Jobs lesen den Image-Tag aus build-image outputs" {
  grep -q 'needs.build-image.outputs.image' "$BUILD_WF"
  grep -q 'needs.build-image.outputs.sha_tag' "$BUILD_WF"
}

# --- G-CD01 (T001276): Dockerfile lockfile must be pnpm-lock.yaml ---
# T001224 deleted `website/package-lock.json` (pnpm migration). A reference
# that slipped through the migration (e.g. `COPY website/package-lock.json`
# in `website/Dockerfile`) makes every `build-website.yml` run fail at the
# `docker build` step with `"/website/package-lock.json": not found`. Lock
# the migration in: the Dockerfile must reference pnpm-lock.yaml + pnpm.

@test "G-CD01: website/Dockerfile referenziert pnpm-lock.yaml (nicht package-lock.json)" {
  DOCKERFILE="$REPO_ROOT/website/Dockerfile"
  run grep -nE 'pnpm-lock\.yaml' "$DOCKERFILE"
  [ "$status" -eq 0 ]
  # Allow references in comments (lines starting with `#`); only forbid
  # actual COPY/ADD/RUN/ENV lines that would break `docker build` when
  # website/package-lock.json is gone (deleted by T001224).
  ! grep -vE '^\s*#' "$DOCKERFILE" | grep -qE 'package-lock\.json'
}

@test "G-CD01: website/Dockerfile benutzt pnpm install (nicht npm ci)" {
  DOCKERFILE="$REPO_ROOT/website/Dockerfile"
  run grep -nE 'pnpm install' "$DOCKERFILE"
  [ "$status" -eq 0 ]
  ! grep -qE '^[^#]*\bnpm ci\b' "$DOCKERFILE"
}

# ── G-CI01: CI Pipeline Stability ─────────────────────────────────────────────
# Requirement: Post-merge Freshness-Regenerierung ohne externe GPG-Action
# Requirement: Website Dockerfile verwendet pnpm als Package-Manager

@test "G-CI01-A: freshness-regen.yml enthält keinen ghaction-import-gpg-Verweis" {
  run grep -c "ghaction-import-gpg" "$REPO_ROOT/.github/workflows/freshness-regen.yml"
  [ "$status" -ne 0 ] || [ "$output" -eq 0 ]
}

@test "G-CI01-B: Dockerfile COPY-Zeile referenziert pnpm-lock.yaml (nicht package-lock.json)" {
  ! grep -q "package-lock.json" "$REPO_ROOT/website/Dockerfile"
  grep -q "pnpm-lock.yaml" "$REPO_ROOT/website/Dockerfile"
}

@test "G-CI01-C: Dockerfile nutzt pnpm install --frozen-lockfile (nicht npm ci)" {
  ! grep -q "npm ci" "$REPO_ROOT/website/Dockerfile"
  grep -q "pnpm install --frozen-lockfile" "$REPO_ROOT/website/Dockerfile"
}

@test "G-CI01-D: website/pnpm-lock.yaml existiert; website/package-lock.json existiert nicht" {
  [ -f "$REPO_ROOT/website/pnpm-lock.yaml" ]
  [ ! -f "$REPO_ROOT/website/package-lock.json" ]

# G-SIZE04: LOC-Budget-Gate (S6)

@test "G-SIZE04: scripts/check-loc-budget.mjs exists" {
  [ -f "$REPO_ROOT/scripts/check-loc-budget.mjs" ]
}

@test "G-SIZE04: --update-baseline writes valid JSON with required keys" {
  TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
  run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --update-baseline --baseline="$TMPBASELINE"
  [ "$status" -eq 0 ]
  run node -e "const d=JSON.parse(require('fs').readFileSync('$TMPBASELINE','utf8')); process.exit(d.total_lines>0&&d.file_count>0&&d.commit&&d.thresholds?0:1)"
  rm -f "$TMPBASELINE"
  [ "$status" -eq 0 ]
}

@test "G-SIZE04: exits 0 when LOC matches baseline (idempotent)" {
  run node "$REPO_ROOT/scripts/check-loc-budget.mjs" \
    --baseline="$REPO_ROOT/docs/code-quality/loc-budget.json"
  [ "$status" -eq 0 ]
}

@test "G-SIZE04: exits 0 when LOC decreases below baseline" {
  TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
  echo '{"total_lines":9999999,"file_count":9999,"commit":"test","measured_at":"now","thresholds":{"warn_pct":5,"fail_pct":15,"absolute_cap":9999999}}' > "$TMPBASELINE"
  run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline="$TMPBASELINE"
  rm -f "$TMPBASELINE"
  [ "$status" -eq 0 ]
}

@test "G-SIZE04: exits 1 when absolute_cap is exceeded" {
  TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
  echo '{"total_lines":1,"file_count":1,"commit":"test","measured_at":"now","thresholds":{"warn_pct":5,"fail_pct":15,"absolute_cap":1}}' > "$TMPBASELINE"
  run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline="$TMPBASELINE"
  rm -f "$TMPBASELINE"
  [ "$status" -eq 1 ]
}

@test "G-SIZE04: exits 1 when baseline file is missing" {
  run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline=/nonexistent/loc-budget.json
  [ "$status" -eq 1 ]

}
