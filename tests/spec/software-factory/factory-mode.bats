#!/usr/bin/env bats
# tests/spec/software-factory/factory-mode.bats
# T900210 Schritt 0 RED: FACTORY_EXECUTOR-Default + FACTORY_MODE-Routing.
# SSOT: openspec/changes/factory-muse-spark-qwen-moe/specs/software-factory.md
#   (REQ-SF-EXECUTOR-001 MODIFIED, REQ-SF-EXECUTOR-003/004 ADDED)
#
# Pruefmodus: Output-Verifikation — resolve_executor() wird AUSGEFUEHRT
# (STDOUT = Gewinner, STDERR = Warnung), kein reines Source-Grep.
# Die Default-Zeilen (FACTORY_EXECUTOR:-opencode, FACTORY_MODE:-mixed) sind
# Konfiguration und werden zusaetzlich per Grep verankert — mit Positiv-Anker
# (funktionaler Resolve-Aufruf im selben Test), damit der Test bei fehlender
# Funktion nicht vakuos besteht (T002356-M1).
#
# Erwartete Semantik (tasks.md Schritt 3.2):
#   local            -> opencode (ausser dsh: Harness bleibt dsh)
#   api              -> uebergebenen Executor (claude-Pfad bleibt)
#   mixed (Default)  -> opencode, ausser explizit claude
#   unbekannter Mode -> Warnung auf stderr + mixed-Verhalten (F2)

REPO_ROOT_HELPER() {
  cd "$BATS_TEST_DIRNAME/../../.." && pwd
}

# Extrahiert resolve_executor() aus dispatcher-bridge.sh in eine temp-Datei
# und sourct sie. Fehlt die Funktion (Vor-Fix-Stand), return 127 -> Test rot.
_load_resolve() {
  local repo bridge fn_tmp
  repo="$(REPO_ROOT_HELPER)"
  bridge="$repo/scripts/factory/dispatcher-bridge.sh"
  fn_tmp="$(mktemp)"
  sed -n '/^resolve_executor[[:space:]]*(/,/^}/p' "$bridge" > "$fn_tmp"
  if [[ ! -s "$fn_tmp" ]]; then
    echo "resolve_executor missing in dispatcher-bridge.sh" >&2
    rm -f "$fn_tmp"
    return 127
  fi
  # shellcheck source=/dev/null
  source "$fn_tmp"
  rm -f "$fn_tmp"
}

@test "FACTORY_EXECUTOR unset resolves to opencode (default flip)" {
  local repo bridge
  repo="$(REPO_ROOT_HELPER)"
  bridge="$repo/scripts/factory/dispatcher-bridge.sh"
  # Konfigurations-Anker: Default muss opencode sein (heute: claude -> rot).
  grep -q 'FACTORY_EXECUTOR:-opencode' "$bridge"
  # Positiv-Anker + Semantik: mixed + opencode -> opencode.
  _load_resolve
  run resolve_executor "mixed" "opencode"
  [ "$status" -eq 0 ]
  [ "$output" = "opencode" ]
}

@test "FACTORY_MODE unset defaults to mixed" {
  local repo bridge
  repo="$(REPO_ROOT_HELPER)"
  bridge="$repo/scripts/factory/dispatcher-bridge.sh"
  # Konfigurations-Anker: MODE-Default muss mixed sein (heute: keine Variable -> rot).
  grep -q 'FACTORY_MODE:-mixed' "$bridge"
  # Positiv-Anker: mixed + opencode -> opencode (deterministisch).
  _load_resolve
  run resolve_executor "mixed" "opencode"
  [ "$status" -eq 0 ]
  [ "$output" = "opencode" ]
}

@test "FACTORY_MODE=bogus falls back to mixed with warning on stderr" {
  _load_resolve
  # STDOUT muss mixed-Verhalten zeigen (bogus+opencode -> opencode; stderr abgetrennt).
  run bash -c 'source <(sed -n "/^resolve_executor[[:space:]]*(/,/^}/p" "$1") && resolve_executor "bogus" "opencode" 2>/dev/null' _ "$(REPO_ROOT_HELPER)/scripts/factory/dispatcher-bridge.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "opencode" ]
  # STDERR muss die Warnung tragen (unbekannter Wert genannt).
  run bash -c 'source <(sed -n "/^resolve_executor[[:space:]]*(/,/^}/p" "$1") && resolve_executor "bogus" "opencode" 2>&1 1>/dev/null' _ "$(REPO_ROOT_HELPER)/scripts/factory/dispatcher-bridge.sh"
  [[ "$output" == *"bogus"* ]]
}

@test "routing matrix local/api/mixed x claude/opencode/dsh picks expected winner" {
  _load_resolve
  local out
  # local forces opencode (ausser dsh)
  out="$(resolve_executor "local" "opencode")"; [ "$out" = "opencode" ]
  out="$(resolve_executor "local" "claude")"; [ "$out" = "opencode" ]
  out="$(resolve_executor "local" "dsh")"; [ "$out" = "dsh" ]
  # api passes executor through (claude-Pfad bleibt)
  out="$(resolve_executor "api" "opencode")"; [ "$out" = "opencode" ]
  out="$(resolve_executor "api" "claude")"; [ "$out" = "claude" ]
  out="$(resolve_executor "api" "dsh")"; [ "$out" = "dsh" ]
  # mixed: opencode ausser explizit claude
  out="$(resolve_executor "mixed" "opencode")"; [ "$out" = "opencode" ]
  out="$(resolve_executor "mixed" "claude")"; [ "$out" = "claude" ]
  out="$(resolve_executor "mixed" "dsh")"; [ "$out" = "dsh" ]
}
