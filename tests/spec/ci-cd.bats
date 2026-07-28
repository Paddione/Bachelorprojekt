#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# G-CD02: post-merge.yml muss konkurrierende Runs serialisieren (concurrency)
# und transiente Ticket-Status-Updates mit Backoff wiederholen (retry).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/post-merge.yml"
  BUILD_WF="$REPO_ROOT/.github/workflows/build-website.yml"
  E2E_WF="$REPO_ROOT/.github/workflows/e2e.yml"
}

# ── G-E2E02 (T002096): e2e.yml calls `npx playwright test` directly, bypassing
#    the Taskfile's `test:e2e` pre-/post-run curl purge defense-in-depth. If
#    the job hits its 45min timeout mid-suite, GitHub Actions kills the
#    process before Playwright's own globalTeardown can fire, leaving
#    is_test_data=true rows behind in prod (observed: public.inbox_items,
#    1 row per brand, baseline 2026-07-22). This is expected: FAIL — the
#    post-run purge fallback step does not exist yet in e2e.yml.

@test "G-E2E02: e2e.yml has an always()-guarded post-run test-data purge step" {
  run grep -c 'if: always()' "$E2E_WF"
  [ "$status" -eq 0 ]
  # post-merge.yml/build-website.yml aren't in scope here — just assert the
  # purge endpoint is invoked from an always()-guarded step in e2e.yml.
  run grep -B5 'purge-all-test-data' "$E2E_WF"
  [ "$status" -eq 0 ]
  [[ "$output" == *"always()"* ]]
}

@test "T002272-M2: dev-flow-execute Step 5 requests auto-merge before the CI-watch loop" {
  EXEC_SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  merge_line=$(grep -n -- "gh pr merge --auto" "$EXEC_SKILL" | head -1 | cut -d: -f1)
  watch_line=$(grep -n 'devflow-ci-watch.sh' "$EXEC_SKILL" | head -1 | cut -d: -f1)
  [ -n "$merge_line" ] && [ -n "$watch_line" ]
  [ "$merge_line" -lt "$watch_line" ]
}

@test "G-E2E02: e2e.yml post-run purge step posts X-Cron-Secret against the matrix website_url" {
  run grep -A6 'purge-all-test-data' "$E2E_WF"
  [ "$status" -eq 0 ]
  [[ "$output" == *"X-Cron-Secret"* ]]
  [[ "$output" == *'matrix.website_url'* ]]
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
  run bash -c "cd '$REPO_ROOT/website' && ./node_modules/.bin/eslint . --max-warnings 0 --cache"
  [ "$status" -eq 0 ]
}

# --- G-CD01: Brand-Parity im Website-Deploy (T001276) ---
# build-website.yml muss korczewski in einem Job deployen, der NICHT vom
# mentolder-Deploy-Job abhaengt --- ein mentolder-Fehler darf korczewski nicht
# still ueberspringen. SSOT: openspec/specs/ci-cd.md.

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

@test "G-CD01: website/Dockerfile referenziert pnpm-lock.yaml (nicht package-lock.json)" {
  DOCKERFILE="$REPO_ROOT/website/Dockerfile"
  run grep -nE 'pnpm-lock\.yaml' "$DOCKERFILE"
  [ "$status" -eq 0 ]
  ! grep -vE '^\s*#' "$DOCKERFILE" | grep -qE 'package-lock\.json'
}

@test "G-CD01: website/Dockerfile benutzt pnpm install (nicht npm ci)" {
  DOCKERFILE="$REPO_ROOT/website/Dockerfile"
  run grep -nE 'pnpm install' "$DOCKERFILE"
  [ "$status" -eq 0 ]
  ! grep -qE '^[^#]*\bnpm ci\b' "$DOCKERFILE"
}

# --- G-CD01: Health-Goal-Mess-Guard (T001349) ---
# goals.md darf keinen `--workflow <datei>.yml`-Verweis auf eine geloeschte
# .github/workflows/-Datei enthalten -- genau dieser Drift (Workflow konsolidiert/
# umbenannt, Messbefehl nicht nachgezogen) friert einen Health-Goal-Wert dauerhaft
# auf einen toten Datenstrom ein (siehe T001349: build-website-korczewski.yml wurde
# durch T001229 geloescht, der G-CD01-Messbefehl zeigte weiter darauf). Generisch
# gehalten, damit er jede kuenftige Workflow-Umbenennung abfaengt, nicht nur diesen Fall.

@test "G-CD01: goals.md referenziert keine .github/workflows/*.yml-Datei, die nicht existiert" {
  run python3 - "$REPO_ROOT/.claude/lib/goals.md" "$REPO_ROOT/.github/workflows" <<'PY'
import re, sys, pathlib
goals_md, wf_dir = sys.argv[1], pathlib.Path(sys.argv[2])
text = pathlib.Path(goals_md).read_text()
missing = []
for m in re.finditer(r'--workflow\s+([A-Za-z0-9_.-]+\.ya?ml)', text):
    fname = m.group(1)
    if not (wf_dir / fname).is_file():
        missing.append(fname)
assert not missing, f"goals.md referenziert geloeschte Workflow-Dateien: {sorted(set(missing))}"
PY
  [ "$status" -eq 0 ]
}

# G-CI01: CI Pipeline Stability

@test "G-CI01-A: freshness-regen.yml enthaelt keinen ghaction-import-gpg-Verweis" {
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
}

@test "G-CI01-E: freshness-regen.yml Bot-Commit enthaelt [skip ci]" {
  run grep -c "\[skip ci\]" "$REPO_ROOT/.github/workflows/freshness-regen.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

# ── G-COMMIT-VS-DIFF: commit-vs-diff consistency guard (T001434-mishap) ──────
# SSOT: openspec/specs/ci-cd.md "Requirement: commit-vs-diff-consistency-guard"

@test "G-COMMIT-VS-DIFF: scripts/check-commit-vs-diff.sh exists" {
  [ -f "$REPO_ROOT/scripts/check-commit-vs-diff.sh" ]
}

@test "G-COMMIT-VS-DIFF: .githooks/commit-msg exists and is executable" {
  [ -x "$REPO_ROOT/.githooks/commit-msg" ]
}

@test "G-COMMIT-VS-DIFF: .githooks/commit-msg delegates to check-commit-vs-diff.sh" {
  grep -q 'check-commit-vs-diff.sh' "$REPO_ROOT/.githooks/commit-msg"
}

@test "G-COMMIT-VS-DIFF: secrets:install-hooks chmod's the commit-msg hook" {
  # Grab the full secrets:install-hooks task block (until next blank line / new task)
  awk '/^  secrets:install-hooks:/{flag=1; next} flag && /^  [a-z]/{flag=0} flag' \
    "$REPO_ROOT/Taskfile.yml" | grep -q 'chmod +x .githooks/commit-msg'
}

@test "G-COMMIT-VS-DIFF: dev-flow-plan SKILL.md uses chore(plans): for stage commit (NOT fix(<scope>):)" {
  # Regression for T001434-mishap: the dev-flow-plan SKILL.md used to
  # recommend `fix(<scope>):` for the RED-test stage commit, which produced
  # a misleading commit title whose diff contained no production code.
  # The fix is to use `chore(plans):` for the plan-stage commit (matching
  # the feature-path convention) so the commit-vs-diff guard passes.
  local stage_line
  stage_line=$(grep -E 'git commit -m "[^"]*add failing test' "$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md" | head -1)
  [ -n "$stage_line" ]
  [[ "$stage_line" == *"chore(plans):"* ]]
  [[ "$stage_line" != *"fix(<scope>):"* ]]
}

@test "G-COMMIT-VS-DIFF: openspec/specs/ci-cd.md documents the guard requirement" {
  grep -q '^### Requirement: commit-vs-diff-consistency-guard' "$REPO_ROOT/openspec/specs/ci-cd.md"
}

@test "G-COMMIT-VS-DIFF: unit tests in tests/unit/check-commit-vs-diff.bats cover all branches" {
  # Sanity: the unit suite must exercise both allow and block paths
  local bats_file="$REPO_ROOT/tests/unit/check-commit-vs-diff.bats"
  [ -f "$bats_file" ]
  grep -qE 'allows:.*real-code' "$bats_file"
  grep -qE 'blocks:.*T001434' "$bats_file"
  grep -qE 'blocks:.*plan-only' "$bats_file"
  grep -qE 'SKIP_COMMIT_VS_DIFF' "$bats_file"
}

@test "T001446: build-website Pre-Rollout Secret-Check skips optional secretKeyRefs (both deploy jobs)" {
  # Regression for T001446: the check collected ALL website-secrets keys from
  # k3d/website.yaml and hard-failed on cluster-missing ones — even when the
  # manifest marks the ref `optional: true` (SEPA_CREDITOR_*, DEEPSEEK_API_KEY*,
  # schema.yaml required:false). That blocked every korczewski website deploy.
  local wf="$REPO_ROOT/.github/workflows/build-website.yml"
  [ -f "$wf" ]
  local count
  count=$(grep -c "and not v.get('optional')" "$wf")
  [ "$count" -eq 2 ]
}

@test "T001446: secret-check filter behaves correctly against a fixture manifest" {
  # Functional check of the exact python filter line: optional refs excluded,
  # required refs included.
  local out
  out=$(python3 - <<'PY'
import yaml, io
doc = """
spec:
  template:
    spec:
      containers:
        - name: website
          env:
            - name: REQ
              valueFrom: {secretKeyRef: {name: website-secrets, key: REQ}}
            - name: OPT
              valueFrom: {secretKeyRef: {name: website-secrets, key: OPT, optional: true}}
"""
for d in yaml.safe_load_all(io.StringIO(doc)):
    if not d: continue
    for c in (d.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]) or []):
        for e in (c.get('env',[]) or []):
            v = (e.get('valueFrom') or {}).get('secretKeyRef') or {}
            if v.get('name') == 'website-secrets' and v.get('key') and not v.get('optional'):
                print(v['key'])
PY
)
  [ "$out" = "REQ" ]
}

# ── T001453: E2E-Testdaten dürfen nicht unmarkiert in Prod persistieren ──────
# Root Cause: fehlendes CRON_SECRET-Repo-Secret + SKIP_DB_PURGE=1 im nightly
# Workflow + Spec, der ohne Secret unmarkiert submittete. Diese Guards halten
# alle drei Fix-Ebenen fest.

@test "T001453: e2e.yml setzt SKIP_DB_PURGE nicht mehr (Purge-Bracket aktiv)" {
  ! grep -q 'SKIP_DB_PURGE:' "$REPO_ROOT/.github/workflows/e2e.yml"
}

@test "T001453: fa-10 T6 skippt fail-closed ohne CRON_SECRET" {
  grep -q 'test.skip(!cronSecret' "$REPO_ROOT/tests/e2e/specs/fa-10-website.spec.ts"
}

@test "T001453: purge-fn v5 re-markiert unmarkierte E2E-Identitäten" {
  grep -q 'tickets_remarked_unmarked' "$REPO_ROOT/website/src/lib/tickets/migrations.ts"
  grep -q 'inbox_remarked_unmarked' "$REPO_ROOT/website/src/lib/tickets/migrations.ts"
  grep -q 'tickets_remarked_unmarked' "$REPO_ROOT/scripts/one-shot/purge-fn-v5.sql"
}

# ── T001562: main CI post-merge deploy broken by malformed k3d/secrets.yaml ──

@test "T001562: alle k3d/*.yaml parsen als gültiges Multi-Document-YAML" {
  run python3 - "$REPO_ROOT/k3d" <<'PY'
import sys, os, yaml
root = sys.argv[1]
errors = []
for fname in sorted(os.listdir(root)):
  if not fname.endswith(('.yaml', '.yml')):
    continue
  fpath = os.path.join(root, fname)
  try:
    docs = list(yaml.safe_load_all(open(fpath)))
  except yaml.YAMLError as e:
    errors.append(f"{fname}: {e}")
    continue
  if not docs:
    errors.append(f"{fname}: empty (no documents)")
assert not errors, f"YAML parse errors:\n" + "\n".join(errors)
PY
  [ "$status" -eq 0 ]
}

# --- T001873: preflight-pr-scope lowercase-Branch-Regression (Mishap-Ticket) ---
@test "T001873: preflight-pr-scope akzeptiert lowercase Ticket-ID im Branchnamen" {
  local tmp
  tmp="$(mktemp -d)"

  # Fixture ci.yml mit 'docs' als bekanntem Scope (isoliert von echter ci.yml-Drift)
  local fixture="$tmp/ci.yml"
  cat > "$fixture" <<'EOF'
jobs:
  commit-lint:
    steps:
      - uses: amannn/action-semantic-pull-request@v5.5.3
        with:
          scopes: |
            docs
            test
EOF

  # Isoliertes Fixture-Repo direkt auf dem lowercase-Branch aus dem Mishap-Report,
  # nicht main/master/feature/fix -> preflight-pr-scope's Branch-Guards greifen nicht ein.
  git -C "$tmp" init -q -b chore/foo-t999901
  git -C "$tmp" config user.email "test@example.invalid"
  git -C "$tmp" config user.name "Test Fixture"
  git -C "$tmp" commit -q --allow-empty -m "fixture"

  run bash -c "cd '$tmp' && bash '$REPO_ROOT/scripts/preflight-pr-scope.sh' 'chore(docs): x [T999901]' '$fixture'"
  rm -rf "$tmp"

  [ "$status" -eq 0 ]
}

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

