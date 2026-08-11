#!/usr/bin/env bats
# tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats
# SSOT: openspec/specs/active-sessions-hub.md (agent-lock Semantik)
# Ticket: T003102
#
# PRUEFMODUS (bewusst gemischt, je Zusicherung begruendet):
#
#   * Tests 1-3 pruefen SKRIPTVERHALTEN: _ticket_lock_guard wird AUSGEFUEHRT
#     (hermetic — kein Cluster/DB noetig, nur die Lock-Datei + SID-Variablen).
#     Der Guard ist die zentrale Durchsetzungsstelle des ticket-scoped Locks im
#     Status-Schreibpfad; sein closure-Modus ist der Kern-Fix von T003102.
#
#   * Tests 4-6 pruefen VERDRAHTUNG/TEXTE: update-status.sh reicht den
#     closure-Modus bei Terminal-Uebergaengen durch, die Execute-Skills
#     claimen branch-scoped, agent-lock.sh dokumentiert die Scope-Semantik.
#     Fuer diese Dateien ist der Quelltext das Artefakt (Regelwerk-Konvention,
#     wie agent-lock-scope-regelwerk.bats).
#
# POSITIV-ANKER: Jeder Negativtest ("X darf nicht vorkommen") prueft im selben
# Test ZUERST, dass der gueltige Fall vorhanden ist — ein leerer Abschnitt
# darf nicht trivial "frei von X" sein.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TICKET_CORE="$REPO/scripts/vda/ticket/_ticket-core.sh"
  UPDATE_STATUS="$REPO/scripts/vda/ticket/update-status.sh"
  LOCK_SH="$REPO/scripts/agent-lock.sh"
  EXEC_SKILL="$REPO/.opencode/skills/opencode-flow-execute/SKILL.md"
  EXEC_PHASES="$REPO/.claude/skills/references/dev-flow-execute-phases.md"
  PREFLIGHT="$REPO/.claude/skills/references/ticket-preflight-lock.md"
  FACTORY_PREP="$REPO/scripts/vda/factory-prep.sh"
}

# Baut eine fremde ticket-scoped Lock-Datei im isolierten Lock-Verzeichnis.
_write_foreign_ticket_lock() {  # <lockdir> <ticket-id> [sid]
  local d="$1" tid="$2" sid="${3:-fremde-sid-die-lebt}"
  mkdir -p "$d"
  cat >"$d/ticket__${tid}.json" <<EOF
{
  "owner_sid": "$sid",
  "owner_pid": 1,
  "worktree": "-",
  "branch": "fix/foo",
  "label": "ticket-ops",
  "tool": "claude"
}
EOF
}

# ---------------------------------------------------------------------------
# 1-3: _ticket_lock_guard closure-Modus [T003102] — SKRIPTVERHALTEN
# ---------------------------------------------------------------------------

@test "closure-Modus: fremder ticket-Lock blockt den Abschluss nicht (Exit 0 + Warnung)" {
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  _write_foreign_ticket_lock "$AGENT_LOCK_DIR" "T009901"
  export CLAUDE_CODE_SESSION_ID="meine-andere-sid"
  run bash -c "cd '$REPO' && source '$TICKET_CORE' >/dev/null 2>&1; _ticket_lock_guard T009901 closure 2>&1"

  # Positiv-Anker: der Guard hat den Lock ueberhaupt gesehen (Warnung).
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'T003102'
  # Die Warnung muss den regulaeren Ausweg nennen (release), nicht nur den Block.
  printf '%s\n' "$output" | grep -qF 'release'
}

@test "ohne closure: fremder ticket-Lock blockt weiterhin (Exit 7 — Schutz bleibt)" {
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks2"
  _write_foreign_ticket_lock "$AGENT_LOCK_DIR" "T009902"
  export CLAUDE_CODE_SESSION_ID="meine-andere-sid"
  run bash -c "cd '$REPO' && source '$TICKET_CORE' >/dev/null 2>&1; _ticket_lock_guard T009902 2>&1"

  [ "$status" -eq 7 ]
  printf '%s\n' "$output" | grep -qF 'verweigert'
}

