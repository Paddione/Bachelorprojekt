#!/usr/bin/env bats
# tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T003116 (Ursache) · T003102 · T003131 · T003132
#
# PRUEFMODUS (bewusst gemischt, je Zusicherung begruendet):
#
#   * Tests 1-4 pruefen REGELWERKS-TEXTE (.claude/skills/**). Deren Ergebnis
#     manifestiert sich ausschliesslich im Quelltext — die Vorschrift IST das
#     Artefakt, es gibt kein Laufzeitverhalten dahinter. Hier ist `grep` das
#     angemessene Mittel (CLAUDE.md, Ausnahme "Dokumentationskonventionen").
#     Gegriffen wird jeweils NUR im relevanten Abschnitt, nicht in der ganzen
#     Datei — sonst wuerde ein Treffer an beliebiger anderer Stelle den Test
#     falsch gruen faerben.
#
#   * Tests 5-7 pruefen SKRIPTVERHALTEN. Hier wird das Kommando AUSGEFUEHRT und
#     sein Output/Exit-Code geprueft, nie die Implementierungsquelle gegreppt.
#
# SEMANTIK STATT DARSTELLUNG [T002716]: Zugesichert wird die Bedeutung des
# Outputs — Exit-Code, Anzahl der Vorkommen eines Pfades, Reihenfolge zweier
# Angaben. Wo eine Meldung selbst der Liefergegenstand ist (Test 6/7), wird auf
# zwei unabhaengige, unverankerte Tokens geprueft (`grep -qF`, keine Zeilenanker,
# kein Satz-Wortlaut), damit eine Umformulierung den Test nicht rot faerbt.
#
# POSITIV-ANKER: Jeder Negativtest ("X darf nicht vorkommen") prueft im selben
# Test ZUERST, dass der gueltige Fall vorhanden ist. Ohne diesen Anker waere ein
# leerer Abschnitt (z. B. nach einer Umbenennung) trivial "frei von X".

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TICKET_OPS="$REPO/.claude/skills/references/ticket-ops-procedures.md"
  PLAN_SKILL="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  GUARD="$REPO/scripts/hooks/worktree-write-guard.sh"
  TICKET_CORE="$REPO/scripts/vda/ticket/_ticket-core.sh"
}

# Schneidet den Step-3.6-Abschnitt aus ticket-ops-procedures.md heraus:
# ab der Ueberschrift bis zur naechsten Ueberschrift oder Trennlinie.
_step36_block() {
  awk '/^### Step 3\.6/{f=1;next} f && (/^### /||/^## /||/^---[[:space:]]*$/){exit} f' "$TICKET_OPS"
}

# Schneidet den Pre-Commit-Guard-Block aus dev-flow-plan/SKILL.md heraus.
_precommit_block() {
  awk '/Pre-Commit Guard/{f=1} f && /^### Schritt 6/{exit} f' "$PLAN_SKILL"
}

# ---------------------------------------------------------------------------
# 1-2: ticket-ops Step 3.6 — der Orchestrator claimt branch-scoped [T003116 #1]
# ---------------------------------------------------------------------------

@test "ticket-ops Step 3.6 schreibt einen branch-scoped Claim vor" {
  block="$(_step36_block)"
  # Positiv-Anker: der Abschnitt existiert ueberhaupt und traegt eine Claim-Anweisung.
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'agent-lock.sh claim')" -gt 0 ]
  # Die Zusicherung selbst.
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
}

@test "ticket-ops Step 3.6 schreibt KEINEN ticket-scoped Claim mehr vor" {
  block="$(_step36_block)"
  # Positiv-Anker zuerst — ein leerer Abschnitt darf nicht als Erfolg gelten.
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
  # Negativ-Aussage.
  [ "$(printf '%s\n' "$block" | grep -cF 'claim ticket')" -eq 0 ]
}

# ---------------------------------------------------------------------------
# 3: Dispatch-Vorlage nennt den Claim des SUBAGENTEN [T003132]
# ---------------------------------------------------------------------------

@test "ticket-ops Step 3.6 sagt dem Subagenten, welchen Scope er selbst claimt" {
  block="$(_step36_block)"
  [ -n "$block" ]
  # Der Prompt-Baustein muss den Befehl UND die Begruendung tragen; sonst leitet
  # ihn jeder dispatchte Agent erneut selbst her (vier Herleitungen in einem Lauf).
  [ "$(printf '%s\n' "$block" | grep -cF 'claim branch')" -gt 0 ]
  [ "$(printf '%s\n' "$block" | grep -cF 'T003102')" -gt 0 ]
}

# ---------------------------------------------------------------------------
# 4: dev-flow-plan Pre-Commit-Guard akzeptiert die branch-scoped Lock-Datei
#    [T003116 #2, #3]
# ---------------------------------------------------------------------------

