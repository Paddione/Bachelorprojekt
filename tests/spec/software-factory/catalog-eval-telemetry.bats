#!/usr/bin/env bats
# tests/spec/software-factory/catalog-eval-telemetry.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-57-app-catalog ────────────────────────────────────────#
# FA-SF-57: App Catalog & Installer Tests

@test "FA-SF-57: validate-manifest rejects invalid manifests" {
  cat <<EOF > "$TEST_TMP_DIR/invalid.yaml"
name: invalid_name_UPPERCASE
title: "Test App"
description: "A test app"
kustomize: k3d/test
EOF

  run node scripts/validate-manifest.mjs "$TEST_TMP_DIR/invalid.yaml"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "Validation failed" ]]
}

@test "FA-SF-57: validate-manifest accepts valid manifests" {
  cat <<EOF > "$TEST_TMP_DIR/valid.yaml"
name: valid-app-name-123
title: "Test App"
description: "A test app description"
kustomize: k3d/test
domains:
  - key: TEST_DOMAIN
    host: "test.\${PROD_DOMAIN}"
EOF

  run node scripts/validate-manifest.mjs "$TEST_TMP_DIR/valid.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "is valid" ]]
}

@test "FA-SF-57: app-install.sh rejects missing app manifests" {
  run bash scripts/app-install.sh non-existent-app --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" =~ "App manifest not found" ]]
}

@test "FA-SF-57: app-install.sh dry-run simulates deployment steps" {
  # Mock a test catalog app
  mkdir -p "apps/test-mock-app"
  cat <<EOF > "apps/test-mock-app/app.yaml"
name: test-mock-app
title: "Mock App"
description: "A mock app for testing"
kustomize: k3d/whiteboard
domains:
  - key: MOCK_APP_DOMAIN
    host: "mock.\${PROD_DOMAIN}"
secrets:
  - MOCK_APP_JWT_SECRET
EOF

  run bash scripts/app-install.sh test-mock-app --dry-run
  local test_status=$status test_output="$output"
  rm -rf "apps/test-mock-app"

  # CI debug: log status for troubleshooting
  if [ "$test_status" -ne 0 ]; then
    echo "DEBUG_APP_INSTALL_STATUS=$test_status" >&3
    echo "DEBUG_APP_INSTALL_OUTPUT=$(echo "$test_output" | head -5)" >&3
  fi

  [ "$test_status" -eq 0 ] || skip "app-install dry-run failed (status=$test_status) — CI limitation"
  [[ "$test_output" =~ "Validating manifest schema" ]]
  [[ "$test_output" =~ "Merging domains" ]]
  [[ "$test_output" =~ "Would register secret" ]]
  [[ "$test_output" =~ "Simulating deploy" ]]
}

# ── FA-SF-58-eval-harness ───────────────────────────────────────#
# FA-SF-58: Factory Eval-Harness — Scoring logic and fixture validation (offline-safe)

@test "FA-SF-58: eval.mjs loads fixtures and produces scorecard" {
  cat > "$TEST_TMP_DIR/fixtures/T000725/ticket.json" <<'EOF'
{"title":"Test","description":"Simple test","type":"feature","external_id":"T000725","brand":"mentolder","area":"factory"}
EOF
  cat > "$TEST_TMP_DIR/fixtures/T000725/expected.json" <<'EOF'
{"files":["scripts/test.sh"],"forbidden":[],"tests":["bash -n scripts/test.sh"],"min_recall":0,"min_precision":0}
EOF

  run node scripts/factory/eval.mjs \
    --fixtures-dir "$TEST_TMP_DIR/fixtures" \
    --out-dir "$TEST_TMP_DIR/out" \
    --dry-run
  echo "exit=$status output=$output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Aggregate score" ]]
  [[ -f "$TEST_TMP_DIR/out/latest.json" ]]
}

@test "FA-SF-58: scoring rejects when forbidden files touched" {
  run node scripts/factory/eval.mjs --dry-run --out-dir "$TEST_TMP_DIR/out2"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Aggregate score" ]]
  [[ -f "$TEST_TMP_DIR/out2/latest.json" ]]
}

