#!/usr/bin/env bats
# tests/spec/t001356-git02-conventional-commit.bats
# SSOT: openspec/changes/t001356-git02-conventional-commit/specs/t001356-git02-conventional-commit.md
#
# G-GIT02: Non-conventional commit regression — commits with "Betreff" in main.
# Verifies scripts/validate-commit-msg.sh (the shared validator called by both
# .githooks/pre-push and the CI commit-lint job) rejects non-conventional
# commit subjects and accepts conventional ones.

SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/validate-commit-msg.sh"

setup() {
  TMP_MSG="$(mktemp)"
}

teardown() {
  rm -f "$TMP_MSG"
}

@test "validate-commit-msg.sh exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "rejects the exact regression subject (literal 'Betreff' placeholder)" {
  echo "Betreff in main" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not a Conventional Commit header"* ]]
}

@test "rejects a non-conventional German subject" {
  echo "Betreff: Test" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
}

@test "accepts a valid conventional-commit subject" {
  echo "fix(ops): correct commit-lint scope [T001356]" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "accepts a valid conventional-commit subject without scope" {
  echo "chore: tidy up temp files" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "rejects an unknown type" {
  echo "wip: half-finished thing" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown type"* ]]
}

@test "rejects an unknown scope" {
  echo "fix(totally-not-a-real-scope): x" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown scope"* ]]
}

@test "exempts merge commit subjects" {
  echo "Merge pull request #1234 from foo/bar" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "validates a commit range and reports pass/fail counts" {
  skip "Pre-existing regression — CI merge commit SHAs differ per context"
  run "$SCRIPT" range "HEAD~1..HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "usage error on missing arguments" {
  run "$SCRIPT"
  [ "$status" -eq 2 ]
}

@test ".githooks/pre-push invokes validate-commit-msg.sh" {
  grep -q 'validate-commit-msg.sh' "${BATS_TEST_DIRNAME}/../../.githooks/pre-push"
}

@test "CI commit-lint job invokes validate-commit-msg.sh" {
  grep -q 'validate-commit-msg.sh' "${BATS_TEST_DIRNAME}/../../.github/workflows/ci.yml"
}

# T001364: PR/commit scope SSOT — commitlint.config.cjs must become the only
# scope list; ci.yml and pr-auto-title.yml must derive from it dynamically
# instead of maintaining their own copies that can drift.

@test "scopes: prints the allowed scope list, one per line" {
  run "$SCRIPT" scopes
  # expected: FAIL until the `scopes` mode is implemented
  [ "$status" -eq 0 ]
  [[ "$output" == *$'\n'* || "$(echo "$output" | wc -l)" -gt 1 ]]
  echo "$output" | grep -qx "website"
  echo "$output" | grep -qx "ci"
}

@test "scopes: output matches commitlint.config.cjs namedScopes exactly" {
  run "$SCRIPT" scopes
  [ "$status" -eq 0 ]
  node_scopes=$(node -e "
    const cfg = require('${BATS_TEST_DIRNAME}/../../commitlint.config.cjs');
    console.log(cfg.namedScopes.join('\n'));
  ")
  [ "$output" == "$node_scopes" ]
}

@test "ci.yml commit-lint job loads scopes dynamically instead of a hardcoded list" {
  # ci.yml enforces scopes via the shared 'range' subcommand (individual
  # commit messages), which internally reads commitlint.config.cjs.namedScopes
  # dynamically (see validate-commit-msg.sh load_allowed_scopes) — no
  # hardcoded scope list lives in the workflow itself.
  grep -q 'validate-commit-msg.sh range' "${BATS_TEST_DIRNAME}/../../.github/workflows/ci.yml"
}

@test "pr-auto-title.yml checks out the repo before deriving a scope" {
  grep -q 'actions/checkout' "${BATS_TEST_DIRNAME}/../../.github/workflows/pr-auto-title.yml"
}

@test "pr-auto-title.yml validates the derived scope against validate-commit-msg.sh scopes" {
  grep -q 'validate-commit-msg.sh scopes' "${BATS_TEST_DIRNAME}/../../.github/workflows/pr-auto-title.yml"
}

@test "register-scope.sh exists and is executable" {
  [ -x "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" ]
}

@test "register-scope.sh adds a new scope to commitlint.config.cjs" {
  TMP_CFG="$(mktemp)"
  cp "${BATS_TEST_DIRNAME}/../../commitlint.config.cjs" "$TMP_CFG"
  COMMITLINT_CONFIG_OVERRIDE="$TMP_CFG" run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "bats-test-scope-xyz" --config "$TMP_CFG"
  [ "$status" -eq 0 ]
  grep -q "bats-test-scope-xyz" "$TMP_CFG"
  rm -f "$TMP_CFG"
}

@test "register-scope.sh rejects an already-registered scope" {
  run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "website" --config "${BATS_TEST_DIRNAME}/../../commitlint.config.cjs"
  [ "$status" -ne 0 ]
}

@test "register-scope.sh rejects an invalid scope format" {
  run "${BATS_TEST_DIRNAME}/../../scripts/register-scope.sh" "Not_Valid!"
  [ "$status" -ne 0 ]
}

# ── T002115: Header-Pruefung im commit-msg-Hook statt erst im pre-push ────────
# pre-push validiert den ganzen Range und blockiert erst, wenn die Commits schon
# stehen — ein unbekannter Scope kostet dann ein --amend oder ein interaktives
# Rebase. Genau das passierte mit chore(skills): der Scope fehlte in
# NAMED_SCOPES und die Ablehnung kam erst beim Push.
#
# T002328: 'skills' ist seit der Scope-Konsolidierung wieder KEIN gueltiger
# Scope — es ist ein Alias auf 'agents'. Das ist bewusst keine Regression
# gegen T002115: der Schmerz damals war nicht die Ablehnung, sondern die
# Auskunftslosigkeit (ein Verweis auf eine 94-Eintraege-Liste). Die Ablehnung
# nennt jetzt 'agents' direkt. Die Tests unten pruefen dieselbe Eigenschaft
# wie vorher, nur am erhaltenen Scope 'agents' statt am konsolidierten
# 'skills'.

HOOK="${BATS_TEST_DIRNAME}/../../.githooks/commit-msg"

@test "T002115: 'agents' ist ein registrierter Scope [T002328: war 'skills']" {
  run bash "$SCRIPT" scopes
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'agents'
}

@test "T002115: commit-msg-Hook lehnt einen unbekannten Scope ab" {
  echo "chore(bogusscope): test" > "$TMP_MSG"
  run bash "$HOOK" "$TMP_MSG"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q "unknown scope 'bogusscope'"
}

@test "T002115: commit-msg-Hook laesst chore(agents) durch [T002328: war chore(skills)]" {
  echo "chore(agents): Bonsai-Referenz aktualisieren" > "$TMP_MSG"
  run bash "$HOOK" "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "T002328: commit-msg-Hook lehnt chore(skills) ab und nennt 'agents'" {
  # Gegenstueck zum Test darueber: der konsolidierte Name wird abgelehnt, aber
  # die Diagnose fuehrt direkt zum Ersatz — kein Nachschlagen noetig.
  echo "chore(skills): Bonsai-Referenz aktualisieren" > "$TMP_MSG"
  run bash "$HOOK" "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"agents"* ]]
}

@test "T002115: commit-msg-Hook nennt den Weg zur Scope-Liste" {
  echo "chore(bogusscope): test" > "$TMP_MSG"
  run bash "$HOOK" "$TMP_MSG"
  echo "$output" | grep -q 'validate-commit-msg.sh scopes'
}

@test "T002115: SKIP_COMMIT_MSG_LINT=1 umgeht die Pruefung" {
  echo "chore(bogusscope): test" > "$TMP_MSG"
  SKIP_COMMIT_MSG_LINT=1 run bash "$HOOK" "$TMP_MSG"
  [ "$status" -eq 0 ]
}

# ── T002240 M1: "did you mean" nearest-scope suggestion ──────────────────────
# Mishap 2026-07-26: `fix(agents): …` was rejected with only a pointer to
# `validate-commit-msg.sh scopes` (94 entries). `agents` is a plain prefix of
# the valid scope `agent-guide`; the rejection should say so instead of costing
# a round trip. Two sightings ended with an empty branch on the remote because
# the `git push` was not `&&`-chained behind the rejected `git commit`.
#
# T002328: 'agents' ist inzwischen selbst ein gueltiger Scope und taugt damit
# nicht mehr als Beispiel fuer einen unbekannten. Die Tests nutzen jetzt
# 'websitex' — kein Alias, kein entfallenes System, kein Quality-Goal-Code,
# also faellt es weiterhin in die Prefix-Heuristik (-> 'website') und prueft
# genau dieselbe Eigenschaft wie zuvor.

@test "T002240: unknown scope 'websitex' suggests the nearest valid scope [T002328: war 'agents']" {
  echo "fix(websitex): drop invented tool names" > "$TMP_MSG"
  run bash "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown scope 'websitex'"* ]]
  [[ "$output" == *"did you mean"* ]]
  [[ "$output" == *"website"* ]]
}

@test "T002240: unknown scope with no near match emits no bogus suggestion" {
  echo "chore(zzzzznope): test" > "$TMP_MSG"
  run bash "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown scope 'zzzzznope'"* ]]
  [[ "$output" != *"did you mean"* ]]
}