@test "dev-flow-plan Pre-Commit-Guard akzeptiert branch__<slug>.json und nennt T003102" {
  block="$(_precommit_block)"
  # Positiv-Anker: der Guard-Block existiert und prueft weiterhin eine Lock-Datei.
  [ -n "$block" ]
  [ "$(printf '%s\n' "$block" | grep -cF 'agent-locks/')" -gt 0 ]
  # Die branch-scoped Datei muss als gueltiger Claim gelten ...
  [ "$(printf '%s\n' "$block" | grep -cF 'branch__')" -gt 0 ]
  # ... und die Begruendung muss verlinkt sein, damit sie nicht erneut
  # hergeleitet werden muss.
  [ "$(printf '%s\n' "$block" | grep -cF 'T003102')" -gt 0 ]
}

# ---------------------------------------------------------------------------
# 5-6: worktree-write-guard — Ausgabe-Verifikation (Kommando wird ausgefuehrt)
# ---------------------------------------------------------------------------

# Baut ein isoliertes Lock-Verzeichnis mit ZWEI Claims derselben SID auf DENSELBEN
# Worktree-Pfad (branch- und worktree-Scope) — die Konstellation aus T003131.
_run_guard_two_claims_same_wt() {
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  local sid="sid-eine-session"
  # Absoluter, EXISTIERENDER Pfad: der Guard ueberspringt Claims auf nicht
  # vorhandene Worktrees (T002412), sonst faellt er auf Regel 4 durch und
  # erlaubt — der Test wuerde dann am falschen Grund scheitern.
  local wt="$BATS_TEST_TMPDIR/alpha"
  mkdir -p "$wt"
  for scope in branch worktree; do
    cat >"$AGENT_LOCK_DIR/${scope}__alpha.json" <<EOF
{
  "owner_sid": "$sid",
  "owner_pid": $$,
  "worktree": "$wt",
  "branch": "fix/alpha",
  "label": "test"
}
EOF
  done
  export CLAUDE_CODE_SESSION_ID="$sid"
  # Ziel liegt im Repo, aber ausserhalb des geclaimten Worktrees -> Regel 2 greift.
  printf '{"tool_input":{"file_path":"%s/README.md"}}' "$REPO" \
    | bash "$GUARD" 2>&1
}

@test "worktree-write-guard listet einen doppelt geclaimten Worktree nur einmal auf" {
  run _run_guard_two_claims_same_wt
  # Semantik: Regel 2 hat gegriffen (Ablehnung), nicht der Wortlaut der Meldung.
  [ "$status" -eq 2 ]
  count="$(printf '%s\n' "$output" | grep -cF "$BATS_TEST_TMPDIR/alpha")"
  # Positiv-Anker: der Pfad taucht ueberhaupt auf — sonst misst der Test nichts.
  [ "$count" -gt 0 ]
  # Die Zusicherung: genau einmal, nicht je Lock-Datei erneut.
  [ "$count" -eq 1 ]
}

@test "worktree-write-guard benennt die Herkunft des Besitzes (SID, auch andere Subagenten)" {
  run _run_guard_two_claims_same_wt
  [ "$status" -eq 2 ]
  # Zwei unabhaengige, unverankerte Tokens statt eines Satz-Wortlauts: die Meldung
  # muss erkennbar machen, dass der Besitz aus der SID stammt und andere Subagenten
  # derselben Session einschliesst. Umformulierungen bleiben zulaessig.
  printf '%s\n' "$output" | grep -qF 'SID'
  printf '%s\n' "$output" | grep -qiF 'subagent'
}

# ---------------------------------------------------------------------------
# 7: Ticket-Lock-Guard nennt den regulaeren release-Pfad VOR dem Override
#    [T003102] — Ausgabe-Verifikation, Zusicherung ist die REIHENFOLGE
# ---------------------------------------------------------------------------

@test "_ticket_lock_guard nennt release vor TICKET_LOCK_OVERRIDE" {
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks7"
  mkdir -p "$AGENT_LOCK_DIR"
  cat >"$AGENT_LOCK_DIR/ticket__T009999.json" <<'EOF'
{
  "owner_sid": "fremde-sid-die-lebt",
  "owner_pid": 1,
  "worktree": "-",
  "branch": "fix/foo",
  "label": "ticket-ops",
  "tool": "claude"
}
EOF
  export CLAUDE_CODE_SESSION_ID="meine-andere-sid"
  # shellcheck disable=SC1090
  run bash -c "cd '$REPO' && source '$TICKET_CORE' >/dev/null 2>&1; _ticket_lock_guard T009999 2>&1"

  # Positiv-Anker: der Guard hat ueberhaupt abgelehnt und etwas ausgegeben.
  [ "$status" -eq 7 ]
  printf '%s\n' "$output" | grep -qF 'TICKET_LOCK_OVERRIDE'
  # Die Zusicherung: der regulaere Ausweg (release) steht VOR dem Override —
  # geprueft ueber Zeilennummern, nicht ueber den Wortlaut der Saetze.
  rel="$(printf '%s\n' "$output" | grep -n -- 'release' | head -1 | cut -d: -f1)"
  ovr="$(printf '%s\n' "$output" | grep -n -- 'TICKET_LOCK_OVERRIDE' | head -1 | cut -d: -f1)"
  [ -n "$rel" ]
  [ -n "$ovr" ]
  [ "$rel" -lt "$ovr" ]
}