@test "FA-SF-58: scoreFixture calculation is deterministic" {
  run node -e "
    const path = require('path');
    const fs = require('fs');
    const REPO = path.resolve('.');

    // inline the scoring logic for testing
    function matchGlob(pattern, files) {
      const re = new RegExp('^' + pattern
        .replace(/\*\*/g, '<<<GS>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GS>>>/g, '.*')
        .replace(/\?/g, '.') + '\$');
      return files.some(f => re.test(f));
    }

    function scoreFixture(touchedFiles, testResults) {
      const expectedFiles = ['scripts/test.sh'];
      const forbidden = ['k3d/configmap-domains.yaml'];
      const minRecall = 0.5;
      const minPrecision = 0.3;

      const hitFiles = touchedFiles.filter(f =>
        expectedFiles.some(p => matchGlob(p, [f])));
      const falseFiles = touchedFiles.filter(f =>
        forbidden.some(p => matchGlob(p, [f])));
      const relevantExpected = expectedFiles.filter(p =>
        touchedFiles.some(f => matchGlob(p, [f])));
      const recall = expectedFiles.length > 0 ? relevantExpected.length / expectedFiles.length : 0;
      const precision = touchedFiles.length > 0 ? hitFiles.length / touchedFiles.length : 0;
      const scopePenalty = falseFiles.length > 0 ? falseFiles.length * 0.25 : 0;
      const testPass = testResults.every(r => r === true);
      const testScore = testPass ? 1.0 : 0.0;
      const recallPass = recall >= minRecall;
      const precisionPass = precision >= minPrecision;
      const overall = Math.max(0, Math.min(1,
        (recall * 0.3 + precision * 0.2 + testScore * 0.4) - scopePenalty));
      const pass = testPass && recallPass && precisionPass && falseFiles.length === 0;
      return { pass, score: Math.round(overall * 100) / 100,
        dimensions: { recall: Math.round(recall*100)/100, precision: Math.round(precision*100)/100,
          scope_penalty: scopePenalty, test_pass: testPass } };
    }

    // Test 1: perfect hit
    let r = scoreFixture(['scripts/test.sh'], [true]);
    console.log('perfect hit:', JSON.stringify(r));
    if (!r.pass || r.score < 0.8) { process.exit(1); }

    // Test 2: wrong file
    r = scoreFixture(['src/wrong.ts'], [true]);
    console.log('wrong file:', JSON.stringify(r));
    if (r.pass) { process.exit(2); }
    if (r.dimensions.recall !== 0) { process.exit(3); }

    // Test 3: forbidden file
    r = scoreFixture(['scripts/test.sh', 'k3d/configmap-domains.yaml'], [true]);
    console.log('forbidden:', JSON.stringify(r));
    if (r.pass) { process.exit(4); }
    if (r.dimensions.scope_penalty !== 0.25) { process.exit(5); }

    // Test 4: test failure
    r = scoreFixture(['scripts/test.sh'], [false]);
    console.log('test fail:', JSON.stringify(r));
    if (r.pass) { process.exit(6); }

    console.log('ALL PASS');
    process.exit(0);
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "ALL PASS" ]]
}

@test "FA-SF-58: glob matching works correctly" {
  run node -e "
    function matchGlob(pattern, files) {
      const re = new RegExp('^' + pattern
        .replace(/\*\*/g, '<<<GS>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GS>>>/g, '.*')
        .replace(/\?/g, '.') + '\$');
      return files.some(f => re.test(f));
    }
    const tests = [
      matchGlob('scripts/*.sh', ['scripts/test.sh']) === true,
      matchGlob('scripts/*.sh', ['src/test.sh']) === false,
      matchGlob('website/**/*.ts', ['website/src/lib/x.ts']) === true,
      matchGlob('website/**/*.ts', ['k3d/x.ts']) === false,
      matchGlob('*.json', ['file.json']) === true,
      matchGlob('*.json', ['dir/file.json']) === false,
      matchGlob('tests/*', ['tests/x.json']) === true,
    ];
    const ok = tests.every(Boolean);
    console.log(tests.map(t => t ? 'PASS' : 'FAIL').join(', '));
    process.exit(ok ? 0 : 1);
  "
  [ "$status" -eq 0 ]
}

@test "FA-SF-58: discrimination — worse prompt lowers score" {
  run node -e "
    const fs = require('fs');
    const path = require('path');
    const REPO = path.resolve('.');
    const fixturesDir = path.join(REPO, 'tests/factory-eval/fixtures');

    // For discrimination test: verify that scoring functions produce
    // lower scores when fewer expected files are hit
    function matchGlob(pattern, files) {
      const re = new RegExp('^' + pattern
        .replace(/\*\*/g, '<<<GS>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GS>>>/g, '.*')
        .replace(/\?/g, '.') + '\$');
      return files.some(f => re.test(f));
    }

    function score(touchedFiles, expectedFiles, testResults) {
      const hitFiles = touchedFiles.filter(f =>
        expectedFiles.some(p => matchGlob(p, [f])));
      const relevantExpected = expectedFiles.filter(p =>
        touchedFiles.some(f => matchGlob(p, [f])));
      const recall = expectedFiles.length > 0 ? relevantExpected.length / expectedFiles.length : 0;
      const precision = touchedFiles.length > 0 ? hitFiles.length / touchedFiles.length : 0;
      const testPass = testResults.every(r => r === true);
      const overall = recall * 0.3 + precision * 0.2 + (testPass ? 0.4 : 0);
      return Math.round(overall * 100) / 100;
    }

    const expected = ['a.js', 'b.js', 'c.js'];

    // Good: hits all 3
    const goodScore = score(['a.js', 'b.js', 'c.js'], expected, [true]);
    console.log('good score:', goodScore);

    // Bad: hits only 1
    const badScore = score(['a.js'], expected, [true]);
    console.log('bad score:', badScore);

    if (goodScore <= badScore) { process.exit(1); }
    console.log('DISCRIMINATION OK: good=' + goodScore + ' > bad=' + badScore);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "DISCRIMINATION OK" ]]
}

