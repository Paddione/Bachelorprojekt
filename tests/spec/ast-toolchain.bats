#!/usr/bin/env bats
# tests/spec/ast-toolchain.bats
# T900560-C9: ast-grep project wiring. Static checks only (offline-safe —
# no npx invocation; the scan itself is a manual `task quality:ast`).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "ast-toolchain: sgconfig.yml exists and its ruleDirs resolve" {
  [ -f "$REPO_ROOT/sgconfig.yml" ] || { echo "MISSING sgconfig.yml"; return 1; }
  run python3 -c "
import yaml,os,sys
d = yaml.safe_load(open('$REPO_ROOT/sgconfig.yml'))
dirs = d.get('ruleDirs') or []
assert dirs, 'sgconfig.yml has no ruleDirs'
missing = [x for x in dirs if not os.path.isdir(os.path.join('$REPO_ROOT', x))]
assert not missing, f'ruleDirs missing: {missing}'
print('ruleDirs ok:', dirs)
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "ast-toolchain: every ast-rules file parses and carries id/language/rule" {
  run bash -c "ls '$REPO_ROOT'/ast-rules/*.yml"
  [ "$status" -eq 0 ] || { echo "NO RULES in ast-rules/"; return 1; }
  run python3 -c "
import yaml,glob,sys
files = sorted(glob.glob('$REPO_ROOT/ast-rules/*.yml'))
assert files, 'no rule files'
for f in files:
    d = yaml.safe_load(open(f))
    for k in ('id', 'language', 'rule'):
        assert k in d, f'{f} lacks key: {k}'
print(f'{len(files)} rule(s) ok')
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "ast-toolchain: quality:ast task exists and pins the ast-grep version" {
  grep -qE '^  quality:ast:' "$REPO_ROOT/taskfiles/Taskfile.quality.yml" \
    || { echo "MISSING quality:ast task"; return 1; }
  grep -qE '@ast-grep/cli@[0-9]+\.[0-9]+\.[0-9]+' "$REPO_ROOT/taskfiles/Taskfile.quality.yml" \
    || { echo "UNPINNED @ast-grep/cli version"; return 1; }
}
