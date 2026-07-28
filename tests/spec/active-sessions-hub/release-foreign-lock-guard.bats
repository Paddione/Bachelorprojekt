#!/usr/bin/env bats
#
# [T002447] agent-lock: Freigabe eines FREMDEN, LEBENDEN Locks braucht --force.
#
# Der same-tool-Fallback aus T002374 (scripts/agent-lock.sh, cmd_release/cmd_refresh)
# erlaubt die Freigabe, sobald Lock-Inhaber und Aufrufer dieselbe Tool-Klasse melden.
# Im Betrieb reden immer zwei `claude`-Sessions miteinander — der Ownership-Check ist
# damit wirkungslos. Die Ursache, die den Fallback motivierte (SID-Drift pro Bash-Call),
# ist seit T002375-p1 an der Wurzel behoben.
#
# UMGEBUNGSUNABHÄNGIGKEIT: Diese Tests setzen ihre Vorbedingungen über die
# Test-Overrides AGENT_LOCK_SID und AGENT_LOCK_TOOL, statt sie aus ambient
# exportierten Harness-Variablen zu erben. Genau daran scheiterten die vier
# Bestandstests: sie waren in CI grün und in einer Agent-Session rot, weil
# `_detect_tool` auf ambient CLAUDECODE/CLAUDE_CODE_SESSION_ID anspringt und
# ein gesetztes GEMINI_CLI nie erreicht wird.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
}

# Legt einen Lock an, der einer anderen, LEBENDEN Session gehört — bei
# identischer Tool-Klasse. Genau die Konstellation des Regelbetriebs.
_claim_as_foreign_live_session() { # <ticket-id>
  AGENT_LOCK_SID="session-A" AGENT_LOCK_TOOL="claude" \
    bash "$LOCK" claim ticket "$1" --label foreign-session
}

@test "T002447: release ohne --force gibt einen fremden lebenden Lock NICHT frei" {
  # Positiv-Anker zuerst [T002356-M1]: der gültige Fall MUSS durchlaufen, sonst
  # bestünde die Negativ-Aussage unten auch bei komplett kaputtem release.
  AGENT_LOCK_SID="session-own" AGENT_LOCK_TOOL="claude" \
    bash "$LOCK" claim ticket T002447-own --label own-session
  AGENT_LOCK_SID="session-own" AGENT_LOCK_TOOL="claude" \
    run bash "$LOCK" release ticket T002447-own
  [ "$status" -eq 0 ] || { echo "Positiv-Anker gebrochen: eigener Lock nicht freigebbar: $output"; false; }
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002447-own.json" ]

  # Negativ-Aussage: fremde lebende Session, GLEICHE Tool-Klasse.
  _claim_as_foreign_live_session T002447-a
  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
    run bash "$LOCK" release ticket T002447-a
  echo "Exit: $status | Output: $output"
  [ "$status" -eq 1 ] || { echo "fremder lebender Lock wurde ohne --force freigegeben"; false; }
  [ -f "$AGENT_LOCK_DIR/ticket__T002447-a.json" ] || { echo "Lock-Datei wurde entfernt"; false; }
}

@test "T002447: die Verweigerung nennt beide SIDs und den --force-Ausweg" {
  _claim_as_foreign_live_session T002447-b
  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
    run bash "$LOCK" release ticket T002447-b
  [ "$status" -eq 1 ]
  # Auf die Diagnosezeile eingrenzen statt gegen den gesamten Output zu matchen
  # (Worktree-Name kann Suchbegriffe zufällig erfüllen — siehe CLAUDE.md).
  local line
  line="$(printf '%s\n' "$output" | grep '^release:' || true)"
  [ -n "$line" ] || { echo "keine 'release:'-Diagnosezeile: $output"; false; }
  [[ "$line" == *"session-A"* ]] || { echo "Owner-SID fehlt: $line"; false; }
  [[ "$line" == *"session-B"* ]] || { echo "Aufrufer-SID fehlt: $line"; false; }
  [[ "$line" == *"--force"* ]]   || { echo "--force-Hinweis fehlt: $line"; false; }
}