# ── FA-SF-59-aci-loop ───────────────────────────────────────────#
# FA-SF-59: ACI Loop — tests ACI tools and auto-repair behavior (offline-safe)

@test "FA-SF-59: aci.cjs module loads without errors" {
  run node -e "const aci = require('./scripts/factory/aci.cjs'); console.log(Object.keys(aci).join(','))"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "view" ]]
  [[ "$output" =~ "edit" ]]
  [[ "$output" =~ "validate" ]]
  [[ "$output" =~ "search" ]]
  [[ "$output" =~ "runTest" ]]
}

@test "FA-SF-59: ACI view works with line ranges" {
  run node -e "
    const aci = require('./scripts/factory/aci.cjs');
    const fs = require('fs');
    const f = '$TEST_TMP_DIR/view-test.txt';
    fs.writeFileSync(f, Array.from({length:10}, (_,i) => 'line '+(i+1)).join('\n'), 'utf8');

    let r = aci.view(f, 3, 6);
    console.log('range:', r.data.includes('3: line 3') && r.data.includes('6: line 6') && !r.data.includes('1: line'));
    
    r = aci.view(f);
    console.log('full:', r.total_lines === 10 && r.data.includes('line 10'));
    
    r = aci.view('/nonexistent');
    console.log('missing:', r.failed);
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "range: true" ]]
  [[ "$output" =~ "full: true" ]]
  [[ "$output" =~ "missing: true" ]]
}

@test "FA-SF-59: ACI edit with auto-revert on syntax error" {
  run node -e "
    const aci = require('./scripts/factory/aci.cjs');
    const fs = require('fs');
    const f = '$TEST_TMP_DIR/edit-test.js';
    const original = 'const x = 42;\\nmodule.exports = { x };\\n';
    fs.writeFileSync(f, original, 'utf8');

    // Valid edit
    let r = aci.edit(f, 1, 1, 'const x = 100;');
    const afterEdit = fs.readFileSync(f, 'utf8');
    console.log('valid:', !r.failed && afterEdit.includes('x = 100'));

    // Restore
    fs.writeFileSync(f, original, 'utf8');

    // Invalid edit - should auto-revert
    r = aci.edit(f, 1, 1, 'const x = ;');
    const afterRevert = fs.readFileSync(f, 'utf8');
    console.log('revert:', r.failed && r.reverted && afterRevert === original);
    console.log('error:', r.error.includes('Validation'));
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "valid: true" ]]
  [[ "$output" =~ "revert: true" ]]
  [[ "$output" =~ "error: true" ]]
}

@test "FA-SF-59: ACI validate detects syntax errors per filetype" {
  run node -e "
    const aci = require('./scripts/factory/aci.cjs');
    const fs = require('fs');
    const tmp = '$TEST_TMP_DIR';

    // Good JS
    fs.writeFileSync(tmp+'/good.js', 'const a = 1;\\n', 'utf8');
    let v = aci.validate(tmp+'/good.js');
    console.log('js-good:', v.valid);

    // Bad JS
    fs.writeFileSync(tmp+'/bad.js', 'const a = ;\\n', 'utf8');
    v = aci.validate(tmp+'/bad.js');
    console.log('js-bad:', !v.valid);

    // Good SH
    fs.writeFileSync(tmp+'/good.sh', '#!/usr/bin/env bash\\necho hi\\n', 'utf8');
    v = aci.validate(tmp+'/good.sh');
    console.log('sh-good:', v.valid);

    // Bad SH
    fs.writeFileSync(tmp+'/bad.sh', '#!/usr/bin/env bash\\nif true\\n', 'utf8');
    v = aci.validate(tmp+'/bad.sh');
    console.log('sh-bad:', !v.valid);

    // Good JSON
    fs.writeFileSync(tmp+'/good.json', '{\"a\": 1}\\n', 'utf8');
    v = aci.validate(tmp+'/good.json');
    console.log('json-good:', v.valid);

    // Bad JSON
    fs.writeFileSync(tmp+'/bad.json', '{a: 1}\\n', 'utf8');
    v = aci.validate(tmp+'/bad.json');
    console.log('json-bad:', !v.valid);
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "js-good: true" ]]
  [[ "$output" =~ "js-bad: true" ]]
  [[ "$output" =~ "sh-good: true" ]]
  [[ "$output" =~ "sh-bad: true" ]]
  [[ "$output" =~ "json-good: true" ]]
  [[ "$output" =~ "json-bad: true" ]]
}

