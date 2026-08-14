#!/usr/bin/env bats
# tests/unit/check-commit-vs-diff-package-drift.bats
#
# [T004611] Erweiterung des T001434-Guards: unbeabsichtigte Modifikationen von
# `.opencode/package.json` + `package-lock.json` in Implementierungs-Commits
# blocken. Beobachtet am 2026-08-14 bei T004295: zwei deepseek-flash-Dispatches
# (p6a/p6b) meldeten leere Returns, hatten aber nebenbei `.opencode/package.json`
# + `package-lock.json` modifiziert (npm install von @opencode-ai/plugin
# 1.18.16→1.18.18) — unbeabsichtigte Modifikation außerhalb des Plans, musste
# revertet werden.
#
# Die Plugin-Versionierung in .opencode/ ist ein bewusstes Dependency-Artefakt
# (T002632: "opencode Plugin-Deps versionieren"). Ein Implementierungs-Commit
# darf es nur dann anfassen, wenn der Titel das Dependency-Update explizit
# deklariert (chore(deps)/fix(plugins)); sonst ist die Änderung Rauschen.
#
# SSOT: scripts/check-commit-vs-diff.sh (T001434-Guard, .githooks/commit-msg).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/check-commit-vs-diff.sh"
  TMP="$(mktemp -d)"
  export TMP
}

teardown() {
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
}

# ── Negativ: Implementierungs-Titel + .opencode/package.json-Rauschen ──────

@test "blocks: fix(infra) mit .opencode/package.json-Rauschen (T004611-Muster)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" || return 1 && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware sequence\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'real code' > src/middleware.ts
  mkdir -p .opencode && printf '{"dependencies":{"@opencode-ai/plugin":"1.18.18"}}' > .opencode/package.json
  git add src/ .opencode/package.json
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
  [[ "$output" == *"package.json"* ]]
}

@test "blocks: fix(infra) mit package-lock.json-Rauschen (T004611-Muster)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" || return 1 && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware sequence\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'real code' > src/middleware.ts
  mkdir -p .opencode && printf '{"lockfileVersion":3}' > .opencode/package-lock.json
  git add src/ .opencode/package-lock.json
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
  [[ "$output" == *"package"* ]]
}

# ── Positiv-Anker: deklariertes Dependency-Update bleibt erlaubt ───────────

@test "allows: chore(deps) mit .opencode/package.json + lock (legitimes Update)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" || return 1 && git init -q && git config user.email t@t && git config user.name t
  printf 'chore(deps): update @opencode-ai/plugin 1.18.16 -> 1.18.18\n' > "$TMP/msg-subject"
  mkdir -p .opencode
  printf '{"dependencies":{"@opencode-ai/plugin":"1.18.18"}}' > .opencode/package.json
  printf '{"lockfileVersion":3}' > .opencode/package-lock.json
  git add .opencode/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: normaler Code-Commit ohne .opencode/ bleibt unberührt" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" || return 1 && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware sequence\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'real code' > src/middleware.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}