# --- T001994: envsubst-Allowlist-Drift-Guard für Taskfile-Deploy-Pfade ---
# Nachwehen von T001993: envsubst laesst ungelistete Variablen still als
# literale ${VAR}-Strings stehen. Drift-Kriterium: Ein Platzhalter im
# gerenderten Prod-Overlay, der in der env_vars:-Sektion von
# environments/schema.yaml registriert ist (Deploy-Zeit-Config), aber in der
# Allowlist des jeweiligen Apply-Pfads fehlt. Runtime-Platzhalter
# (secrets:-Sektion, Shell-Variablen in Container-Skripten) sind absichtlich
# literal und werden ignoriert.

_schema_env_vars() {
  awk '/^env_vars:/{f=1;next} /^secrets:/{f=0} f' "$REPO_ROOT/environments/schema.yaml" \
    | grep -E '^[[:space:]]+- name: [A-Z0-9_]+' | awk '{print $3}' | sort -u
}

# ENVSUBST_VARS-Zeilen eines Taskfile-Tasks (bis zur naechsten Task-Definition).
_taskfile_envsubst_list() { # $1 = task name (z.B. workspace:deploy)
  awk -v task="  $1:" '
    $0 == task {in_task=1; next}
    in_task && /^  [a-zA-Z0-9:_-]+:$/ {exit}
    in_task && /ENVSUBST_VARS=/ {print}
  ' "$REPO_ROOT/Taskfile.yml" | grep -oE '\\\$[A-Z0-9_]+' | tr -d '\\$' | sort -u
}

# Inline-envsubst-Allowlist des website:deploy-Tasks — Union ueber ALLE
# envsubst-Aufrufe des Tasks, nicht nur die grosse $WEBSITE_IMAGE-Liste.
# Der Task substituiert in mehreren separaten Aufrufen (T002163): die Hauptliste,
# je einen fuer $WEBSITE_CONFIG_SHA (T002154/T002156) und mehrere fuer
# $WEBSITE_NAMESPACE. Ein Extraktor, der nur die Hauptliste liest, meldet die
# uebrigen Variablen als "Drift", obwohl der Deploy sie korrekt substituiert —
# genau dieses False Positive hielt drei T001994-Assertions dauerhaft rot.
_website_deploy_list() {
  awk '
    $0 == "  website:deploy:" {in_task=1; next}
    in_task && /^  [a-zA-Z0-9:_-]+:$/ {exit}
    in_task && /envsubst "/ {print}
  ' "$REPO_ROOT/Taskfile.yml" | grep -oE '\\\$[A-Z0-9_]+' | tr -d '\\$' | sort -u
}

_render_placeholders() { # $1 = overlay dir
  kubectl kustomize "$REPO_ROOT/$1" --load-restrictor=LoadRestrictionsNone 2>/dev/null \
    | grep -oE '\$\{[A-Za-z0-9_]+\}' | tr -d '${}' | sort -u
}

# Kern-Assertion: (Platzhalter − Allowlist) ∩ Schema-env_vars muss leer sein.
_assert_no_config_drift() { # $1 = overlay, $2 = allowlist (newline-separiert)
  local ph drift
  ph="$(_render_placeholders "$1")"
  [ -n "$ph" ] || skip "kustomize render leer/nicht verfuegbar fuer $1"
  drift="$(comm -12 <(comm -23 <(echo "$ph") <(echo "$2")) <(_schema_env_vars))"
  if [ -n "$drift" ]; then
    echo "envsubst-Allowlist-Drift in $1 — fehlende Config-Vars: $drift"
    return 1
  fi
}

@test "T001994: Taskfile-Extraktion liefert nicht-leere Allowlists (Guard-Selbsttest)" {
  [ "$(_taskfile_envsubst_list workspace:deploy | wc -l)" -gt 20 ]
  [ "$(_taskfile_envsubst_list workspace:partial-deploy | wc -l)" -gt 20 ]
  [ "$(_website_deploy_list | wc -l)" -gt 20 ]
}

@test "T001994: workspace:deploy Allowlist deckt prod-fleet/mentolder ab" {
  _assert_no_config_drift prod-fleet/mentolder "$(_taskfile_envsubst_list workspace:deploy)"
}

@test "T001994: workspace:deploy Allowlist deckt prod-fleet/korczewski ab" {
  _assert_no_config_drift prod-fleet/korczewski "$(_taskfile_envsubst_list workspace:deploy)"
}

@test "T001994: workspace:partial-deploy Allowlist deckt prod-fleet/mentolder ab" {
  _assert_no_config_drift prod-fleet/mentolder "$(_taskfile_envsubst_list workspace:partial-deploy)"
}

@test "T001994: workspace:partial-deploy Allowlist deckt prod-fleet/korczewski ab" {
  _assert_no_config_drift prod-fleet/korczewski "$(_taskfile_envsubst_list workspace:partial-deploy)"
}

@test "T001994: website:deploy Allowlist deckt prod-fleet/website-mentolder ab" {
  _assert_no_config_drift prod-fleet/website-mentolder "$(_website_deploy_list)"
}

@test "T001994: website:deploy Allowlist deckt prod-fleet/website-korczewski ab" {
  _assert_no_config_drift prod-fleet/website-korczewski "$(_website_deploy_list)"
}

@test "T001994: website:deploy Allowlist deckt k3d/website.yaml (dev) ab" {
  local ph drift
  ph="$(grep -oE '\$\{[A-Za-z0-9_]+\}' "$REPO_ROOT/k3d/website.yaml" | tr -d '${}' | sort -u)"
  drift="$(comm -12 <(comm -23 <(echo "$ph") <(_website_deploy_list)) <(_schema_env_vars))"
  if [ -n "$drift" ]; then
    echo "envsubst-Allowlist-Drift in k3d/website.yaml — fehlende Config-Vars: $drift"
    return 1
  fi
}

# ── T002083: fluxcd-gitops — push→pull CI-Rückbau (SSOT: openspec/specs/ci-cd.md) ──

@test "T002083: deploy-sealed-secrets.yml workflow no longer exists" {
  [ ! -f "$REPO_ROOT/.github/workflows/deploy-sealed-secrets.yml" ]
}

@test "T002083: post-merge.yml has no unguarded task workspace:deploy in deploy-manifests" {
  # After the rebuild the deploy-manifests job is removed or only keeps a
  # FLUX_ENABLED break-glass fallback. Any surviving unguarded step fails.
  run python3 - "$WF" <<'PY'
import sys, re, yaml
doc = yaml.safe_load(open(sys.argv[1])) or {}
job = (doc.get('jobs', {}) or {}).get('deploy-manifests', {}) or {}
offenders = []
for s in (job.get('steps', []) or []):
    run = s.get('run', '') or ''
    if re.search(r'task\s+workspace:deploy', run):
        guard = (s.get('if', '') or '') + run
        if 'FLUX_ENABLED' not in guard:
            offenders.append(s.get('name', run[:40]))
assert not offenders, f'unguarded workspace:deploy steps remain: {offenders}'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: render-fleet-artifact.yml workflow exists" {
  [ -f "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml" ]
}

@test "T002083: render-fleet-artifact.yml pushes an OCI artifact via flux push artifact" {
  run grep -E 'flux[[:space:]]+push[[:space:]]+artifact' \
    "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml"
  [ "$status" -eq 0 ]
}

@test "T002083: render-fleet-artifact.yml pings the Flux Receiver webhook after push" {
  # Receiver ping: a POST to the flux-webhook hook path (host resolved from config,
  # never a brand-domain literal in the workflow).
  run grep -iE 'flux-webhook|/hook/|receiver' \
    "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml"
  [ "$status" -eq 0 ]
}

@test "T002083: build-website.yml wires render-artifact job for FluxCD" {
  run grep -E 'uses:[[:space:]]*\./\.github/workflows/render-fleet-artifact\.yml' "$BUILD_WF"
  [ "$status" -eq 0 ]
}

@test "T002083: build-brett.yml wires render-artifact job for FluxCD" {
  local brett_wf="$REPO_ROOT/.github/workflows/build-brett.yml"
  [ -f "$brett_wf" ]
  run grep -E 'uses:[[:space:]]*\./\.github/workflows/render-fleet-artifact\.yml' "$brett_wf"
  [ "$status" -eq 0 ]
}


# T002118: Ein via `uses:` aufgerufener reusable workflow darf nie mehr Rechte
# verlangen, als der aufrufende Job besitzt — sonst lehnt GitHub den GESAMTEN
# Workflow mit startup_failure ab, bevor ein einziger Job startet. Die
# Validierung laeuft VOR der if:-Auswertung, der Job muss also nicht einmal
# ausgefuehrt werden. post-merge.yml war so 37 Merges lang tot (2026-07-22/23):
# kein Ticket-Closure, kein deploy-legacy, 14 undeployte Manifest-Aenderungen.
@test "T002118: jeder reusable-workflow-Aufruf deckt die Permissions des Callees" {
  run python3 - "$REPO_ROOT" <<'PY'
import glob, os, sys, yaml
root = sys.argv[1]
wf = os.path.join(root, ".github/workflows")
RANK = {"none": 0, "read": 1, "write": 2}

declared = {}
for f in glob.glob(os.path.join(wf, "*.yml")):
    try: declared[os.path.basename(f)] = (yaml.safe_load(open(f)) or {}).get("permissions") or {}
    except Exception: pass

bad = []
for f in sorted(glob.glob(os.path.join(wf, "*.yml"))):
    try: doc = yaml.safe_load(open(f)) or {}
    except Exception: continue
    top = doc.get("permissions")
    for job, spec in (doc.get("jobs") or {}).items():
        if not isinstance(spec, dict): continue
        uses = spec.get("uses", "")
        if not (isinstance(uses, str) and uses.startswith("./.github/workflows/")): continue
        jobperm = spec.get("permissions")
        # Ohne JEDEN expliziten permissions-Block greift der Repo-Default
        # (hier: write). Statisch nicht pruefbar und nicht das Fehlerbild.
        if top is None and jobperm is None: continue
        have = {**(top or {}), **(jobperm or {})}
        need = declared.get(os.path.basename(uses), {})
        missing = {k: v for k, v in need.items()
                   if RANK.get(have.get(k, "none"), 0) < RANK.get(v, 0)}
        if missing:
            bad.append(f"{os.path.basename(f)} job '{job}' -> {os.path.basename(uses)}: fehlt {missing}")

if bad:
    print("Permissions-Konflikt (fuehrt zu startup_failure):")
    for b in bad: print("  " + b)
    sys.exit(1)
print("alle reusable-workflow-Aufrufe decken die Callee-Permissions")
PY
  [ "$status" -eq 0 ]
}

@test "T002118: post-merge.yml render-artifact-Job gewaehrt packages: write" {
  run python3 -c "
import yaml,sys
d=yaml.safe_load(open('$REPO_ROOT/.github/workflows/post-merge.yml'))
p=(d['jobs']['render-artifact'].get('permissions') or {})
sys.exit(0 if p.get('packages')=='write' else 1)
"
  [ "$status" -eq 0 ]
}