@test "T002447: --force raeumt den fremden lebenden Lock ab" {
  _claim_as_foreign_live_session T002447-c
  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
    run bash "$LOCK" release ticket T002447-c --force
  [ "$status" -eq 0 ] || { echo "--force muss durchlaufen: $output"; false; }
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002447-c.json" ]
}

@test "T002447: ein aufgegebener Lock bleibt ohne --force freigebbar" {
  # Abgrenzung: der Fix darf das Abraeumen TOTER Locks nicht miterschlagen.
  _claim_as_foreign_live_session T002447-d
  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="" \
    run bash "$LOCK" release ticket T002447-d
  [ "$status" -eq 0 ] || { echo "toter Owner: release muss ohne --force gelingen: $output"; false; }
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002447-d.json" ]
}

@test "T002447: refresh verlaengert einen fremden lebenden Lock NICHT" {
  _claim_as_foreign_live_session T002447-e
  local lf="$AGENT_LOCK_DIR/ticket__T002447-e.json"
  local hb_before
  hb_before="$(sed -n 's/.*"heartbeat_at": *"\([^"]*\)".*/\1/p' "$lf" | head -1)"
  [ -n "$hb_before" ] || { echo "kein heartbeat_at im Lock"; false; }

  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
    run bash "$LOCK" refresh ticket T002447-e
  [ "$status" -ne 0 ] || { echo "refresh eines fremden lebenden Locks muss scheitern"; false; }

  local hb_after
  hb_after="$(sed -n 's/.*"heartbeat_at": *"\([^"]*\)".*/\1/p' "$lf" | head -1)"
  [ "$hb_before" = "$hb_after" ] || { echo "heartbeat wurde fremd verlaengert: $hb_before -> $hb_after"; false; }
}

@test "T002447: AGENT_LOCK_TOOL ueberstimmt die ambient Harness-Marker" {
  # Ohne diesen Override laesst sich die Tool-Klasse in einer Agent-Session gar
  # nicht setzen: _detect_tool verzweigt auf 'claude', sobald CLAUDECODE oder
  # CLAUDE_CODE_SESSION_ID gesetzt sind — beides exportiert die Harness ambient.
  CLAUDECODE=1 CLAUDE_CODE_SESSION_ID="ambient-xyz" \
  AGENT_LOCK_SID="session-A" AGENT_LOCK_TOOL="gemini" \
    bash "$LOCK" claim ticket T002447-f --label tool-override
  local tool
  tool="$(sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T002447-f.json" | head -1)"
  [ "$tool" = "gemini" ] || { echo "AGENT_LOCK_TOOL wurde ignoriert, tool=$tool"; false; }
}

@test "T002447: das Urteil ist identisch mit und ohne ambient Harness-Umgebung" {
  # Der eigentliche Regressionsschutz gegen die Fehlerklasse: dieselbe Pruefung
  # darf in CI und in einer Agent-Session nicht auseinanderlaufen.
  _claim_as_foreign_live_session T002447-g
  AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
  CLAUDECODE=1 CLAUDE_CODE_SESSION_ID="ambient-xyz" \
    run bash "$LOCK" release ticket T002447-g
  local with_env="$status"

  _claim_as_foreign_live_session T002447-h
  run env -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID \
    AGENT_LOCK_DIR="$AGENT_LOCK_DIR" \
    AGENT_LOCK_SID="session-B" AGENT_LOCK_TOOL="claude" AGENT_LOCK_FAKE_ALIVE="session-A" \
    bash "$LOCK" release ticket T002447-h
  local without_env="$status"

  [ "$with_env" = "$without_env" ] || {
    echo "Urteil haengt an der Umgebung: mit=$with_env ohne=$without_env"; false; }
  [ "$with_env" -eq 1 ] || { echo "beide Laeufe muessen verweigern, waren aber $with_env"; false; }
}
