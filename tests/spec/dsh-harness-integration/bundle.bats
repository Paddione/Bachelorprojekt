#!/usr/bin/env bats
# tests/spec/dsh-harness-integration/bundle.bats — Bundle manifest, entry autoload, no vendoring.

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

@test "bundle: package.json has dsh.bundle.patch key" {
  run node -e "const p=JSON.parse(require('fs').readFileSync('$REPO/tools/dsh/package.json','utf8')); if(!p.dsh?.bundle?.patch) throw new Error('missing bundle patch key')"
  [ "$status" -eq 0 ]
}

@test "bundle: cordis.patch.yml references cc-hooks" {
  run grep -q 'cc-hooks' "$REPO/tools/dsh/cordis.patch.yml"
  [ "$status" -eq 0 ]
}

@test "bundle: index.js loads without error with empty plugins dir" {
  # Create a temporary empty plugins dir and test the entry.
  local tmpdir
  tmpdir=$(mktemp -d)
  mkdir -p "$tmpdir/plugins"
  cp "$REPO/tools/dsh/index.js" "$tmpdir/"
  run timeout 5 node --input-type=module -e "
    import('$tmpdir/index.js').then(m => { console.log('loaded:', m.name); }).catch(e => { console.error(e); process.exit(1); })
  "
  rm -rf "$tmpdir"
  [ "$status" -eq 0 ]
  [[ "$output" == *"loaded"* ]]
}

@test "bundle: no path under deepseek-harness/ is versioned" {
  # deepseek-harness/ should be gitignored.
  run git -C "$REPO" ls-files 'deepseek-harness/'
  [ -z "$output" ]
}

@test "bundle: tools/dsh/ directory exists with expected files" {
  [ -f "$REPO/tools/dsh/package.json" ]
  [ -f "$REPO/tools/dsh/cordis.patch.yml" ]
  [ -f "$REPO/tools/dsh/index.js" ]
  [ -f "$REPO/tools/dsh/README.md" ]
}