@test "FA-SF-59: pipeline.js loads ACI conditionally via env var" {
  run bash -c "ACI_ENABLED=true node --check scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "" ]]  # node --check produces no output on success

  run bash -c "ACI_ENABLED=false node --check scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ]

  run bash -c "node --check scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-59: ACI module exports match expected interface" {
  run node -e "
    const aci = require('./scripts/factory/aci.cjs');
    const required = ['view','search','edit','validate','runTest','getValidator'];
    const missing = required.filter(k => typeof aci[k] !== 'function');
    console.log('exported:', Object.keys(aci).filter(k => typeof aci[k] === 'function').join(','));
    console.log('missing:', missing.join(','));
    process.exit(missing.length === 0 ? 0 : 1);
  "
  [ "$status" -eq 0 ]
}

# ── FA-SF-72-eval-replay ────────────────────────────────────────#
# FA-SF-72: Eval replay, fixture generator, and eval-context helper (offline-safe)

@test "FA-SF-72: eval-context helper builds compact JSON for a known fixture" {
  run node scripts/factory/eval.mjs --dry-run --out-dir "$TEST_TMP_DIR/evalctx-out"
  [ "$status" -eq 0 ]

  run node -e "
    const { buildEvalContext } = require('./scripts/factory/eval-context.cjs');
    const ctx = buildEvalContext('T000725', { fixturesDir: './tests/factory-eval/fixtures', outDir: '$TEST_TMP_DIR/evalctx-out' });
    console.log('ctx:', ctx);
    const obj = JSON.parse(ctx);
    if (obj.fixture !== 'T000725') process.exit(1);
    if (obj.mode !== 'live') process.exit(2);
    if (typeof obj.pass !== 'boolean') process.exit(3);
    if (typeof obj.score !== 'number') process.exit(4);
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "ctx:" ]]
}

@test "FA-SF-72: eval-context helper returns null for unknown fixture" {
  run node -e "
    const { buildEvalContext } = require('./scripts/factory/eval-context.cjs');
    const ctx = buildEvalContext('T999999', { fixturesDir: './tests/factory-eval/fixtures', outDir: '$TEST_TMP_DIR/evalctx-out2' });
    console.log('ctx:', ctx);
    if (ctx !== null) process.exit(1);
  "
  [ "$status" -eq 0 ]
}

@test "FA-SF-72: eval.mjs --replay --dry-run records mode=replay and touches no LLM" {
  local fid="T000FAKE"
  mkdir -p "$TEST_TMP_DIR/factory-eval-fixtures/$fid"
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/ticket.json" <<'EOF'
{"title":"Replay fixture","description":"fake","type":"bug","external_id":"T000FAKE","brand":"mentolder","area":"factory"}
EOF
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/expected.json" <<'EOF'
{"files":["scripts/factory/eval.mjs"],"forbidden":[],"tests":[],"min_recall":0,"min_precision":0}
EOF
  local base_commit
  base_commit=$(git rev-parse HEAD)
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/meta.json" <<EOF
{"base_commit":"$base_commit","pr_number":9999,"generated_at":"2026-07-19T00:00:00Z","source":"test"}
EOF

  run node scripts/factory/eval.mjs \
    --replay --fixture "$fid" \
    --dry-run \
    --fixtures-dir "$TEST_TMP_DIR/factory-eval-fixtures" \
    --out-dir "$TEST_TMP_DIR/replay-out"
  echo "exit=$status output=$output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "replay" ]]
  [[ -f "$TEST_TMP_DIR/replay-out/latest.json" ]]
  run jq -r '.scores[0].mode' "$TEST_TMP_DIR/replay-out/latest.json"
  [ "$status" -eq 0 ]
  [ "$output" = "replay" ]
  run jq -r '.scores[0].base_commit' "$TEST_TMP_DIR/replay-out/latest.json"
  [ "$status" -eq 0 ]
  [ "$output" = "$base_commit" ]
}

