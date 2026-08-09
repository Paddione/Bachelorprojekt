#!/usr/bin/env bats
# tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002941 (Fix unvollstaendig fuer T002779)
#
# Pruefmodus (T002448-M4): ERGEBNIS-orientiert. Misst die mtime der echten,
# getrackten MCP-Config-Artefakte rund um einen isolierten Lauf des
# generischen Header-Passthrough-Tests in authenticated-http-headers.bats.
#
# Befund: dieser Test kopiert .mcp.json, .opencode/opencode.jsonc und
# scripts/llm/mcp-servers.json per `cp` (ohne -p) in ein Backup, laesst
# `mcp-sync.sh render` auf die ECHTEN Repo-Pfade schreiben und spielt danach
# zurueck. `cp` ohne -p stempelt die mtime neu, auch wenn der Inhalt danach
# wiederhergestellt wird — exakt das Signal, gegen das
# tests/spec/ci-cd/spec-tracked-file-guard.bats prueft. MCP_OUT_DIR wird von
# `mcp-sync.sh render` bereits vollstaendig unterstuetzt (verifiziert:
# OUT_DIR="${MCP_OUT_DIR:-$REPO}", CLAUDE_TARGET/OPENCODE_TARGET/
# LLAMACPP_TARGET haengen alle davon ab) — der Backup/Restore-Umweg ist damit
# unnoetig.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BATS_BIN="$REPO_ROOT/tests/unit/lib/bats-core/bin/bats"
  TARGET_BATS="$REPO_ROOT/tests/spec/mcp-gateway/authenticated-http-headers.bats"
}

_stamp() {
  ( cd "$REPO_ROOT" && stat -c '%n %Y %s' \
      .mcp.json \
      .opencode/opencode.jsonc \
      scripts/llm/mcp-servers.json 2>/dev/null | sort )
}

@test "T002941: generic-header-passthrough test never touches real tracked config mtimes" {
  local before after
  before="$(_stamp)"

  # Positiv-Anker (T002356-M1): der Lauf muss stattfinden und gruen sein,
  # sonst waere die Negativ-Aussage unten (mtime unveraendert) trivial wahr.
  run "$BATS_BIN" --filter "renderers pass headers through for any http client, not just bge-mcp" "$TARGET_BATS"
  echo "$output"
  [ "$status" -eq 0 ]

  after="$(_stamp)"
  [ "$before" = "$after" ]
}