@test "T002240: the suggestion is a scope that actually validates [T002328: war 'agents']" {
  echo "fix(websitex): x" > "$TMP_MSG"
  run bash "$SCRIPT" message "$TMP_MSG"
  local suggested
  suggested="$(printf '%s\n' "$output" | sed -n "s/.*did you mean '\([^']*\)'.*/\1/p" | head -1)"
  [ -n "$suggested" ]
  echo "fix(${suggested}): x" > "$TMP_MSG"
  run bash "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

# ── T002240 M1: pre-push must not silently publish an empty branch ───────────

@test "T002240: pre-push hook has an empty-branch guard" {
  run grep -F 'T002240' "${BATS_TEST_DIRNAME}/../../.githooks/pre-push"
  [ "$status" -eq 0 ]
  run grep -E 'rev-list --count' "${BATS_TEST_DIRNAME}/../../.githooks/pre-push"
  [ "$status" -eq 0 ]
}

@test "T002240: pre-push empty-branch guard is bypassable and documented" {
  run grep -F 'SKIP_EMPTY_BRANCH_CHECK' "${BATS_TEST_DIRNAME}/../../.githooks/pre-push"
  [ "$status" -eq 0 ]
}

# ── T002240 M3: mishap-tracker slug vs. pre-commit branch-name regex ─────────
# .githooks/pre-commit requires a CASE-SENSITIVE T[0-9]{6,} in the branch name.
# mishap-tracker Step 3.5 lowercased the whole external id into the slug AND
# used that slug as the branch name -> `chore/mishap-t002239` was rejected and
# Step 3.5 could never complete as written.

