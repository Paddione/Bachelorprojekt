#!/usr/bin/env bats
# tests/spec/brain-quality-goals.bats
# SSOT: openspec/specs/brain-foundation.md (Delta: openspec/changes/brain-quality-goals, T001608)
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/scripts/brain-bootstrap.sh"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  TPL="$REPO_ROOT/templates/brain"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

# --- G-BRAIN01: Alias- und Anker-Wikilinks werden gelintet ------------------

@test "G-BRAIN01: dead alias wikilink [[ghost|Text]] fails lint-wikilinks" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost|Text]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "G-BRAIN01: dead anchor wikilink [[ghost#abschnitt]] fails lint-wikilinks" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost#abschnitt]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "G-BRAIN01: alias and anchor links to existing pages pass" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b|Alias]] und [[b#sektion]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -eq 0 ]
}

# --- G-BRAIN04 (Wikilinks): Sammel-Diagnose über alle Dateien ---------------

@test "G-BRAIN04: lint-wikilinks lists every dead link across files before exiting" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost-eins]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost-zwei|Alias]]\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"[[ghost-eins]]"* ]]
  [[ "$output" == *"[[ghost-zwei]]"* ]]
}

# --- G-BRAIN02: tags muss nicht-leere Liste sein ----------------------------

@test "G-BRAIN02: empty tags list is rejected by lint-frontmatter" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: []\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"tags must be a non-empty list"* ]]
}

@test "G-BRAIN02: bare tags line without values is rejected" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags:\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"tags must be a non-empty list"* ]]
}

# --- G-BRAIN03: Scope wiki/ + Hubs; raw/ und README.md exempt ---------------

@test "G-BRAIN03: raw/ files without frontmatter pass lint-frontmatter" {
  mkdir -p "$WORK/w/raw" "$WORK/w/wiki"
  printf -- 'rohes fragment ohne frontmatter\n' > "$WORK/w/raw/dump.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "G-BRAIN03: README.md without frontmatter passes lint-frontmatter" {
  mkdir -p "$WORK/w/wiki"
  printf -- '# Landing ohne Frontmatter\n' > "$WORK/w/README.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "G-BRAIN03: hub page index.md stays in lint scope" {
  mkdir -p "$WORK/w/wiki"
  printf -- 'kein frontmatter\n' > "$WORK/w/index.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"index.md"* ]]
}

# --- G-BRAIN04 (Frontmatter): Diagnose statt Crash, Weiterprüfung -----------

@test "G-BRAIN04: invalid enum yields FAIL line and later files are still checked" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: Note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: bogus\n---\nbody\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"invalid type: Note"* ]]
  [[ "$output" == *"invalid status: bogus"* ]]
}

# --- G-BRAIN05/06: build-site.yml lint-gekoppelt, ohne raw/ -----------------

@test "G-BRAIN05: build-site.yml runs both linters in a lint job gating the build" {
  wf="$TPL/.github/workflows/build-site.yml"
  grep -q 'lint-wikilinks.sh' "$wf"
  grep -q 'lint-frontmatter.sh' "$wf"
  grep -qE 'needs:[[:space:]]*lint' "$wf"
}

@test "G-BRAIN06: build-site.yml stages no raw/ directory" {
  run grep -w 'raw' "$TPL/.github/workflows/build-site.yml"
  [ "$status" -ne 0 ]
}

# --- Seed-Vollständigkeit + Selbst-Konformität ------------------------------

@test "seed ships the five doc pages plus README, linked from both hubs" {
  for p in quality-goals usage cheatsheet first-aid llm-workflows; do
    [ -f "$TPL/wiki/$p.md" ]
    grep -q "$p" "$TPL/index.md"
    grep -q "$p" "$TPL/wiki/index-moc.md"
  done
  [ -f "$TPL/README.md" ]
}

@test "quality-goals page lists all eleven goals with baseline date" {
  qg="$TPL/wiki/quality-goals.md"
  for i in 01 02 03 04 05 06 07 08 09 10 11; do grep -q "G-BRAIN$i" "$qg"; done
  grep -q '2026-07-03' "$qg"
  grep -q 'type: decision' "$qg"
}

@test "llm-workflows ships at least five prompt templates incl. OpenSpec-SSOT-Sync" {
  n="$(grep -c '^### Prompt' "$TPL/wiki/llm-workflows.md")"
  [ "$n" -ge 5 ]
  grep -qi 'openspec' "$TPL/wiki/llm-workflows.md"
}

@test "self-conformity: full seed passes both repaired linters" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$LINT_FM" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$LINT_WL" "$WORK/brain"; [ "$status" -eq 0 ]
}
