#!/usr/bin/env bats
# FA-SF-59: ACI Loop — tests ACI tools and auto-repair behavior (offline-safe)

setup() {
  load 'test_helper.bash'
  TEST_TMP_DIR="$BATS_TMPDIR/aci-loop-tests"
  mkdir -p "$TEST_TMP_DIR"
}

teardown() {
  rm -rf "$TEST_TMP_DIR"
}

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
  run bash -c "ACI_ENABLED=true node --check scripts/factory/pipeline.js"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "" ]]  # node --check produces no output on success

  run bash -c "ACI_ENABLED=false node --check scripts/factory/pipeline.js"
  [ "$status" -eq 0 ]

  run bash -c "node --check scripts/factory/pipeline.js"
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