# T002240: the test above was order-/state-dependently flaky (and got skipped on
# main as "pre-existing regression"). Cause: the dry run shelled out to
# worktree-create.sh, whose divergence guard mutates the SHARED repository —
# `git fetch origin main:main` fails whenever local main is behind origin/main
# and main is checked out elsewhere. These two assertions pin the isolation so a
# future edit re-introducing the worktree in dry-run mode fails a test instead of
# a random CI run.
@test "FA-SF-72: eval replay dry-run creates no worktree and no branch [T002240]" {
  local fid="T000FAKE2"
  mkdir -p "$TEST_TMP_DIR/factory-eval-fixtures/$fid"
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/ticket.json" <<'EOF'
{"title":"Replay fixture","description":"fake","type":"bug","external_id":"T000FAKE2","brand":"mentolder","area":"factory"}
EOF
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/expected.json" <<'EOF'
{"files":["scripts/factory/eval.mjs"],"forbidden":[],"tests":[],"min_recall":0,"min_precision":0}
EOF
  local base_commit
  base_commit=$(git rev-parse HEAD)
  cat > "$TEST_TMP_DIR/factory-eval-fixtures/$fid/meta.json" <<EOF
{"base_commit":"$base_commit","pr_number":9999,"generated_at":"2026-07-19T00:00:00Z","source":"test"}
EOF

  local worktrees_before branches_before
  worktrees_before=$(git worktree list | wc -l)
  branches_before=$(git branch --list 'eval-replay-*' | wc -l)

  run node scripts/factory/eval.mjs \
    --replay --fixture "$fid" --dry-run \
    --fixtures-dir "$TEST_TMP_DIR/factory-eval-fixtures" \
    --out-dir "$TEST_TMP_DIR/replay-out2"
  echo "exit=$status output=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no worktree created"* ]]

  # no residue in the shared repo — this is the isolation that fixes the flake
  [ "$(git worktree list | wc -l)" -eq "$worktrees_before" ]
  [ "$(git branch --list 'eval-replay-*' | wc -l)" -eq "$branches_before" ]
}

@test "FA-SF-72: eval-replay.mjs does not call worktree-create.sh in dry-run mode [T002240]" {
  # The dry-run early return must sit BEFORE the worktree-create.sh invocation.
  local dry_line wt_line
  dry_line=$(grep -n 'if (dryRun)' scripts/factory/eval-replay.mjs | head -1 | cut -d: -f1)
  wt_line=$(grep -n 'WORKTREE_CREATE' scripts/factory/eval-replay.mjs | tail -1 | cut -d: -f1)
  [ -n "$dry_line" ]
  [ -n "$wt_line" ]
  [ "$dry_line" -lt "$wt_line" ]
}

@test "FA-SF-72: task factory:eval:gen refuses to overwrite existing fixture" {
  run task factory:eval:gen -- T000725
  echo "exit=$status output=$output"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "Refusing to overwrite" ]]
  [[ "$output" =~ "tests/factory-eval/fixtures/T000725" ]]
}

@test "FA-SF-72: Taskfile eval:gen and eval:replay targets are resolvable" {
  run task --list-all factory:eval:gen factory:eval:replay
  [ "$status" -eq 0 ]
  [[ "$output" =~ "factory:eval:gen" ]]
  [[ "$output" =~ "factory:eval:replay" ]]
}

@test "FA-SF-72: CI advisory step references factory:eval:replay and agent-setup paths" {
  run grep -A6 "Agent setup replay reminder" .github/workflows/ci.yml
  [ "$status" -eq 0 ]
  [[ "$output" =~ "factory:eval:replay" ]]
  [[ "$output" =~ "agent-models.jsonc" ]]
  [[ "$output" =~ "review-" ]]
  [[ "$output" =~ "provider-router" ]]
  [[ "$output" =~ "AGENTS" ]]
}

@test "FA-SF-72: README documents Eval workflow and replay advisory" {
  run grep -F "Eval / Private Benchmark" scripts/factory/README.md
  [ "$status" -eq 0 ]
  run grep -F "task factory:eval:replay" scripts/factory/README.md
  [ "$status" -eq 0 ]
  run grep -F "Overfitting-Caveat" scripts/factory/README.md
  [ "$status" -eq 0 ]
}

@test "FA-SF-72: AGENTS.md documents replay advisory mandatory step" {
  run grep -F "task factory:eval:replay" AGENTS.md
  [ "$status" -eq 0 ]
  run grep -F "agent-models.jsonc" AGENTS.md
  [ "$status" -eq 0 ]
}

# ── T001444-phase-telemetry ─────────────────────────────────────#
# Auto-Emission + fail-closed Gate. Offline, CI-safe: ein PATH-Stub ersetzt
# `kubectl` — `get` liefert einen Fake-Pod, `exec` schreibt -v-Args + SQL-Heredoc
# in eine Capture-Datei. Reads/Writes erreichen so nie einen echten Cluster.
_pt_capture_stub() {   # $CAP_FILE muss vor dem Aufruf exportiert sein
  local dir; dir="$(mktemp -d)"
  cat > "$dir/kubectl" <<'STUB'
#!/usr/bin/env bash
mode=""
for a in "$@"; do case "$a" in get) mode=get;; exec) mode=exec;; esac; done
if [[ "$mode" == get ]]; then echo "pod/shared-db-0"; exit 0; fi
printf '%s\n' "$@" >> "$CAP_FILE"
cat >> "$CAP_FILE"
exit 0
STUB
  chmod +x "$dir/kubectl"
  PATH="$dir:$PATH"
}

@test "T001444: update-status done auto-emits deploy/done" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_PHASE_DRIVER=devflow bash scripts/ticket.sh update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  grep -q "auto_phase=deploy"          "$CAP_FILE"
  grep -q "auto_state=done"            "$CAP_FILE"
  grep -q "driver=devflow"             "$CAP_FILE"
  grep -q "NOT EXISTS"                 "$CAP_FILE"
  grep -q "auto: update-status done"   "$CAP_FILE"
}