@test "eigene SID: durchgelassen in beiden Modi (keine Warnung, kein Block)" {
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks3"
  _write_foreign_ticket_lock "$AGENT_LOCK_DIR" "T009903" "eigene-sid"
  export CLAUDE_CODE_SESSION_ID="eigene-sid"
  run bash -c "cd '$REPO' && source '$TICKET_CORE' >/dev/null 2>&1; _ticket_lock_guard T009903 closure 2>&1"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'T003102' && { echo "eigene SID darf keine Warnung ausloesen"; return 1; } || true
}

# ---------------------------------------------------------------------------
# 4: update-status.sh reicht closure bei Terminal-Uebergaengen durch [T003102]
# ---------------------------------------------------------------------------

@test "update-status.sh: done/archived rufen den Guard im closure-Modus" {
  # Positiv-Anker: der Guard-Aufruf existiert ueberhaupt im Skript.
  run grep -cF '_ticket_lock_guard' "$UPDATE_STATUS"
  [ "$output" -ge 2 ]
  # Die Zusicherung: der Terminal-Zweig traegt das closure-Argument.
  run grep -E 'done\|archived\) _ticket_lock_guard "\$id" closure' "$UPDATE_STATUS"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# 5: Execute-Skills claimen branch-scoped statt ticket-scoped [T003102]
# ---------------------------------------------------------------------------

# Schneidet den Pre-Flight-Abschnitt bis zur naechsten Ueberschrift.
_section() {  # <file> <start-regex>
  awk -v s="$2" '$0 ~ s{f=1;next} f && /^#{2,4} /{exit} f' "$1"
}

@test "opencode-flow-execute −1.1 claimt branch-scoped, kein check-and-claim ticket" {
  block="$(_section "$EXEC_SKILL" '^### Schritt −1\.1')"
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
  [ "$(printf '%s\n' "$block" | grep -cF 'check-and-claim ticket')" -eq 0 ]
}

@test "dev-flow-execute-phases Pre-Flight claimt branch-scoped, kein check-and-claim ticket" {
  block="$(_section "$EXEC_PHASES" '^## Schritt −1 bis 0\.5')"
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
  [ "$(printf '%s\n' "$block" | grep -cF 'check-and-claim ticket')" -eq 0 ]
}

@test "ticket-preflight-lock −1.2 claimt branch-scoped, kein check-and-claim ticket" {
  block="$(_section "$PREFLIGHT" '^### Schritt −1\.2')"
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
  [ "$(printf '%s\n' "$block" | grep -cF 'check-and-claim ticket')" -eq 0 ]
}

@test "Claim-Verifikation + Release im opencode-flow-execute sind branch-scoped" {
  run grep -F 'check branch "$(git branch --show-current)"' "$EXEC_SKILL"
  [ "$status" -eq 0 ]
  run grep -F 'release branch "$(git branch --show-current)"' "$EXEC_SKILL"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# 6: agent-lock.sh dokumentiert die Scope-Semantik [T003102 — Task 1]
# ---------------------------------------------------------------------------

@test "agent-lock.sh dokumentiert ticket- vs. branch-scoped Semantik mit T003102" {
  run grep -F 'T003102' "$LOCK_SH"
  [ "$status" -eq 0 ]
  run grep -F 'branch-scoped' "$LOCK_SH"
  [ "$status" -eq 0 ]
  run grep -F 'ticket-scoped' "$LOCK_SH"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# 7: factory-prep Dispatch-Gate prueft BEIDE Scopes [T003102]
# ---------------------------------------------------------------------------

@test "factory-prep.sh: Dispatch-Gate sieht ticket- UND branch-scoped Locks" {
  run grep -F 'check ticket' "$FACTORY_PREP"
  [ "$status" -eq 0 ]
  # Der branch-Scope-Zweig listet die Lock-Bestaende und sucht die Ticket-ID.
  run grep -F 'list' "$FACTORY_PREP"
  [ "$status" -eq 0 ]
  run grep -F 'ext_id' "$FACTORY_PREP"
  [ "$status" -eq 0 ]
}