# T002121: `task website:migrate` ruft intern `pnpm --dir website db:migrate`
# auf. Ein Job, der den Task ohne pnpm-Setup startet, stirbt mit
# '"pnpm": executable file not found in $PATH' (exit 127). In post-merge.yml
# riss das zusaetzlich den Schritt "Mark ticket done" mit, der im selben Job
# liegt — "Merge = Abschluss" (T001092) blieb dadurch kaputt, obwohl der
# Workflow nach dem T002118-Fix wieder startete.
@test "T002124: jeder Job, der (auch indirekt) pnpm braucht, richtet es ein" {
  # Loest die Task-Kette aus Taskfile.yml auf statt nur Workflow-Text zu
  # greppen. deploy-legacy ruft `task workspace:deploy`, das intern
  # `task website:migrate` startet, das `pnpm` braucht — im Workflow steht
  # davon nichts. Der urspruengliche Guard (T002121) suchte nur nach der
  # woertlichen Nennung von website:migrate und uebersah den Job deshalb.
  run python3 - "$REPO_ROOT" <<'PYEOF'
import glob, os, re, sys, yaml

root = sys.argv[1]
taskfile = open(os.path.join(root, "Taskfile.yml"), encoding="utf-8").read()

# Fixpunkt: welche Tasks ziehen (transitiv) website:migrate nach sich?
needs_pnpm = {"website:migrate"}
starts = [(m.group(1), m.start()) for m in re.finditer(r"^  ([a-z0-9:_-]+):\s*$", taskfile, re.M)]
bodies = {}
for i, (name, pos) in enumerate(starts):
    endpos = starts[i + 1][1] if i + 1 < len(starts) else len(taskfile)
    bodies[name] = taskfile[pos:endpos]

changed = True
while changed:
    changed = False
    for name, body in bodies.items():
        if name in needs_pnpm:
            continue
        if any(re.search(r"task\s+" + re.escape(t) + r"\b", body) for t in needs_pnpm):
            needs_pnpm.add(name)
            changed = True

bad = []
for f in sorted(glob.glob(os.path.join(root, ".github/workflows/*.yml"))):
    try:
        doc = yaml.safe_load(open(f, encoding="utf-8")) or {}
    except Exception:
        continue
    for job, spec in (doc.get("jobs") or {}).items():
        steps = spec.get("steps") if isinstance(spec, dict) else None
        if not steps:
            continue
        runs = " ".join(str(s.get("run", "")) for s in steps)
        hit = [t for t in needs_pnpm if re.search(r"task\s+" + re.escape(t) + r"\b", runs)]
        if not hit:
            continue
        uses = " ".join(str(s.get("uses", "")) for s in steps)
        if "pnpm/action-setup" not in uses:
            bad.append(f"{os.path.basename(f)} job '{job}' ruft {sorted(hit)} ohne pnpm-Setup")

if bad:
    print("Jobs brauchen pnpm (direkt oder ueber die Task-Kette), richten es aber nicht ein:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"OK - {len(needs_pnpm)} pnpm-pflichtige Tasks geprueft")
PYEOF
  [ "$status" -eq 0 ]
}

@test "T002121: 'Mark ticket done' haengt an always(), nicht an success()" {
  # Closure trackt laut T001092 den MERGE, nicht Prod-Live. Eine
  # fehlgeschlagene Migration darf das Ticket nicht offen halten.
  run python3 -c "
import yaml,sys
d=yaml.safe_load(open('$REPO_ROOT/.github/workflows/post-merge.yml'))
steps=d['jobs']['post-deploy-imperative']['steps']
s=[x for x in steps if x.get('name')=='Mark ticket done']
sys.exit(0 if s and 'always()' in str(s[0].get('if','')) else 1)
"
  [ "$status" -eq 0 ]
}

# ── T002157: render-fleet-artifact muss auf seine eigenen Eingaben triggern ────
#
# Der Workflow triggerte nur auf Manifest-Pfade (k3d/**, prod*/**, flux/clusters/**),
# nicht auf scripts/** — obwohl scripts/flux-render-artifact.sh DER RENDERER ist.
# Folge: T002156 aenderte die Render-Logik, das OCI-Artefakt wurde nie neu gebaut,
# und Flux lieferte weiter den alten Stand mit leerer checksum/config aus. Ohne
# workflow_dispatch gab es zudem keine Moeglichkeit, einen Rebuild anzustossen.

@test "T002157: render-fleet-artifact triggert auf den Renderer selbst" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  local wf="${repo_root}/.github/workflows/render-fleet-artifact.yml"
  local missing=""
  for input in flux-render-artifact.sh website-config-sha.sh Taskfile.yml; do
    grep -q "$input" "$wf" || missing="$missing $input"
  done
  [ -z "$missing" ] || {
    echo "FAIL: render-fleet-artifact.yml triggert nicht auf:$missing"
    echo "      Diese Dateien bestimmen den Inhalt des OCI-Artefakts — ohne Trigger"
    echo "      bleibt das Artefakt stale und Flux rollt eine veraltete Version aus."
    return 1
  }
}

@test "T002157: render-fleet-artifact ist manuell ausloesbar" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  grep -qE '^\s*workflow_dispatch:' "${repo_root}/.github/workflows/render-fleet-artifact.yml" || {
    echo "FAIL: kein workflow_dispatch — ein Artefakt-Rebuild laesst sich nicht gezielt"
    echo "      ausloesen, nur ueber einen Dummy-Commit in einem getriggerten Pfad."
    return 1
  }
}

# ── T002158: das Repohealth-Dashboard muss auf Goals-Aenderungen neu gebaut werden ──
#
# Gleiche Klasse wie T002157: website/src/lib/goals-data.generated.json wird per
# statischem ESM-Import (website/src/lib/goals-data.ts:1) ins Astro-Bundle gebacken.
# Neue Health-Goal-Werte erreichen /admin/repohealth also nur ueber ein neues
# Website-Image. Zwei Trigger-Bruechen verhinderten das:
#   A) build-website.yml triggerte nicht auf .claude/lib/goals.md — die Datenquelle.
#   B) freshness-regen.yml haengte [skip ci] unbedingt an; genau dieser Bot-Commit
#      ist der einzige Ort, an dem der Website-JSON ausserhalb eines PRs
#      fortgeschrieben wird, also der einzige Pfad, der den Build ausloesen WUERDE.
# Folge: das Dashboard wurde nur zufaellig aktuell, wenn ein fremder PR nebenbei
# einen website/**-Pfad anfasste (letzter Fall: d1cd912ce).

@test "T002158-A: build-website triggert auf die Repohealth-Datenquelle goals.md" {
  grep -q "\.claude/lib/goals\.md" "$BUILD_WF" || {
    echo "FAIL: build-website.yml triggert nicht auf .claude/lib/goals.md"
    echo "      Diese Datei ist der SSOT von website/src/lib/goals-data.generated.json,"
    echo "      das per statischem Import ins Bundle gebacken wird. Ohne Trigger baut"
    echo "      eine goals-only-Aenderung kein Image und /admin/repohealth bleibt stale."
    return 1
  }
}

@test "T002158-B: freshness-regen setzt [skip ci] nicht unbedingt im Bot-Commit" {
  local wf="$REPO_ROOT/.github/workflows/freshness-regen.yml"
  # Ein hart im commit -m eingebautes [skip ci] unterdrueckt build-website auch dann,
  # wenn der Regen-Commit ein website/**-Artefakt enthaelt.
  ! grep -qE 'git commit -m "[^"]*\[skip ci\]"' "$wf" || {
    echo "FAIL: freshness-regen.yml haengt [skip ci] unbedingt an den Commit-Titel."
    echo "      Enthaelt der Regen-Commit website/**-Artefakte (z.B."
    echo "      goals-data.generated.json), unterdrueckt das den Website-Build und"
    echo "      der ausgelieferte Dashboard-Stand bleibt permanent veraltet."
    echo "      Erwartet: [skip ci] nur wenn KEIN website/**-Pfad betroffen ist."
    return 1
  }
}

@test "T002158-B: freshness-regen prueft den Regen-Diff auf website/-Pfade" {
  local wf="$REPO_ROOT/.github/workflows/freshness-regen.yml"
  grep -q '\^website/' "$wf" || {
    echo "FAIL: kein am Zeilenanfang verankerter website/-Check im Commit-Step."
    echo "      Erwartet: git diff --cached --name-only | grep -q '^website/' —"
    echo "      steuert, ob [skip ci] angehaengt wird. Der Anker verhindert, dass"
    echo "      z.B. docs/website-notes.md faelschlich als Website-Artefakt zaehlt."
    return 1
  }
}

# ── T002161: Renovate lief seit Einfuehrung nie (5/5 Cron-Runs failure).
#    RC1: Repo-Secret RENOVATE_TOKEN existiert nicht.
#    RC2: Die Anleitung in renovate.yml:6-9 ist strukturell unmoeglich — ein
#         GitHub-App-Installation-Token hat 1h TTL und kann nicht als statisches
#         Repo-Secret hinterlegt werden. Fix: actions/create-github-app-token
#         praegt pro Run einen frischen Token aus App-Client-ID + Private Key.
#    RC3: auto-enable-automerge.yml setzt --auto auf JEDER Nicht-Draft-PR und
#         hebelt damit Renovates gestufte automerge-Policy aus (main hat
#         reviews: null). Fix: label-basierte Ausnahme + platformAutomerge.
#    Alle vier Tests sind erwartet: FAIL — der Fix ist noch nicht implementiert.

@test "T002161-A: renovate.yml praegt den Token via create-github-app-token (SHA-gepinnt)" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE 'uses: actions/create-github-app-token@[0-9a-f]{40}' "$wf" || {
    echo "FAIL: kein SHA-gepinnter actions/create-github-app-token-Step in renovate.yml."
    echo "      Ein GitHub-App-Installation-Token hat 1h TTL und kann NICHT als"
    echo "      statisches Repo-Secret hinterlegt werden — der Workflow muss pro Run"
    echo "      einen frischen Token aus RENOVATE_APP_ID + RENOVATE_APP_PRIVATE_KEY"
    echo "      praegen. SHA-Pin ist Pflicht (Konvention renovate.yml: nie @latest fuer"
    echo "      secret-tragende Third-Party-Actions)."
    return 1
  }
}

@test "T002161-A: renovate.yml liest die App-Identitaet aus RENOVATE_APP_ID" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE '^\s+client-id: \$\{\{ secrets\.RENOVATE_APP_ID \}\}' "$wf" || {
    echo "FAIL: create-github-app-token wird nicht mit client-id aus dem Secret"
    echo "      RENOVATE_APP_ID aufgerufen. In v3 wurde app-id durch client-id"
    echo "      ersetzt ('Use client-id instead.'). Der Input-Name wurde migriert,"
    echo "      der Secret-Wert ist weiterhin die numerische App ID."
    return 1
  }
  grep -qE '^\s+private-key: \$\{\{ secrets\.RENOVATE_APP_PRIVATE_KEY \}\}' "$wf" || {
    echo "FAIL: private-key liest nicht aus dem Secret RENOVATE_APP_PRIVATE_KEY."
    return 1
  }
}

@test "T002161-B: renovate.yml uebergibt den gepraegten App-Token, nicht ein statisches Secret" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE 'steps\.[a-z-]+\.outputs\.token' "$wf" || {
    echo "FAIL: renovatebot/github-action bekommt keinen Token aus dem"
    echo "      create-github-app-token-Step (steps.<id>.outputs.token)."
    echo "      Ein direkt referenziertes secrets.RENOVATE_TOKEN ist leer (nie gesetzt)"
    echo "      und laesst Renovate bei der Platform-Auth abbrechen — genau die"
    echo "      Ursache der 5 fehlgeschlagenen Cron-Runs 2026-06-22..2026-07-20."
    return 1
  }
}

@test "T002161-C: auto-enable-automerge.yml nimmt Renovate-PRs (dependencies-Label) aus" {
  local wf="$REPO_ROOT/.github/workflows/auto-enable-automerge.yml"
  grep -q "labels.\*.name" "$wf" && grep -q "dependencies" "$wf" || {
    echo "FAIL: auto-enable-automerge.yml prueft das dependencies-Label nicht."
    echo "      Der Workflow setzt --auto --squash auf JEDER Nicht-Draft-PR gegen main,"
    echo "      und main hat reviews: null (keine Review-Pflicht). Damit mergen auch"
    echo "      Renovate-PRs durch, fuer die renovate.json5 bewusst automerge: false"
    echo "      setzt (major, prod-minor, kubernetes-major) — z.B. ein Vaultwarden-"
    echo "      Minor-Bump, der via Flux auf beide Prod-Brands ausgerollt wird."
    echo "      Erwartet: label-basierter Guard (nicht Bot-Name — der haengt am"
    echo "      frei waehlbaren App-Namen)."
    return 1
  }
}

@test "T002161-D: renovate.json5 labelt seine PRs und setzt platformAutomerge" {
  local cfg="$REPO_ROOT/renovate.json5"
  grep -qE '"labels"\s*:\s*\[' "$cfg" || {
    echo "FAIL: renovate.json5 setzt kein labels: [...]. Ohne Label kann"
    echo "      auto-enable-automerge.yml Renovate-PRs nicht von eigenen PRs"
    echo "      unterscheiden (siehe T002161-C)."
    return 1
  }
  grep -qE '"platformAutomerge"\s*:\s*true' "$cfg" || {
    echo "FAIL: renovate.json5 setzt platformAutomerge nicht explizit auf true."
    echo "      Sobald auto-enable-automerge.yml Renovate-PRs auslaesst, muss"
    echo "      Renovate das Auto-Merge-Flag selbst setzen — aber nur fuer die PRs,"
    echo "      die seine eigene Policy erlaubt (patch + devDependencies)."
    return 1
  }
}

