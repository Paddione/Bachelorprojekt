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

# Inline-envsubst-Liste des website:deploy-Tasks (Zeilen mit $WEBSITE_IMAGE-Liste).
_website_deploy_list() {
  awk '
    $0 == "  website:deploy:" {in_task=1; next}
    in_task && /^  [a-zA-Z0-9:_-]+:$/ {exit}
    in_task && /envsubst "\\\$WEBSITE_IMAGE/ {print}
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
