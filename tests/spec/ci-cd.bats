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