# ── T002165: Nach dem T002161-Fix lief renovate.yml erstmals gruen durch
#    (Run 30201269297), bearbeitete aber KEIN Repository:
#      WARN: No repositories found - did you want to run with flag --autodiscover?
#    Self-hosted Renovate braucht die Arbeitsliste explizit; die Action
#    renovatebot/github-action leitet github.repository NICHT weiter. Der
#    Token-Step war korrekt ("Creating token for this repository"). Das ist der
#    vierte Konfigurationsfehler aus T000898 — er konnte nie auffallen, weil die
#    Auth-Fehler (T002161 RC1/RC2) ihn maskierten.
#    Zusaetzlich: "WARN: Config needs migrating" — matchPackagePatterns ist
#    deprecated; verschwindet es in einem Major, greifen die betroffenen
#    packageRules still nicht mehr.
#    Beide Tests sind erwartet: FAIL vor dem Fix.

@test "T002165: renovate.yml gibt Renovate die Repo-Arbeitsliste explizit mit" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE 'RENOVATE_REPOSITORIES: \$\{\{ github\.repository \}\}' "$wf" || {
    echo "FAIL: renovate.yml setzt RENOVATE_REPOSITORIES nicht auf github.repository."
    echo "      Ohne Arbeitsliste laeuft der Job GRUEN durch, bearbeitet aber kein"
    echo "      Repo ('WARN: No repositories found') — kein PR, kein Dashboard-Issue."
    echo "      Explizit statt RENOVATE_AUTODISCOVER, damit der Lauf unabhaengig vom"
    echo "      Installationsumfang der GitHub App deterministisch bleibt."
    return 1
  }
}

@test "T002165: renovate.json5 nutzt kein deprecated matchPackagePatterns" {
  local cfg="$REPO_ROOT/renovate.json5"
  # Auf den JSON-Key pruefen, nicht auf das Wort: der erklaerende Kommentar zur
  # Migration darf den alten Namen nennen (alle Keys der Datei sind gequotet).
  ! grep -qE '"matchPackagePatterns"' "$cfg" || {
    echo "FAIL: renovate.json5 verwendet noch matchPackagePatterns (deprecated)."
    echo "      Renovate meldet 'Config needs migrating'. Neue Syntax kapselt den"
    echo "      Regex in Slashes, z.B. matchPackageNames: [\"/^example//\"]."
    echo "      Betroffen sind die Gruppierungen nextcloud/keycloak und die"
    echo "      Deaktivierung von ghcr.io/paddione/* — verschwindet die Option in"
    echo "      einem Major, greifen diese Regeln still nicht mehr."
    return 1
  }
}

@test "T002165: renovate.json5 hat keine Keycloak-Regel mehr (Plattform nutzt Pocket ID)" {
  local cfg="$REPO_ROOT/renovate.json5"
  ! grep -qE '"matchPackageNames".*keycloak|"matchPackagePatterns".*keycloak' "$cfg" || {
    echo "FAIL: renovate.json5 gruppiert noch keycloak-Images."
    echo "      Die Plattform ist von Keycloak auf Pocket ID migriert; es existiert"
    echo "      keine quay.io/keycloak-Image-Referenz mehr in den Manifesten. Eine"
    echo "      packageRule fuer ein nicht mehr vorhandenes Image ist toter Ballast"
    echo "      und suggeriert eine Komponente, die es nicht mehr gibt."
    return 1
  }
}

# ── T002163: Die drei website:deploy-Allowlist-Assertions (T001994) waren auf main
#    dauerhaft rot — ein False Positive: _website_deploy_list() las nur den
#    envsubst-Aufruf mit der grossen $WEBSITE_IMAGE-Liste und uebersah die
#    separaten Aufrufe fuer $WEBSITE_CONFIG_SHA (T002154/T002156) und
#    $WEBSITE_NAMESPACE. Aufgefallen ist es NICHT durch CI, sondern beim lokalen
#    task test:changed eines voellig unbeteiligten PRs (T002161) — weil diese
#    Datei in keinem Required Check lief. Beide Luecken werden hier geschlossen.

@test "T002163: _website_deploy_list erfasst ALLE envsubst-Aufrufe des Tasks" {
  local list; list="$(_website_deploy_list)"
  # Die drei Variablen stammen aus drei verschiedenen envsubst-Aufrufen des
  # website:deploy-Tasks. Fehlt eine, ist der Extraktor wieder zu eng gefasst
  # und meldet korrekt substituierte Variablen als Allowlist-Drift.
  for v in WEBSITE_IMAGE WEBSITE_CONFIG_SHA WEBSITE_NAMESPACE; do
    grep -qx "$v" <<< "$list" || {
      echo "FAIL: $v fehlt in der extrahierten website:deploy-Allowlist."
      echo "      _website_deploy_list() muss die Union ueber alle envsubst-Aufrufe"
      echo "      des Tasks bilden, nicht nur die \$WEBSITE_IMAGE-Hauptliste."
      echo "      Extrahiert wurde:"; sed 's/^/        /' <<< "$list"
      return 1
    }
  done
}

@test "T002163: ci.yml fuehrt alle spec tests via task test:spec in einem Required Check" {
  local ci="$REPO_ROOT/.github/workflows/ci.yml"
  grep -qE 'task test:spec|tests/spec/\*\.bats' "$ci" || {
    echo "FAIL: ci.yml ruft task test:spec nicht auf (laedt alle spec-tests)."
    echo "      Wenn ci-cd.bats nicht im Required Check laeuft, verhindert es"
    echo "      nichts — genau so blieben drei rote T001994-Assertions und ein"
    echo "      rotes openspec:validate (T002167) unentdeckt auf main."
    return 1
  }
}

# ── T002182: CI-Gate — test-factory job invokes full tests/spec/*.bats glob ──
# Regression guard: the factory job must NOT enumerate a hand-picked subset of
# spec files, because any file not in the list runs in no required check and
# can rot on main undetected (observed: T002163, T002167, image-drift).

@test "T002182: ci.yml test-factory job uses task test:spec (full glob)" {
  local ci="$REPO_ROOT/.github/workflows/ci.yml"
  # Extract the test-factory job steps between its header and the next job
  local block
  block=$(awk '/^  test-factory:/{flag=1; next} /^  [a-z]/ && flag {exit} flag' "$ci")
  # Must invoke task test:spec, not enumerate individual .bats files
  echo "$block" | grep -qE 'task test:spec|tests/spec/\*\.bats' || {
    echo "FAIL: test-factory job does not use task test:spec or tests/spec/*.bats glob."
    echo "      Every tests/spec/*.bats file must run in this required check."
    echo "      Current block:"
    echo "$block" | sed 's/^/  /'
    return 1
  }
  # Must NOT list individual .bats filenames in a way that excludes others
  ! echo "$block" | grep -qE 'tests/spec/[a-z].*\.bats' || {
    echo "FAIL: test-factory job still enumerates individual spec files."
    echo "      Use 'task test:spec' to run the full tests/spec/*.bats glob."
    return 1
  }
}

# ── T002245: the factory job may scope the spec suite to the diff on PRs, but
# the full-glob path MUST stay reachable for push-to-main. Without it, scoping
# reintroduces exactly the T002182 failure mode: a spec file that no required
# check ever runs, rotting on main undetected.

@test "T002245: test-factory keeps a non-PR full-suite path for the spec bats" {
  local ci="$REPO_ROOT/.github/workflows/ci.yml"
  local block
  block=$(awk '/^  test-factory:/{flag=1; next} /^  [a-z]/ && flag {exit} flag' "$ci")

  # Scoping is optional; if present it must be gated on the event being a PR.
  if echo "$block" | grep -qF 'task test:spec:changed'; then
    echo "$block" | grep -qF "github.event_name == 'pull_request'" || {
      echo "FAIL: scoped spec run is not gated on github.event_name == 'pull_request'."
      echo "      Push-to-main must still run the full suite."
      return 1
    }
    # ...and the unscoped fallback must survive alongside it.
    echo "$block" | grep -qE '^\s+(task )?test:spec\s*$|task test:spec$' || {
      echo "FAIL: no bare 'task test:spec' fallback left in the test-factory job."
      echo "      Current block:"; echo "$block" | sed 's/^/  /'
      return 1
    }
  fi

  # origin/main must be fetched, otherwise the diff is empty and the scoped
  # selection silently resolves to zero spec files.
  echo "$block" | grep -qF 'origin main:refs/remotes/origin/main' || {
    echo "FAIL: test-factory does not fetch origin/main — a diff-scoped run"
    echo "      would select nothing and report green."
    return 1
  }
}

@test "T002245: find-changed-tests.sh spec maps openspec slugs and widens on harness changes" {
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/finder-repo"
  mkdir -p "$tmp/scripts" "$tmp/tests/spec/helpers" "$tmp/openspec/specs/alpha"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  : > "$tmp/tests/spec/alpha.bats"
  : > "$tmp/tests/spec/beta.bats"
  : > "$tmp/tests/spec/helpers/shared.bash"
  : > "$tmp/openspec/specs/alpha/spec.md"

  cd "$tmp"
  git init -q -b main .
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  # The finder diffs HEAD against origin/main, so changes must be committed.
  # openspec/specs/alpha/** → tests/spec/alpha.bats, and nothing else
  git checkout -q -b topic
  echo change >> openspec/specs/alpha/spec.md
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m openspec
  run bash scripts/find-changed-tests.sh spec
  [ "$status" -eq 0 ]
  [ "$output" = "tests/spec/alpha.bats" ]

  # shared harness → full suite (both files)
  # stderr wird verworfen: BATS buendelt in `run` stdout UND stderr in $output,
  # und der RUN_ALL-Fallback meldet seinen Grund seit T002377 auf stderr. Ohne
  # das 2>/dev/null zaehlt die Notiz als dritte "Datei" mit. Der Vertrag des
  # Skripts ist ausdruecklich "stdout ist die reine Dateiliste" — genau den
  # prueft diese Assertion, also muss sie auch nur stdout sehen.
  git checkout -q main && git checkout -q -b topic2
  echo change >> tests/spec/helpers/shared.bash
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m harness
  run bash -c 'bash scripts/find-changed-tests.sh spec 2>/dev/null'
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | wc -l)" -eq 2 ]
}