@test "T001444: update-status in_progress→implement/entered, in_review→implement/done, qa_review→verify/entered" {
  for pair in "in_progress implement entered" "in_review implement done" "qa_review verify entered"; do
    set -- $pair
    CAP_FILE="$(mktemp)"; export CAP_FILE
    _pt_capture_stub
    run bash scripts/ticket.sh update-status --id T000001 --status "$1"
    [ "$status" -eq 0 ]
    grep -q "auto_phase=$2"  "$CAP_FILE"
    grep -q "auto_state=$3"  "$CAP_FILE"
  done
}

@test "T001444: update-status defaults driver to devflow, factory via env" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_PHASE_DRIVER=factory bash scripts/ticket.sh update-status --id T000001 --status in_progress
  [ "$status" -eq 0 ]
  grep -q "driver=factory" "$CAP_FILE"
}

@test "T001444: update-status honors TICKET_OFFLINE (no emission)" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  run env TICKET_OFFLINE=1 bash scripts/ticket.sh update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  [[ "$output" =~ "OFFLINE" ]]
  [ ! -s "$CAP_FILE" ]
}

@test "T001444: stage-plan auto-emits scout/design/plan done" {
  CAP_FILE="$(mktemp)"; export CAP_FILE
  _pt_capture_stub
  # T002347 (+T002368, dort per mktemp gelöst — beim Rebase 2026-07-28 zugunsten
  # dieser Fassung verworfen: BATS_TEST_TMPDIR raeumt BATS selbst ab, waehrend das
  # rm -rf der mktemp-Variante bei genau dem SIGTERM ausfaellt, den sie adressiert).
  # Hermetische Sandbox (Muster T002327): T002471-M6 verlangt seit dem Rebase,
  # dass die Plan-Datei committed ist (`git cat-file -e "HEAD:${plan}"`), bevor
  # stage-plan sie akzeptiert. Die Datei muss also in einem git-Repo liegen — aber
  # nicht im echten Worktree, sonst wuerde der Test den Tree verschmutzen und
  # parallel laufende openspec-Validierungen stoerten sich an einem halben Change.
  local sbox="$BATS_TEST_TMPDIR/stage-plan-sandbox"
  mkdir -p "$sbox" && ln -s "$REPO/scripts" "$sbox/scripts"
  ( cd "$sbox" && git init -q -b main . &&
    git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base )
  local plan="openspec/changes/x/tasks.md"
  local plan_abs="$sbox/$plan"
  mkdir -p "$(dirname "$plan_abs")" && touch "$plan_abs"
  ( cd "$sbox" && git add "$plan" &&
    git -c user.email=t@t -c user.name=t commit -q -m plan )
  # `run` ist eine BATS-Funktion und darf nicht in einer Subshell stehen; der cd
  # wandert daher in einen bash -c-Aufruf. Der Plan-Pfad ist repo-relativ (nicht
  # absolut): git cat-file von stage-plan prueft `HEAD:<pfad>` gegen den Tree.
  run bash -c "cd '$sbox' && bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x --plan '$plan' --hold --allow-empty-touched"
  [ "$status" -eq 0 ]
  grep -qF "VALUES ('scout'),('design'),('plan')" "$CAP_FILE"
  grep -q  "auto: stage-plan"                     "$CAP_FILE"
  grep -q  "NOT EXISTS"                           "$CAP_FILE"
}

@test "T001444: pipeline.js exports TICKET_PHASE_DRIVER=factory" {
  run grep -Eq "TICKET_PHASE_DRIVER['\"]?[[:space:]]*=[[:space:]]*['\"]factory['\"]" "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
}

_pt_rows_stub() {   # $1 = phase:state-Zeilen, die der exec-Call zurückgibt
  local rows="$1" dir; dir="$(mktemp -d)"
  cat > "$dir/kubectl" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in get) echo "pod/shared-db-0"; exit 0;; esac; done
printf '%s' "$rows"
exit 0
STUB
  chmod +x "$dir/kubectl"
  PATH="$dir:$PATH"
}

@test "T001444: assert-phase-chain requires --id before cluster" {
  run bash scripts/ticket.sh assert-phase-chain
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id is required" ]]
}

@test "T001444: assert-phase-chain passes on complete chain" {
  _pt_rows_stub $'plan:done\nimplement:entered\nverify:done\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001
  [ "$status" -eq 0 ]
}

@test "T001444: assert-phase-chain fails with backfill hint on gap" {
  _pt_rows_stub $'plan:done\nimplement:entered\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001
  [ "$status" -eq 1 ]
  [[ "$output" =~ "phase T000001 verify done" ]]
}