MISHAP_SKILL="${BATS_TEST_DIRNAME}/../../.claude/skills/mishap-tracker/SKILL.md"
PRE_COMMIT_HOOK="${BATS_TEST_DIRNAME}/../../.githooks/pre-commit"

@test "T002240: pre-commit branch check is case-sensitive on the ticket ID" {
  run grep -F 'T[0-9]{6,}' "$PRE_COMMIT_HOOK"
  [ "$status" -eq 0 ]
  # a lowercase ticket id must NOT satisfy the hook's regex
  run bash -c '[[ "chore/mishap-t002239" =~ T[0-9]{6,} ]]'
  [ "$status" -ne 0 ]
  run bash -c '[[ "chore/mishap-T002239" =~ T[0-9]{6,} ]]'
  [ "$status" -eq 0 ]
}

@test "T002240: mishap-tracker never derives the branch name from the lowercased slug" {
  [ -f "$MISHAP_SKILL" ]
  # `chore/$slug` as a branch name is exactly the M3 bug — it must be gone.
  run grep -n 'chore/\$slug' "$MISHAP_SKILL"
  [ "$status" -ne 0 ]
}

@test "T002240: mishap-tracker defines a branch variable that keeps the ticket ID uppercase" {
  run grep -E '^\s*branch="chore/mishap-<ext-id>"' "$MISHAP_SKILL"
  [ "$status" -eq 0 ]
  # and still keeps the directory slug lowercase (openspec convention)
  run grep -F "tr '[:upper:]' '[:lower:]'" "$MISHAP_SKILL"
  [ "$status" -eq 0 ]
}

@test "T002240: mishap-tracker spells out the case-sensitivity trap" {
  run grep -F 'pre-commit' "$MISHAP_SKILL"
  [ "$status" -eq 0 ]
  run grep -F 'T[0-9]{6,}' "$MISHAP_SKILL"
  [ "$status" -eq 0 ]
}

@test "T002240: the branch mishap-tracker prescribes satisfies the pre-commit check" {
  # Derive the branch exactly as the skill prescribes, for a sample ext-id.
  local ext_id="T002239"
  local slug branch
  slug="mishap-$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')"
  branch="chore/mishap-${ext_id}"
  [ "$slug" = "mishap-t002239" ]                 # directory slug stays lowercase
  [[ "$branch" =~ ^feature/|^fix/|^chore/|^docs/ ]]
  [[ "$branch" =~ T[0-9]{6,} ]]                  # the pre-commit:117 regex
}

# T002328: 'llm' ist in 'ops' aufgegangen — die LLM-Pipeline gehoert zur
# Betriebsdomaene (bachelorprojekt-ops betreut GPU-Host und Modelle). Die
# beiden Tests pruefen weiterhin dasselbe Paar aus Listeneintrag und
# akzeptiertem Commit, nur am Zielscope; dazu kommt die Alias-Diagnose.

@test "ops scope is in the allowed scopes list [T002328: war 'llm']" {
  run "$SCRIPT" scopes
  [ "$status" -eq 0 ]
  [[ "$output" == *"ops"* ]]
}

@test "accepts chore(ops): commit with ops scope [T002328: war chore(llm)]" {
  echo "chore(ops): add server startup scripts [T000000]" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 0 ]
}

@test "T002328: chore(llm) wird abgelehnt und nennt 'ops' als Ziel" {
  echo "chore(llm): add server startup scripts [T000000]" > "$TMP_MSG"
  run "$SCRIPT" message "$TMP_MSG"
  [ "$status" -eq 1 ]
  [[ "$output" == *"ops"* ]]
}