@test "T002245: find-changed-tests.sh spec picks the deepest path-referencing spec" {
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/probe-repo"
  mkdir -p "$tmp/scripts" "$tmp/tests/spec" "$tmp/website/src/pages/admin"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  # deep.bats names the exact directory, shallow.bats only a broader prefix,
  # toplevel.bats only the bare top-level segment (must never win).
  echo '# covers website/src/pages/admin' > "$tmp/tests/spec/deep.bats"
  echo '# covers website/src' > "$tmp/tests/spec/shallow.bats"
  echo '# covers website' > "$tmp/tests/spec/toplevel.bats"
  : > "$tmp/website/src/pages/admin/dora.astro"
  : > "$tmp/website/loose.txt"

  cd "$tmp"
  git init -q -b main .
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  # Deepest match wins: the admin spec, not the broader website/src one.
  git checkout -q -b topic
  echo change >> website/src/pages/admin/dora.astro
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m deep
  run bash scripts/find-changed-tests.sh spec
  [ "$status" -eq 0 ]
  [ "$output" = "tests/spec/deep.bats" ]

  # Floor: a top-level-only reference must not drag in the whole domain.
  git checkout -q main && git checkout -q -b topic2
  echo change >> website/loose.txt
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m floor
  run bash scripts/find-changed-tests.sh spec
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ── T002345: scripts/*-Aenderungen erreichen die Pfad-Probe nie ──────────────
# Der scripts/*-Zweig in find-changed-tests.sh versucht einen Namensabgleich
# (queue.sh -> queue.bats / vda-queue.bats / ticket-queue.bats / factory-queue.bats)
# und setzt bei Fehlschlag RUN_ALL=true, gefolgt von `continue`. Das `continue`
# springt ueber die Pfad-Probe hinweg, die den Pfad in den spec-Dateien greppt
# und den tiefsten Treffer waehlt.
#
# Folge: Fuer scripts/-Aenderungen liefert der spec-Finder entweder einen
# Namenstreffer oder ALLE Suiten — nie die eine, die den Pfad tatsaechlich
# prueft. Gemessen an scripts/factory/queue.sh: 138 Suiten statt der einen
# software-factory.bats, die den Pfad woertlich referenziert.
#
# Zusammen mit RUN_SPEC=false im Taskfile (die spec-Suite wird fuer scripts/
# gar nicht erst angefragt) ergibt das ein False-Green im Pflicht-Gate vor dem
# PR: Ein Fix an scripts/factory/*.sh besteht `task test:changed`, ohne dass
# die Suite laeuft, die ihn absichert.
@test "T002345: a scripts/ change without a name match falls through to the path probe" {
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/scripts-probe-repo"
  mkdir -p "$tmp/scripts/factory" "$tmp/tests/spec"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  # Keine Datei heisst queue.bats/factory-queue.bats — der Namensabgleich MUSS
  # scheitern, damit der Fall ueberhaupt getestet wird. Genau eine Suite nennt
  # den Pfad; sie ist die richtige Antwort.
  echo '# covers scripts/factory/queue.sh' > "$tmp/tests/spec/software-factory.bats"
  : > "$tmp/tests/spec/unrelated-one.bats"
  : > "$tmp/tests/spec/unrelated-two.bats"
  : > "$tmp/scripts/factory/queue.sh"

  cd "$tmp"
  git init -q -b main .
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  git checkout -q -b topic
  echo change >> scripts/factory/queue.sh
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m scripts-change
  run --separate-stderr bash scripts/find-changed-tests.sh spec
  [ "$status" -eq 0 ]
  # Genau die referenzierende Suite — nicht alle drei (RUN_ALL) und nicht leer.
  [ "$output" = "tests/spec/software-factory.bats" ]
}

@test "T002345: a scripts/ change with no referencing spec still widens to the full suite" {
  # Gegenprobe: Der RUN_ALL-Fallback bleibt die Sicherheitsnetz-Antwort, wenn
  # WEDER Namensabgleich NOCH Pfad-Probe etwas findet. Ohne diesen Test koennte
  # der Fix die Absicherung still in "gar nichts auswaehlen" umkippen.
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/scripts-noprobe-repo"
  mkdir -p "$tmp/scripts/orphan" "$tmp/tests/spec"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  : > "$tmp/tests/spec/alpha.bats"
  : > "$tmp/tests/spec/beta.bats"
  : > "$tmp/scripts/orphan/nobody-tests-me.sh"

  cd "$tmp"
  git init -q -b main .
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  git checkout -q -b topic
  echo change >> scripts/orphan/nobody-tests-me.sh
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m orphan
  run --separate-stderr bash scripts/find-changed-tests.sh spec
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | wc -l)" -eq 2 ]
}

# ── T002170: Restposten der Renovate-Config-Migration. fileMatch ist deprecated
#    und wurde durch managerFilePatterns ersetzt (slash-gekapselte Regexes, wie
#    schon bei matchPackageNames in T002165). Wichtig: der kubernetes-Manager hat
#    KEINE Default-Patterns — ohne diese Liste matcht er nichts und jedes k8s-Image
#    hoert still auf, Updates zu bekommen.

@test "T002170: renovate.json5 nutzt managerFilePatterns statt deprecated fileMatch" {
  local cfg="$REPO_ROOT/renovate.json5"
  ! grep -qE '"fileMatch"' "$cfg" || {
    echo "FAIL: renovate.json5 verwendet noch den deprecated Key fileMatch."
    echo "      Ersatz: managerFilePatterns mit slash-gekapselten Regexes,"
    echo "      z.B. \"/^k3d/.+\\\\.yaml\$/\"."
    return 1
  }
  grep -qE '"managerFilePatterns"' "$cfg" || {
    echo "FAIL: kein managerFilePatterns im kubernetes-Manager."
    echo "      Der Manager hat KEINE Default-Patterns — ohne Liste matcht er"
    echo "      nichts und alle k8s-Images bleiben ungepflegt."
    return 1
  }
}

@test "T002170: kubernetes-managerFilePatterns deckt alle vier Manifest-Baeume ab" {
  local cfg="$REPO_ROOT/renovate.json5"
  for tree in k3d prod prod-mentolder prod-korczewski prod-fleet; do
    grep -qE "\"/\^${tree}/" "$cfg" || {
      echo "FAIL: kein managerFilePatterns-Eintrag fuer '${tree}/'."
      echo "      Fehlt ein Baum, uebersieht Renovate dessen Images vollstaendig —"
      echo "      ohne Fehlermeldung, der Run bleibt gruen."
      return 1
    }
  done
}
# --- T002174: flux-render-artifact.sh ignoriert die dokumentierte Leer-Semantik ---
# environments/schema.yaml ist die autoritative Spezifikation und definiert fuer beide
# betroffenen Variablen ein Verhalten fuer den leeren Fall:
#   RIGGER_HOST_IP (schema.yaml:403) "Defaults to COMFY_HOST_IP when empty."
#   DEV_DOMAIN     (schema.yaml:466) "Empty disables the dev stack."
# Der Taskfile-Pfad implementiert den Rigger-Fallback (Taskfile.yml:2831/2961/3641),
# der Flux-Renderer implementierte KEINEN der beiden Vertraege: er substituierte stumpf
# den leeren Wert. Ergebnis auf fleet: Endpoints rigger-gateway mit ip:"" und Ingress
# workspace-ingress-dev mit host:"*." — beide liessen ihre Flux-Kustomization dauerhaft
# rot werden, wodurch Flux den GESAMTEN Satz darin nicht mehr applizierte.
#
# Kein generischer "leere Variable = Fehler"-Check: ueber alle vier Overlays gibt es
# dutzende legitim leerer Referenzen (Shell-Vars in ConfigMap-Skripten, Grafana-Template-
# Variablen, Secret-Platzhalter aus SealedSecrets). Geprueft wird der konkrete Vertrag.

flux_render_script() {
  echo "$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/scripts/flux-render-artifact.sh"
}

@test "T002174: flux-render implementiert den RIGGER_HOST_IP-auf-COMFY_HOST_IP-Fallback" {
  S="$(flux_render_script)"
  [ -f "$S" ]
  grep -qE 'RIGGER_HOST_IP=.*RIGGER_HOST_IP:-.*COMFY_HOST_IP' "$S" || {
    echo "FAIL: kein Fallback RIGGER_HOST_IP -> COMFY_HOST_IP in flux-render-artifact.sh."
    echo "      schema.yaml:403 spezifiziert 'Defaults to COMFY_HOST_IP when empty';"
    echo "      ohne den Fallback rendert prod/rigger-gpu.yaml Endpoints mit ip: \"\"."
    return 1
  }
}

@test "T002174: flux-render rendert den dev-Stack nicht, wenn DEV_DOMAIN leer ist" {
  S="$(flux_render_script)"
  [ -f "$S" ]
  # schema.yaml:466 — "Empty disables the dev stack". Der Renderer muss den leeren Fall
  # abfangen, statt host:"*." zu erzeugen.
  grep -qE 'DEV_DOMAIN' "$S" || {
    echo "FAIL: flux-render-artifact.sh prueft DEV_DOMAIN ueberhaupt nicht."
    echo "      schema.yaml:466 spezifiziert 'Empty disables the dev stack'."
    return 1
  }
  awk '/# 1b\. Dev/,/^\)/' "$S" | grep -qE '(-z .*DEV_DOMAIN|DEV_DOMAIN.*-z)' || {
    echo "FAIL: der dev-Renderblock hat keinen Leer-Guard auf DEV_DOMAIN."
    return 1
  }
}

@test "T002174: der dev-Renderblock verschluckt env-resolve-Fehler nicht per '|| true'" {
  S="$(flux_render_script)"
  [ -f "$S" ]
  # Schlug env-resolve fehl, lief der Render mit LEERER Umgebung weiter und schrieb
  # ein Manifest voller leer substituierter Werte ins Artefakt.
  awk '/# 1b\. Dev/,/^\)/' "$S" | grep -qE 'env-resolve\.sh dev.*\|\| true' && {
    echo "FAIL: 'source scripts/env-resolve.sh dev ... || true' im dev-Renderblock —"
    echo "      ein Fehlschlag rendert stillschweigend mit leerer Umgebung weiter."
    return 1
  }
  return 0
}

# ── T002186: devflow-ci-watch.sh soll bei 0 CI-Checks mit Code 5 abbrechen ──
# Regression: devflow-ci-watch.sh meldete "Alle CI-Checks grün" auch dann,
# wenn gar keine Checks vorhanden waren (total_count=0). Das maskiert einen
# fehlgeschlagenen oder noch nicht gestarteten CI-Lauf.

@test "T002186: devflow-ci-watch: 0 check-runs exits with code 5" {
  # Mock: simulate zero check-runs
  local mockdir
  mockdir="$(mktemp -d)"
  
  # Der Mock muss HERMETISCH sein: kein Fall darf auf das echte `gh`
  # durchfallen. `devflow-ci-watch.sh` ruft u.a. `gh pr checks --watch` auf —
  # ohne Mock blockiert das unbegrenzt gegen die echte GitHub-API und wuergt
  # den ganzen CI-Job ab, statt den Test fehlschlagen zu lassen.
  cat > "$mockdir/gh" <<'MOCKEOF'
#!/usr/bin/env bash
# Mock gh fuer den T002186-Test — deckt JEDEN Aufruf ab, kein Passthrough.
case "$*" in
  *"pr view"*"--json statusCheckRollup"*)
    # Keine fehlgeschlagenen Checks
    echo ""
    ;;
  *"api"*"check-runs"*)
    # Der zu testende Zustand: null Check-Runs.
    # Das Skript ruft `gh api … -q '.total_count'` auf — der echte gh liefert
    # also den extrahierten Wert, nicht das JSON-Objekt.
    echo "0"
    ;;
  *"pr view"*"--json number"*)
    echo "123"
    ;;
  *"pr view"*"--json mergeStateStatus"*)
    echo "CLEAN"
    ;;
  *"pr view"*"--json mergeable"*)
    echo "MERGEABLE"
    ;;
  *"pr checks"*)
    # Wuerde sonst mit --watch blockieren
    ;;
  *)
    # Catch-All: still und erfolgreich, NIEMALS an das echte gh delegieren
    ;;
esac
exit 0
MOCKEOF
  chmod +x "$mockdir/gh"

  # timeout als Sicherheitsnetz: haengt das Skript trotz Mock, soll der Test
  # fehlschlagen (124) statt den CI-Job ins Job-Timeout laufen zu lassen.
  run env PATH="$mockdir:$PATH" MAX_CI_ATTEMPTS=1 \
    timeout 60 bash "$REPO_ROOT/scripts/devflow-ci-watch.sh" T002186 "http://example.com/pr/1"

  # Clean up
  rm -rf "$mockdir"
  
  # Assert exit code 5
  [ "$status" -eq 5 ]
  
  # Assert error message contains "Keine CI-Checks"
  [[ "$output" =~ "Keine CI-Checks" ]]
}

# ── T002242-M1: Phase-Chain-Gate vor CI-Grün-Exit ──────────────────
@test "T002242-M1: devflow-ci-watch.sh ruft assert-phase-chain vor dem gruenen Exit auf" {
  run grep -n "assert-phase-chain" "$REPO_ROOT/scripts/devflow-ci-watch.sh"
  [ "$status" -eq 0 ]
}

# ── T002242-M3: Exit-Code-Collection im Post-Merge-Deploy ───────────
@test "T002242-M3: devflow-post-merge-deploy.sh sammelt Exit-Codes und schlaegt fail-closed fehl" {
  run grep -nE '\|\| FAILED_TASKS|deploy blocked|deploy failed' "$REPO_ROOT/scripts/devflow-post-merge-deploy.sh"
  [ "$status" -eq 0 ]
}

# ── T002252: freshness:check muss vor dem Diff regenerieren ─────────
# Ohne diesen Schritt prueft `git diff --exit-code` den Artefakt-Stand nur gegen
# sich selbst: auf einem frischen CI-Checkout ist der Baum immer sauber, die Gate
# also strukturell gruen — auch wenn die Artefakte gegenueber ihren Quellen
# veraltet sind. Belegt gegen c792d6f85: `task freshness:check` -> 0, aber
# `task quality:index && task freshness:check` -> 201.
@test "T002252: freshness:check regeneriert die Artefakte vor dem Diff-Check" {
  # cmds-Block von freshness:check bis zum naechsten Top-Level-Task extrahieren
  local block
  block=$(awk '/^  freshness:check:/{f=1} f&&/^  [a-z][a-z0-9:-]*:$/&&!/^  freshness:check:/{exit} f' \
    "$REPO_ROOT/Taskfile.yml")

  # Der Regenerate-Schritt muss existieren ...
  [[ "$block" =~ task:[[:space:]]*freshness:regenerate ]]

  # ... und VOR der Diff-Schleife stehen, sonst diffed er gegen den alten Stand.
  local regen_line diff_line
  regen_line=$(grep -n 'task:[[:space:]]*freshness:regenerate' <<<"$block" | head -1 | cut -d: -f1)
  # [T002375-p4] Musterbreite bewusst: geprueft wird die REIHENFOLGE, nicht die
  # Flag-Schreibweise. Die Diff-Schleife nutzt seit T002375-p4 `git diff --quiet`
  # (zwei Faelle: nicht gestaged vs. nicht committet) statt `--exit-code`. Ein Test,
  # der auf die alte Schreibweise festnagelt, misst die Formulierung statt der Aussage.
  diff_line=$(grep -nE 'git diff (--exit-code|--quiet)' <<<"$block" | head -1 | cut -d: -f1)
  [ -n "$regen_line" ]
  [ -n "$diff_line" ]
  [ "$regen_line" -lt "$diff_line" ]
}

# ── T002249: Renovate bricht an bewegtem `main` ab und meldet trotzdem Erfolg.
#    Renovate liest die Base-Branch-SHA beim Klonen und prueft sie vor dem
#    Schreiben erneut (optimistic concurrency). Bei Drift verwirft es den
#    gesamten Repo-Lauf mit result=repository-changed — ohne Retry und mit
#    Exit-Code 0. Gemessen an Run 30238038240: 157s Laufzeit (30s Extraktion
#    fuer 192 Dateien/983 Deps, 127s Lookup), dann Abbruch. Dem stehen ~103
#    Commits/Tag auf main gegenueber (factory-tick alle 5-6 min, Freshness-Bot,
#    Auto-Merges) — ein driftfreies 157s-Fenster ist waehrend aktiver Stunden
#    nicht zu erwischen. Ergebnis: seit T000898 (2026-06-17) null Renovate-PRs,
#    bei zehn aufeinanderfolgenden Runs mit conclusion=success.
#    Alle vier Tests sind erwartet: FAIL — der Fix ist noch nicht implementiert.

@test "T002249-A: renovate.yml wiederholt den Lauf bei repository-changed" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -q 'repository-changed' "$wf" || {
    echo "FAIL: renovate.yml wertet das Lauf-Ergebnis nicht aus."
    echo "      Renovate schreibt bei Base-SHA-Drift '\"result\": \"repository-changed\"'"
    echo "      ins Log und beendet sich mit Exit-Code 0. Ohne Auswertung dieser"
    echo "      Zeile kann der Workflow den Fehlschlag weder erkennen noch"
    echo "      wiederholen — er meldet Erfolg fuer einen Lauf, der nichts getan hat."
    return 1
  }
  grep -qE 'for attempt|while .*attempt|RENOVATE_MAX_ATTEMPTS' "$wf" || {
    echo "FAIL: renovate.yml enthaelt keine Retry-Schleife."
    echo "      repository-changed ist upstream als transient modelliert ('state ist"
    echo "      stale, wirf alles weg und starte neu') — der Neustart ist Aufgabe des"
    echo "      Aufrufers, Renovate selbst wiederholt NICHT. Erwartet: bis zu 3"
    echo "      Versuche ohne Backoff (Warten hilft nicht, die Schreiblast auf main"
    echo "      ist ueber die Zeit verteilt; der Folgeversuch profitiert stattdessen"
    echo "      vom warmen Cache und ist damit kuerzer)."
    return 1
  }
}

@test "T002249-B: renovate.yml endet rot, wenn alle Versuche repository-changed liefern" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE '^\s*exit 1|::error' "$wf" || {
    echo "FAIL: renovate.yml kann nicht fehlschlagen."
    echo "      Der eigentliche Defekt ist nicht der Abbruch, sondern seine Stille:"
    echo "      Exit-Code 0 laesst zehn Runs auf 'success' stehen, waehrend 47"
    echo "      angehakte Checkboxen im Dependency Dashboard #3219 unbemerkt warten."
    echo "      Das Monitoring-Signal ist invertiert — der Workflow meldet Erfolg"
    echo "      genau dann, wenn er seine Aufgabe verfehlt hat. Erwartet: nach dem"
    echo "      letzten erfolglosen Versuch 'exit 1' (fail-closed)."
    return 1
  }
}

@test "T002249-C: renovate.yml aktiviert und persistiert den Repository-Cache" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE 'RENOVATE_REPOSITORY_CACHE.*enabled' "$wf" || {
    echo "FAIL: RENOVATE_REPOSITORY_CACHE ist nicht auf 'enabled' gesetzt"
    echo "      (Default ist 'disabled'). Von 157s Laufzeit entfallen 127s auf die"
    echo "      Datasource-Lookups — genau die Phase, die der JSON-Cache abkuerzt."
    echo "      Ein kuerzerer Lauf bietet der Base-SHA-Drift ein kleineres Fenster."
    return 1
  }
  grep -q 'RENOVATE_CACHE_DIR' "$wf" || {
    echo "FAIL: RENOVATE_CACHE_DIR ist nicht gesetzt (Default null). Ohne"
    echo "      definiertes Verzeichnis gibt es nichts, was actions/cache"
    echo "      zwischen zwei Runs persistieren koennte."
    return 1
  }
  grep -qE 'uses: actions/cache@' "$wf" || {
    echo "FAIL: kein actions/cache-Step. Der Repository-Cache lebt sonst nur"
    echo "      innerhalb eines einzelnen Runs und ist beim naechsten Lauf kalt —"
    echo "      die 127s-Lookup-Phase kaeme unveraendert zurueck."
    return 1
  }
}

@test "T002249-D: renovate.yml ruft das Renovate-Image digest-gepinnt direkt auf" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  grep -qE 'ghcr\.io/renovatebot/renovate:[^@[:space:]]+@sha256:[0-9a-f]{64}' "$wf" || {
    echo "FAIL: das Renovate-Image ist nicht digest-gepinnt aufgerufen."
    echo "      Der Container erhaelt den GitHub-App-Installation-Token — es gilt"
    echo "      dieselbe Supply-Chain-Konvention wie fuer die secret-tragenden"
    echo "      Actions in dieser Datei (nie @latest, immer gepinnt). Erwartet:"
    echo "      'ghcr.io/renovatebot/renovate:<tag>@sha256:<64 hex>' — Tag UND"
    echo "      Digest, damit Renovates eigener docker-Manager den Pin bumpen kann."
    return 1
  }
  ! grep -qE 'uses: renovatebot/github-action@' "$wf" || {
    echo "FAIL: renovatebot/github-action wird weiterhin verwendet."
    echo "      Die Action kapselt genau das docker-run, das die Retry-Schleife"
    echo "      selbst ausfuehren muss; ein 'uses:'-Step laesst sich nicht"
    echo "      schleifen. Beides parallel zu behalten bedeutet zwei"
    echo "      Renovate-Laeufe pro Job. Erwartet: die Action ist ersetzt."
    return 1
  }
}

# ── T002249-E: Verhaltenstest der Retry-Schleife gegen einen docker-Mock.
#    Die vier Tests oben pruefen, DASS die Bausteine im Workflow stehen; dieser
#    prueft, dass die Schleife tatsaechlich zaehlt, abbricht und fail-closed
#    endet. Notwendig, weil sich das Live-Verhalten erst nach dem Merge auf main
#    beobachten laesst — vorher ist der Mock die einzige echte Absicherung.
#    Er hat sich bereits bezahlt gemacht: die Retry-Meldung behauptete
#    urspruenglich auch nach dem LETZTEN Versuch "retrying".

_extract_renovate_step() {
  python3 - "$1" "$2" <<'PY'
import sys, yaml
wf, out = sys.argv[1], sys.argv[2]
steps = yaml.safe_load(open(wf))['jobs']['renovate']['steps']
body = next(s['run'] for s in steps if s.get('name', '').startswith('Self-hosted Renovate'))
open(out, 'w').write(body)
PY
}

# Schreibt einen docker-Mock, der jeden Aufruf in $MOCK_CALLS protokolliert und
# die per $1 vorgegebene Renovate-Ergebniszeile ausgibt.
_write_docker_mock() {
  cat > "$1/bin/docker" <<MOCK
#!/usr/bin/env bash
echo "call" >> "\$MOCK_CALLS"
$2
MOCK
  chmod +x "$1/bin/docker"
}

setup_renovate_mock() {
  MOCKDIR="$(mktemp -d)"
  mkdir -p "$MOCKDIR/bin"
  _extract_renovate_step "$REPO_ROOT/.github/workflows/renovate.yml" "$MOCKDIR/step.sh"
  export MOCK_CALLS="$MOCKDIR/calls.txt"
  : > "$MOCK_CALLS"
  export GITHUB_WORKSPACE="$MOCKDIR" RENOVATE_TOKEN=x RENOVATE_REPOSITORIES=x LOG_LEVEL=info
}

@test "T002249-E: Retry-Schleife versucht dreimal und endet dann fail-closed" {
  setup_renovate_mock
  _write_docker_mock "$MOCKDIR" 'echo "        \"result\": \"repository-changed\","; exit 0'

  run env PATH="$MOCKDIR/bin:$PATH" timeout 60 bash "$MOCKDIR/step.sh"
  local calls; calls=$(wc -l < "$MOCK_CALLS")
  rm -rf "$MOCKDIR"

  [ "$status" -eq 1 ]                        # fail-closed statt still gruen
  [ "$calls" -eq 3 ]                         # MAX_ATTEMPTS ausgeschoepft
  [[ "$output" == *"::error::"* ]]           # als Annotation sichtbar
  [[ "$output" == *"no repository was processed"* ]]
  # Die Meldung des letzten Versuchs darf kein Retry versprechen, das nicht kommt.
  [[ "$output" == *"no attempts left"* ]]
}

@test "T002249-E: erfolgreicher Zweitversuch beendet die Schleife gruen" {
  setup_renovate_mock
  _write_docker_mock "$MOCKDIR" \
    'if [ "$(wc -l < "$MOCK_CALLS")" -eq 1 ]; then echo "        \"result\": \"repository-changed\","; else echo "        \"result\": \"done\","; fi; exit 0'

  run env PATH="$MOCKDIR/bin:$PATH" timeout 60 bash "$MOCKDIR/step.sh"
  local calls; calls=$(wc -l < "$MOCK_CALLS")
  rm -rf "$MOCKDIR"

  [ "$status" -eq 0 ]
  [ "$calls" -eq 2 ]                         # bricht ab, sobald es geklappt hat
  [[ "$output" != *"::error::"* ]]
}

@test "T002249-E: echter Renovate-Fehler wird nicht wiederholt" {
  setup_renovate_mock
  _write_docker_mock "$MOCKDIR" 'echo "FATAL: authentication failed"; exit 42'

  run env PATH="$MOCKDIR/bin:$PATH" timeout 60 bash "$MOCKDIR/step.sh"
  local calls; calls=$(wc -l < "$MOCK_CALLS")
  rm -rf "$MOCKDIR"

  # Nur repository-changed ist transient. Ein abgelaufener Token oder eine
  # kaputte renovate.json5 wird durch drei Wiederholungen nicht besser — der
  # Exit-Code muss unveraendert durchgereicht werden, damit die Ursache im
  # Job-Status sichtbar bleibt.
  [ "$status" -eq 42 ]
  [ "$calls" -eq 1 ]
}

# ── T002289: Der Cache-Mount aus T002249 machte den Renovate-Lauf unbrauchbar.
#    /tmp/renovate-cache wird vom GitHub-Runner-User angelegt; der Renovate-
#    Container laeuft als 'ubuntu' (UID 1000) und scheitert beim ersten Schreiben:
#      EACCES: permission denied, mkdir '/tmp/renovate-cache/containerbase'
#    (run 30240257345, Exit 1 nach ~0.5s, noch vor der Repository-Phase).
#    T002249 antizipierte die UMGEKEHRTE Richtung — "Container schreibt als root,
#    der actions/cache-Post-Step als runner kann nicht packen" — und baute das
#    chown nur NACH dem Lauf. Beide Richtungen werden gebraucht: vor dem Lauf fuer
#    den Container, nach dem Lauf fuer actions/cache.
#    Erwartet: FAIL — der Fix ist noch nicht implementiert.

@test "T002289: Cache-Verzeichnis wird VOR dem docker run fuer den Container beschreibbar" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  local body
  body=$(python3 - "$wf" <<'PY'
import sys, yaml
steps = yaml.safe_load(open(sys.argv[1]))['jobs']['renovate']['steps']
print(next(s['run'] for s in steps if s.get('name', '').startswith('Self-hosted Renovate')))
PY
)

  # Eine Rechteanpassung muss ueberhaupt existieren ...
  local perm_line
  perm_line=$(grep -nE 'chown|chmod' <<<"$body" | head -1 | cut -d: -f1)
  [ -n "$perm_line" ] || {
    echo "FAIL: der Renovate-Step passt die Rechte auf dem Cache-Verzeichnis nicht an."
    echo "      Der Runner legt /tmp/renovate-cache an, der Container laeuft unter"
    echo "      einer anderen UID und kann nicht hineinschreiben — Renovate bricht"
    echo "      mit EACCES ab, bevor es ein Repository sieht."
    return 1
  }

  # ... und VOR dem docker run stehen, sonst kommt sie zu spaet.
  local docker_line
  docker_line=$(grep -n 'docker run' <<<"$body" | head -1 | cut -d: -f1)
  [ -n "$docker_line" ]
  [ "$perm_line" -lt "$docker_line" ] || {
    echo "FAIL: die Rechteanpassung steht NACH dem docker run (Zeile ${perm_line} vs ${docker_line})."
    echo "      Genau das war der Defekt: T002249 hatte nur den Post-Lauf-chown fuer"
    echo "      actions/cache, nicht den Pre-Lauf-chown fuer den Container."
    return 1
  }
}

@test "T002289: der Post-Lauf-chown fuer actions/cache bleibt erhalten" {
  local wf="$REPO_ROOT/.github/workflows/renovate.yml"
  # Regression-Guard: beim Fix der einen Richtung darf die andere nicht wegfallen.
  # Ohne den Post-Lauf-chown scheitert der actions/cache-Post-Step am Packen —
  # lautlos, der Cache bliebe dauerhaft kalt.
  python3 - "$wf" <<'PY'
import sys, yaml
steps = yaml.safe_load(open(sys.argv[1]))['jobs']['renovate']['steps']
names = [s.get('name', '') for s in steps]
idx = next(i for i, n in enumerate(names) if n.startswith('Self-hosted Renovate'))
after = [s for s in steps[idx + 1:] if 'chown' in s.get('run', '')]
assert after, "kein chown-Step NACH dem Renovate-Step (actions/cache kann nicht packen)"
PY
}

# ── T002328: Commit-Scope-Konsolidierung ──────────────────────────────────
# Die Scope-Allowlist in commitlint.config.cjs ist auf 95 Eintraege gewachsen
# (37 davon nie benutzte Synthetik-Codes), waehrend 279 Scopes real im Umlauf
# sind und KEIN Konsument im Repo den Scope auswertet — release-please
# gruppiert nach type, release-notes.sh verwirft die Scope-Capture, die
# Tracking-Pipeline ist seit PR #788/#993 entfernt. Das Gate erzeugt also nur
# noch Reibung.
#
# Konsolidierung auf 14 Scopes entlang der Agent-Routing-Domaenen aus
# CLAUDE.md; alte Namen werden zu Aliassen mit gezielter Diagnose statt einer
# generischen "unknown scope"-Meldung.
#
# Zusaetzlich: scripts/preflight-pr-scope.sh parst einen `scopes: |`-Block aus
# ci.yml, den es dort seit der Umstellung nicht mehr gibt (ci.yml sagt selbst
# "Scopes are NOT enforced here"). Der awk-Parser liefert immer leer; nur der
# Fallback auf validate-commit-msg.sh haelt das Skript funktionsfaehig.
#
# expected: FAIL — weder der reduzierte Scope-Satz noch die Alias-Maps
# existieren, und der tote ci.yml-Parser steht noch drin.

@test "T002328: die Scope-Allowlist umfasst hoechstens 15 Eintraege" {
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" scopes
  [ "$status" -eq 0 ]
  count="$(printf '%s\n' "$output" | grep -c .)"
  [ "$count" -le 15 ]
}

@test "T002328: 'agents' ist ein gueltiger Scope" {
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" scopes
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qx 'agents'
}

@test "T002328: kein Synthetik-Scope (cq0X/sec0X/dora0X/…) ist mehr registriert" {
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" scopes
  [ "$status" -eq 0 ]
  run bash -c "printf '%s\n' \"$output\" | grep -cE '^[a-z]+[0-9]{2}$'"
  [ "$output" = "0" ]
}

@test "T002328: konsolidierter Scope 'admin' nennt sein Ziel 'website' in der Diagnose" {
  msg="$BATS_TEST_TMPDIR/msg-admin"
  printf 'feat(admin): add dashboard\n' > "$msg"
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$msg"
  [ "$status" -ne 0 ]
  [[ "$output" == *"website"* ]]
}

@test "T002328/T002374: 'skills' ist wieder ein gueltiger Scope" {
  msg="$BATS_TEST_TMPDIR/msg-skills"
  printf 'chore(skills): tidy up\n' > "$msg"
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$msg"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "T002328: entfallener Scope 'tracking' wird als entfernt gemeldet, nicht auf ein Ziel gemappt" {
  msg="$BATS_TEST_TMPDIR/msg-tracking"
  printf 'feat(tracking): add import\n' > "$msg"
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$msg"
  [ "$status" -ne 0 ]
  [[ "$output" == *"entfallen"* ]]
}

@test "T002328: register-scope.sh weigert sich, einen konsolidierten Scope neu anzulegen" {
  run bash "$REPO_ROOT/scripts/register-scope.sh" admin --config "$BATS_TEST_TMPDIR/nonexistent.cjs"
  [ "$status" -ne 0 ]
  run bash "$REPO_ROOT/scripts/register-scope.sh" admin
  [ "$status" -ne 0 ]
  [[ "$output" == *"website"* ]]
}

@test "T002328: preflight-pr-scope.sh bezieht die Allowlist nicht mehr aus ci.yml" {
  run grep -c 'CI_WORKFLOW' "$REPO_ROOT/scripts/preflight-pr-scope.sh"
  [ "$output" = "0" ]
}

@test "T002328: ci-cd.md schreibt commitlint.config.cjs als Allowlist-Quelle fest" {
  run grep -n 'semantic-PR allowlist from `ci.yml`' "$REPO_ROOT/openspec/specs/ci-cd.md"
  [ "$status" -ne 0 ]
  run grep -c 'commitlint.config.cjs' "$REPO_ROOT/openspec/specs/ci-cd.md"
  [ "$output" -ge 1 ]
}

@test "T002328: die Alias-Struktur erfuellt ihre Invarianten" {
  # Die neun Tests darueber pruefen konkrete Paare (admin->website). Diese
  # Struktur-Invarianten fangen das, was Einzelpaare nicht koennen: bei 91 von
  # Hand gepflegten Aliassen wuerde ein Tippfehler im ZIEL (websites statt
  # website) eine Diagnose erzeugen, die auf einen Scope zeigt, den es nicht
  # gibt — und kein Paar-Test wuerde es merken.
  run node -e "
    const c = require('$REPO_ROOT/commitlint.config.cjs');
    const named = new Set(c.namedScopes);
    const errs = [];
    for (const [alias, target] of Object.entries(c.scopeAliases)) {
      if (!named.has(target)) errs.push('Alias-Ziel fehlt in namedScopes: ' + alias + ' -> ' + target);
      if (named.has(alias)) errs.push('Name ist Alias UND gueltiger Scope: ' + alias);
    }
    for (const r of Object.keys(c.scopeRetired)) {
      if (named.has(r)) errs.push('retired UND gueltig: ' + r);
      if (c.scopeAliases[r]) errs.push('retired UND Alias: ' + r);
    }
    const re = new RegExp(c.syntheticScopeRe);
    for (const n of named) if (re.test(n)) errs.push('Synthetik-Regex faengt gueltigen Scope: ' + n);
    if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  "
  [ "$status" -eq 0 ]
}

@test "T002328: jedes Alias-Ziel validiert auch tatsaechlich als Commit-Scope" {
  # Ende-zu-Ende-Gegenprobe zum Test darueber: nicht nur in namedScopes
  # vorhanden, sondern vom Guard auch wirklich akzeptiert.
  local targets
  targets="$(node -e "
    const c = require('$REPO_ROOT/commitlint.config.cjs');
    process.stdout.write([...new Set(Object.values(c.scopeAliases))].join(' '));
  ")"
  [ -n "$targets" ]
  for t in $targets; do
    printf 'fix(%s): probe\n' "$t" > "$BATS_TEST_TMPDIR/probe"
    run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$BATS_TEST_TMPDIR/probe"
    [ "$status" -eq 0 ] || { echo "Alias-Ziel '$t' wird vom Guard abgelehnt"; return 1; }
  done
}

# ── T002282-M1: Auto-Rebase muss Freshness-Artefakte regenerieren ─────
# devflow-ci-watch.sh rebased bei mergeStateStatus=DIRTY selbstständig auf
# origin/main und pusht sofort mit --force-with-lease (Zeilen 22-35). Ein Rebase
# verschiebt HEAD auf eine neue Basis — jeder generierte Artefakt-Snapshot
# (repo-index.json, openspec-status.json, test-inventory.json, …) kann danach
# gegenüber dieser Basis stale sein. `task freshness:check` regeneriert im CI
# selbst und diff't gegen den Commit-Stand, schlägt also fehl, wenn niemand vor
# dem Push regeneriert hat. Erwartung: `task freshness:regenerate` läuft nach
# dem erfolgreichen Rebase und VOR `git push`.
@test "T002282-M1: devflow-ci-watch regeneriert Freshness vor dem Push nach Auto-Rebase" {
  local mockdir log
  mockdir="$(mktemp -d)"
  log="$mockdir/calls.log"
  : > "$log"

  # Hermetischer gh-Mock (gleiche Regel wie T002186: kein Passthrough auf das
  # echte gh, sonst blockiert `pr checks --watch` gegen die echte API).
  cat > "$mockdir/gh" <<'MOCKEOF'
#!/usr/bin/env bash
echo "gh $*" >> "$CALL_LOG"
case "$*" in
  *"pr view"*"--json mergeStateStatus"*) echo "DIRTY" ;;
  *"pr view"*"--json mergeable"*)        echo "MERGEABLE" ;;
  *"pr view"*"--json number"*)           echo "123" ;;
  *"pr view"*"--json statusCheckRollup"*) echo "" ;;
  *"api"*"check-runs"*)                  echo "0" ;;   # -> Exit 5, beendet den Loop
  *) ;;
esac
exit 0
MOCKEOF

  # git-Mock: protokolliert jeden Aufruf, Rebase/Push gelingen immer.
  cat > "$mockdir/git" <<'MOCKEOF'
#!/usr/bin/env bash
echo "git $*" >> "$CALL_LOG"
case "$1" in
  rev-parse) echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" ;;
  status|diff) ;;   # sauberer Baum: kein Extra-Commit nötig
esac
exit 0
MOCKEOF

  # task-Mock: der eigentliche Prüfpunkt.
  cat > "$mockdir/task" <<'MOCKEOF'
#!/usr/bin/env bash
echo "task $*" >> "$CALL_LOG"
exit 0
MOCKEOF
  chmod +x "$mockdir/gh" "$mockdir/git" "$mockdir/task"

  run env PATH="$mockdir:$PATH" CALL_LOG="$log" MAX_CI_ATTEMPTS=1 TICKET_OFFLINE=1 \
    timeout 60 bash "$REPO_ROOT/scripts/devflow-ci-watch.sh" T002282 "http://example.com/pr/1"

  local calls regen push
  calls="$(cat "$log")"
  rm -rf "$mockdir"

  regen=$(printf '%s\n' "$calls" | grep -n '^task .*freshness:regenerate' | head -1 | cut -d: -f1)
  push=$(printf '%s\n' "$calls" | grep -n '^git push' | head -1 | cut -d: -f1)

  [ -n "$push" ] || { echo "kein 'git push' im Mock-Log — Rebase-Zweig wurde nicht durchlaufen:"; echo "$calls"; return 1; }
  [ -n "$regen" ] || { echo "kein 'task freshness:regenerate' im Mock-Log:"; echo "$calls"; return 1; }
  [ "$regen" -lt "$push" ] || { echo "freshness:regenerate lief NACH dem Push:"; echo "$calls"; return 1; }
}

@test "T002377: find-changed-tests.sh nennt den Grund, wenn es auf die volle Suite zurueckfaellt" {
  # Der Fallback war stumm. Wer die Ausgabe sah, las "Running changed spec tests:"
  # gefolgt von 138 Pfaden und hielt das fuer eine gezielte Auswahl. Der Lauf
  # dauert dann ueber zehn Minuten; laeuft er in ein Timeout, endet er mit
  # Exit != 0, obwohl JEDER Untertest bestanden hat — gemeldet als
  # "false-positive exit 1 bei test:spec:changed".
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/runall-repo"
  mkdir -p "$tmp/scripts" "$tmp/tests/spec/helpers"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  : > "$tmp/tests/spec/alpha.bats"
  : > "$tmp/tests/spec/beta.bats"
  : > "$tmp/tests/spec/helpers/shared.bash"

  cd "$tmp"
  git init -q -b main .
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  git checkout -q -b topic
  echo change >> tests/spec/helpers/shared.bash
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m harness

  # stdout bleibt die reine Dateiliste — nachgelagerte Aufrufer parsen sie.
  run bash -c 'bash scripts/find-changed-tests.sh spec 2>/dev/null'
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | wc -l)" -eq 2 ]

  # Der Grund geht nach stderr und nennt die ausloesende Datei.
  run bash -c 'bash scripts/find-changed-tests.sh spec 2>&1 >/dev/null'
  [ "$status" -eq 0 ]
  [[ "$output" == *"tests/spec/helpers/shared.bash"* ]] || {
    echo "Note nennt die ausloesende Datei nicht: $output"; false; }
  [[ "$output" == *"FULL spec suite"* ]] || {
    echo "Note benennt den Vollauf nicht: $output"; false; }
}

@test "T002377: der RUN_ALL-Hinweis erscheint genau einmal, nicht je Datei" {
  # Bei einem Diff mit vielen Ausloesern wuerde eine Zeile pro Datei die
  # eigentliche Meldung zutexten — und damit wieder unsichtbar machen.
  local finder="$REPO_ROOT/scripts/find-changed-tests.sh"
  local tmp="$BATS_TEST_TMPDIR/runall-once"
  mkdir -p "$tmp/scripts" "$tmp/tests/spec/helpers" "$tmp/.github/workflows"
  cp "$finder" "$tmp/scripts/find-changed-tests.sh"
  : > "$tmp/tests/spec/alpha.bats"
  : > "$tmp/tests/spec/helpers/shared.bash"
  : > "$tmp/.github/workflows/ci.yml"

  cd "$tmp"
  git init -q -b main .
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree
  git update-ref refs/remotes/origin/main HEAD

  git checkout -q -b topic
  echo a >> tests/spec/helpers/shared.bash
  echo b >> .github/workflows/ci.yml
  git add -A && git -c user.email=t@t -c user.name=t commit -q -m two-triggers

  run bash -c 'bash scripts/find-changed-tests.sh spec 2>&1 >/dev/null | grep -c "FULL spec suite"'
  [ "$output" = "1" ] || { echo "erwartet genau 1 Hinweis, bekam: $output"; false; }
}

# ── [T002375-p4] Freshness und Test-Selektion melden, was wirklich los ist ──#
#
# Drei Mishaps mit derselben Rechnung: ein Agent befolgt die Pflicht-Verifikation
# woertlich, sieht Rot, und verbrennt Zeit mit der Diagnose eines Nicht-Fehlers.

@test "T002375-p4: test:changed prueft die Erreichbarkeit, bevor es E2E-Services startet" {
  # Positiv-Anker: der Aufruf existiert ueberhaupt noch — ohne ihn pruefte der
  # Negativteil nichts. Bewusst NICHT entfernt: wer einen Dev-Stack laufen hat, soll
  # die Gruppe weiterhin bekommen. Der Fehler war die Bedingungslosigkeit.
  run grep -c 'task test:e2e:services' "$REPO_ROOT/Taskfile.yml"
  [ "$output" -ge 1 ] || { echo "der e2e:services-Aufruf ist ganz verschwunden"; false; }

  # Der Reachability-Check muss im selben Block stehen.
  run bash -c "awk '/RUN_E2E_SERVICES.*=.*true.*npx/,/^        fi\$/' '$REPO_ROOT/Taskfile.yml' | grep -c '4321'"
  [ "$output" -ge 1 ] || { echo "kein Erreichbarkeits-Check auf 4321 vor test:e2e:services"; false; }
}

@test "T002375-p4: der Skip nennt sich sichtbar und als Nicht-Blocker" {
  # Ein stiller Skip verschiebt die Frage nur eine Ebene weiter.
  run bash -c "grep -c 'e2e services uebersprungen' '$REPO_ROOT/Taskfile.yml'"
  [ "$output" = "1" ] || { echo "keine sichtbare Skip-Meldung"; false; }
  run bash -c "grep 'e2e services uebersprungen' '$REPO_ROOT/Taskfile.yml' | grep -c 'Kein PR-Blocker'"
  [ "$output" = "1" ] || { echo "die Skip-Meldung sagt nicht, dass es kein PR-Blocker ist"; false; }
}

@test "T002375-p4: freshness:check unterscheidet 'nicht gestaged' von 'nicht committet'" {
  # Phase 0 laesst freshness:regenerate laufen — der Arbeitsbaum ist danach per
  # Konstruktion aktuell. 'is stale' war deshalb strukturell die falsche Diagnose und
  # las sich wie ein fehlgeschlagenes regenerate; T002352-M3 beschreibt die Schleife,
  # in die man daraufhin laeuft.
  run bash -c "grep -c 'regenerated but not staged' '$REPO_ROOT/Taskfile.yml'"
  [ "$output" = "1" ] || { echo "die 'nicht gestaged'-Meldung fehlt"; false; }
  run bash -c "grep -c 'staged but not committed' '$REPO_ROOT/Taskfile.yml'"
  [ "$output" = "1" ] || { echo "die 'nicht committet'-Meldung fehlt"; false; }
  # Die alte, irrefuehrende Formulierung darf nicht zurueckkommen.
  run bash -c "grep -c \"is stale — run 'task freshness:regenerate' locally and commit\" '$REPO_ROOT/Taskfile.yml'"
  [ "$output" = "0" ] || { echo "die alte 'is stale'-Meldung steht noch da"; false; }
}

@test "T002375-p4: das Scan-Universum zaehlt untracked-aber-nicht-ignorierte Dateien mit" {
  # Ohne das war eine frisch angelegte Datei beim ERSTEN freshness:regenerate noch
  # untracked und fiel heraus; erst nach git add erschien sie und aenderte den Index
  # ein zweites Mal — zwei Durchlaeufe des ~9s-Gates plus Commit-Amend
  # (T002255: file_count 548 -> 549; T002267 identisch).
  run grep -Fq -- '--exclude-standard' "$REPO_ROOT/scripts/code-quality/scan.mjs"
  [ "$status" -eq 0 ] || { echo "scan.mjs zaehlt weiterhin nur getrackte Dateien"; false; }

  # Verhaltensbeweis statt Textsuche: eine ungetrackte Datei unter einem code_root
  # muss im Universum landen. Sandbox, damit der echte Arbeitsbaum unberuehrt bleibt.
  local probe="$REPO_ROOT/scripts/t002375-p4-universe-probe.sh"
  [ ! -e "$probe" ] || skip "Probe-Pfad existiert bereits"
  printf '#!/usr/bin/env bash\n' > "$probe"
  run bash -c "cd '$REPO_ROOT' && node -e \"
    import('./scripts/code-quality/scan.mjs').then(async (m) => {
      const { loadGates } = await import('./scripts/code-quality/load.mjs');
      const u = m.scanUniverse('.', loadGates('docs/code-quality'));
      console.log(u.includes('scripts/t002375-p4-universe-probe.sh') ? 'IN' : 'OUT');
    });
  \""
  local verdict="$output"
  rm -f "$probe"
  [[ "$verdict" == *"IN"* ]] || { echo "ungetrackte Datei fehlt im Scan-Universum: $verdict"; false; }
}

# ────────────────────────────────────────────────────────────────────────────
# T002341-M1: stage-plan hat Timeout-Wrapper fuer _exec_sql
# ────────────────────────────────────────────────────────────────────────────

@test "T002341-M1: stage-plan.sh definiert _exec_sql_with_timeout" {
  [ -f "$REPO_ROOT/scripts/vda/ticket/stage-plan.sh" ] || skip "stage-plan.sh nicht gefunden"
  grep -q '_exec_sql_with_timeout' "$REPO_ROOT/scripts/vda/ticket/stage-plan.sh" \
    || { echo "MISSING _exec_sql_with_timeout function in stage-plan.sh"; return 1; }
}

@test "T002341-M1: stage-plan.sh timeout wrapper enthaelt WARN message" {
  [ -f "$REPO_ROOT/scripts/vda/ticket/stage-plan.sh" ] || skip "stage-plan.sh nicht gefunden"
  grep -q 'timed out after' "$REPO_ROOT/scripts/vda/ticket/stage-plan.sh" \
    || { echo "MISSING timeout warning message in stage-plan.sh"; return 1; }
}

# ────────────────────────────────────────────────────────────────────────────
# T002341-M2: agent-collision.sh filtert generierte Dateien aus der Kollisionsmeldung
# ────────────────────────────────────────────────────────────────────────────
# Der urspruengliche Fix fuehrte eine hartkodierte Liste (_is_generated) ein.
# T002375-p6 loeste sie durch _drop_generated ab, das .gitattributes
# (linguist-generated=true) als SSOT liest. Diese Tests pruefen deshalb das
# VERHALTEN, nicht den Funktionsnamen — sonst schreiben sie eine abgeloeste
# Bauform fest.

@test "T002341-M2: agent-collision.sh filtert generierte Pfade aus einer Dateiliste" {
  [ -f "$REPO_ROOT/scripts/agent-collision.sh" ] || skip "agent-collision.sh nicht gefunden"
  run bash -c "cd '$REPO_ROOT' && source scripts/agent-collision.sh 2>/dev/null
    _drop_generated 'website/src/data/openspec-status.json'"
  [ "$status" -eq 0 ] || { echo "_drop_generated nicht aufrufbar"; return 1; }
  # Positiv-Anker zuerst: eine echte Quelldatei MUSS die Filterung ueberleben,
  # sonst besteht die Negativ-Aussage unten vakuos (T002356-M1).
  run bash -c "cd '$REPO_ROOT' && source scripts/agent-collision.sh 2>/dev/null
    _drop_generated 'website/src/pages/index.astro'"
  [ "$(printf '%s' "$output" | tr -d '[:space:]')" = "website/src/pages/index.astro" ] \
    || { echo "Quelldatei wurde faelschlich gefiltert: '$output'"; return 1; }
  run bash -c "cd '$REPO_ROOT' && source scripts/agent-collision.sh 2>/dev/null
    _drop_generated 'website/src/data/openspec-status.json'"
  [ -z "$(printf '%s' "$output" | tr -d '[:space:]')" ] \
    || { echo "openspec-status.json haette gefiltert werden muessen: '$output'"; return 1; }
}

@test "T002341-M2: cmd_check wendet den Generated-Filter auf beide Seiten an" {
  [ -f "$REPO_ROOT/scripts/agent-collision.sh" ] || skip "agent-collision.sh nicht gefunden"
  # eigene Dateien UND Peer-Dateien muessen durch _drop_generated laufen —
  # ein einseitiger Filter meldet die Kollision weiterhin.
  local n
  n=$(sed -n '/^cmd_check()/,/^}/p' "$REPO_ROOT/scripts/agent-collision.sh" | grep -c '_drop_generated')
  [ "$n" -ge 2 ] \
    || { echo "cmd_check ruft _drop_generated nur ${n}x auf, erwartet >=2 (own + peer)"; return 1; }
}

@test "T002341-M3: agent-lock.sh cmd_claim enthaelt cmd_reap call" {
  [ -f "$REPO_ROOT/scripts/agent-lock.sh" ] || skip "agent-lock.sh nicht gefunden"
  grep -q 'cmd_reap' "$REPO_ROOT/scripts/agent-lock.sh" \
    || { echo "MISSING cmd_reap call in agent-lock.sh"; return 1; }
}

@test "T002341-M3: agent-lock.sh cmd_reap entfernt lock-Dateien mit dead SID" {
  [ -f "$REPO_ROOT/scripts/agent-lock.sh" ] || skip "agent-lock.sh nicht gefunden"
  grep -qP 'sid-dead.*return 0|_reap_log.*sid-dead' "$REPO_ROOT/scripts/agent-lock.sh" \
    || { echo "MISSING sid-dead reap path in agent-lock.sh"; return 1; }
}

# ────────────────────────────────────────────────────────────────────────────
# T002341-M3: agent-lock.sh pre-claim reap guard (claim ruft reap auf)
# ────────────────────────────────────────────────────────────────────────────

@test "T002341-M3: agent-lock.sh pre-claim reap in cmd_claim hat T002341-M3 Kommentar" {
  [ -f "$REPO_ROOT/scripts/agent-lock.sh" ] || skip "agent-lock.sh nicht gefunden"
  grep -q 'T002341-M3' "$REPO_ROOT/scripts/agent-lock.sh" \
    || { echo "MISSING T002341-M3 reference in agent-lock.sh"; return 1; }
}

# ── [T002374-M1] commitlint: 'skills' is a first-class scope, not an alias ──#

@test "T002374-M1: 'skills' ist ein gueltiger Scope, kein Alias mehr" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  # 'skills' is now a NAMED_SCOPE, not a SCOPE_ALIAS. scopeHint returns empty.
  run bash -c "node -e \"const cfg = require('$REPO_ROOT/commitlint.config.cjs'); process.stdout.write(cfg.scopeHint('skills') || '(empty)');\""
  [[ "$output" == *"empty"* ]] || { echo "scopeHint fuer 'skills' soll leer sein (skills ist jetzt First-Class-Scope): $output"; false; }
}

# ── [T002374-M2] agent-lock release: --force bei SID-Mismatch ───────────#

@test "T002374-M2: agent-lock.sh release mit --force ueberschreibt SID-Mismatch" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_FAKE_ALIVE="session-A-orch"
  export AGENT_LOCK_SID="session-A-orch"
  bash "$BATS_TEST_DIRNAME/../../scripts/agent-lock.sh" claim ticket T002374-m2 --label test-delegate
  [ -f "$AGENT_LOCK_DIR/ticket__T002374-m2.json" ]

  export AGENT_LOCK_SID="session-B-sub"
  run bash "$BATS_TEST_DIRNAME/../../scripts/agent-lock.sh" release ticket T002374-m2 --force
  echo "exit: $status output: $output"
  [ "$status" -eq 0 ] || { echo "release with --force must succeed even with SID mismatch"; false; }
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002374-m2.json" ] || { echo "lock file should be deleted after release"; false; }
  rm -rf "$AGENT_LOCK_DIR"
}