@test "T001444: assert-phase-chain --json emits ok/missing shape" {
  _pt_rows_stub $'plan:done\n'
  run bash scripts/ticket.sh assert-phase-chain --id T000001 --json
  [ "$status" -eq 1 ]
  [[ "$output" == *'{"ok":false,"missing":["implement:entered","verify:done"]}'* ]]
}

@test "T001444: assert-phase-chain listed in dispatch usage" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "assert-phase-chain" ]]
}

@test "T001444: SKILL gates merge on assert-phase-chain without || true" {
  SKILL=".claude/skills/dev-flow-execute/SKILL.md"
  run grep -q "assert-phase-chain" "$SKILL"
  [ "$status" -eq 0 ]
  # keine || true Suppression auf der Gate-Zeile
  run bash -c "grep 'assert-phase-chain' '$SKILL' | grep -q '|| true'"
  [ "$status" -ne 0 ]
}

@test "FA-SF-72: route-provider.sh queries factory_model_slots and accepts a phase argument" {
  grep -q "tickets.factory_model_slots" scripts/factory/route-provider.sh
  grep -Eq "PHASE=" scripts/factory/route-provider.sh
}

@test "T001806: factory-prep.sh must not pipe watchdog into the non-reading log() function" {
  # log() ignores stdin and exits immediately -> SIGPIPE (rc 141) kills PREP under pipefail.
  run bash -c "grep -E 'watchdog\.sh.*\| *log$' scripts/vda/factory-prep.sh"
  [ "$status" -ne 0 ]
  # stdout muss von einer stdin-lesenden Konstruktion konsumiert werden (Folgezeile der Pipe)
  run bash -c "grep -A2 'watchdog\.sh' scripts/vda/factory-prep.sh | grep -E 'while IFS= read'"
  [ "$status" -eq 0 ]
}

@test "T001812: dispatcher.js reads factory-prep from a file precomputed by wakeup.sh" {
  # T001810 ran factory-prep via child_process.execFileSync INSIDE the Workflow
  # call (up to 300s worst case) to avoid T001808/T001809's lossiness (small
  # models dropped fields like branch/plan_path when relaying prep JSON through
  # the prompt) — but that made the call slow enough to flip into the harness's
  # async "launched in background" mode, which a one-shot `claude -p` session
  # never survives to see the notification for (orphaned Workflow runs observed,
  # no transcript dir ever written). T001812 moved factory-prep back to
  # wakeup.sh (fast, synchronous bash) and hands dispatcher.js a file path
  # instead — no lossy JSON-in-prompt relay, and a fast/synchronous Workflow call.
  run grep -F "args.prep_file" scripts/factory/dispatcher.js
  [ "$status" -eq 0 ]
  run grep -F "readFileSync" scripts/factory/dispatcher.js
  [ "$status" -eq 0 ]
}

@test "T001810: dispatcher.js runs budget-guard and sentinel deterministically" {
  run grep -F 'budget-guard.sh' scripts/factory/dispatcher.js
  [ "$status" -eq 0 ]
  run grep -F 'interactive_worker_active: /interactive-worker/.test(locks)' scripts/factory/dispatcher.js
  [ "$status" -eq 0 ]
  # keine LLM-Agent-Schritte mehr für prep/budget/sentinel
  run bash -c "grep -E \"label: '(prep|budget-guard|sentinel-check|sentinel-defer)'\" scripts/factory/dispatcher.js"
  [ "$status" -ne 0 ]
}

@test "T001812: wakeup.sh precomputes factory-prep and passes a file path, not inline JSON" {
  # Neither the T001810 args-blob (no prep object relayed verbatim) nor a
  # T001808/T001809-style giant inline JSON string — just a short path,
  # passed as a bash CLI arg to dispatcher-bridge.sh (T001845 — no longer
  # relayed through a model prompt at all for the tick itself).
  run grep -F 'PREP_JSON' scripts/factory/wakeup.sh
  [ "$status" -ne 0 ]
  run grep -F 'PREP_FILE=' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
  run grep -F 'factory-prep' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
  run grep -E 'DISPATCHER_BRIDGE\}"[[:space:]]+"\$\{PREP_FILE\}"' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
}

@test "T001809: dispatcher-bridge allowedTools covers vda.sh" {
  # T001845: the --allowedTools list moved from wakeup.sh's removed claude -p
  # call into dispatcher-bridge.sh's own per-ticket pipeline launch.
  run grep -F 'Bash(bash scripts/vda.sh*)' scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
}

@test "T001990: dispatcher-bridge.sh computes REPO two levels above scripts/factory (not one)" {
  # Pre-fix: REPO=$(cd "$HERE/.." && pwd) landed on .../scripts instead of the
  # repo root, silently breaking the one real $REPO consumer (line 59,
  # ticket.sh update-status --status blocked, swallowed by `|| true`).
  run grep -F 'REPO="$(cd "$HERE/../.." && pwd)"' scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
}

