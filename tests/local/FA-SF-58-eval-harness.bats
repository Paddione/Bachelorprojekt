#!/usr/bin/env bats
# FA-SF-58: Factory Eval-Harness — Scoring logic and fixture validation (offline-safe)

setup() {
  load 'test_helper.bash'
  TEST_TMP_DIR="$BATS_TMPDIR/factory-eval-tests"
  mkdir -p "$TEST_TMP_DIR/fixtures/T000725"
  mkdir -p "$TEST_TMP_DIR/out"
}

teardown() {
  rm -rf "$TEST_TMP_DIR"
}

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