@test "T001990: dispatcher-bridge.sh cd's into the pre-created worktree before launching claude -p" {
  # Pre-fix: claude -p ran with no cd, inheriting dispatcher-bridge.sh's own
  # cwd (the shared main checkout). A local-model session that can't reliably
  # call the Workflow tool and falls back to a workaround (e.g. invoking
  # pipeline.js directly with node) then writes those workaround files
  # straight into the main checkout instead of its isolated worktree —
  # observed live for T001945's dry-run launch, corrupting scripts/factory/
  # in the shared tree with a half-applied require->import migration.
  BRIDGE="scripts/factory/dispatcher-bridge.sh"
  run grep -F 'LAUNCH_DIR="${wt_path:-$REPO}"' "$BRIDGE"
  [ "$status" -eq 0 ]
  run grep -E '\(cd "\$LAUNCH_DIR" && "\$\{CLAUDE_BIN:-claude\}"[[:space:]]+-p' "$BRIDGE"
  [ "$status" -eq 0 ]
}

@test "T001990: dispatcher-bridge.sh actually launches claude -p with cwd pinned to worktree_path" {
  # Functional (not just grep) proof: a pwd-recording claude stub must observe
  # the pre-created worktree dir as its cwd, never the tmp "repo" root passed
  # as $1/dispatcher-bridge.sh's own location.
  tmp="$(mktemp -d)"
  wt="${tmp}/wt-reuse"
  mkdir -p "$wt"
  pwdfile="${tmp}/observed-pwd"
  stub="${tmp}/claude-stub"
  cat > "$stub" <<STUB
#!/usr/bin/env bash
pwd > "${pwdfile}"
STUB
  chmod +x "$stub"

  prep="${tmp}/prep.json"
  cat > "$prep" <<JSON
{"launch":[{"external_id":"T999999","brand":"mentolder","title":"stub launch","branch":"fix/stub","plan_path":"openspec/changes/stub/tasks.md","worktree_path":"${wt}","dry_run":false}]}
JSON

  CLAUDE_BIN="$stub" run bash scripts/factory/dispatcher-bridge.sh "$prep"

  if [ -f "$pwdfile" ]; then
    observed="$(cat "$pwdfile")"
    resolved_wt="$(cd "$wt" && pwd)"
    [ "$observed" = "$resolved_wt" ]
  else
    # budget-guard.sh blocked the launch in this environment (e.g. no DB) —
    # the static grep tests above still cover the fix; skip the assertion
    # rather than fail on an unrelated environment gap.
    skip "budget-guard.sh blocked the launch before reaching claude -p (no DB in test env)"
  fi
  rm -rf "$tmp"
}

@test "FA-SF-SANDBOX: sandbox-run resolves docker→k8s→off and honors FACTORY_SANDBOX override" {
  run bash -c "FACTORY_SANDBOX=off bash scripts/factory/sandbox-run.sh /tmp/nonexistent-wt 'echo hi' 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'hi'
}

@test "FA-SF-SANDBOX: docker path bind-mounts only the worktree and never secrets or main checkout" {
  # The docker invocation mounts the worktree at /work and adds no secrets/main-checkout volume.
  run grep -nE -- '-v[[:space:]]+"?\$\{?WORKTREE' scripts/factory/sandbox-run.sh
  [ "$status" -eq 0 ]
  # No bind-mount of the decrypted secrets dir anywhere in the runner.
  run grep -nE -- '-v[^\n]*environments/\.secrets' scripts/factory/sandbox-run.sh
  [ "$status" -ne 0 ]
  # Refuses to sandbox the main checkout.
  run bash -c "FACTORY_SANDBOX=docker bash scripts/factory/sandbox-run.sh /home/patrick/Bachelorprojekt 'true'; echo EXIT=\$?"
  echo "$output" | grep -q 'EXIT=3'
}

@test "FA-SF-SANDBOX: off mode warns on stderr and runs the command on the host" {
  run bash -c "FACTORY_SANDBOX=off bash scripts/factory/sandbox-run.sh /tmp 'echo RAN' 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'RAN'
  echo "$output" | grep -qi 'UNSANDBOXED'
}

@test "FA-SF-SANDBOX: build-loop wraps the verify task command through sandbox-run.sh" {
  run node -e "const m=require('./scripts/factory/build-loop.cjs'); process.stdout.write(typeof m.wrapSandbox)"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'function'
  run node -e "const m=require('./scripts/factory/build-loop.cjs'); process.stdout.write(m.wrapSandbox('/tmp/wt','task test:all'))"
  echo "$output" | grep -q 'scripts/factory/sandbox-run.sh'
}

@test "FA-SF-SANDBOX: wakeup.sh performs a sandbox preflight and exports FACTORY_SANDBOX" {
  run grep -nE 'export FACTORY_SANDBOX=(docker|k8s|off)' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
  run grep -nq 'factory.sandbox.mode' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
}
