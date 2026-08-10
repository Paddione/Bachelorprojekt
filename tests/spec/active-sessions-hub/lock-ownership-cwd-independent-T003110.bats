#!/usr/bin/env bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T003110 — `agent-lock.sh check ticket <id>` meldet aus einem Worktree
# "held" statt "mine", `ticket.sh update-status` bricht mit Exit 7 ab und nur
# TICKET_LOCK_OVERRIDE=1 kommt noch durch.
#
# Zwei zusammenwirkende Ursachen, beide hier reproduziert:
#  (1) cmd_check entscheidet Ownership über EXAKTE String-Gleichheit von
#      "$PWD" mit dem Feld `worktree`. Aus jedem Unterverzeichnis desselben
#      Worktrees kippt dasselbe Lock von "mine" nach "held". check-and-claim
#      trifft diese Entscheidung nie — es geht über cmd_claim, das allein über
#      die SID entscheidet. Genau daher "check-and-claim funktioniert, check nicht".
#  (2) _ticket_lock_guard (scripts/vda/ticket/_ticket-core.sh) baut die
#      SID-Auflösung selbst nach und liest dabei nur CLAUDE_CODE_SESSION_ID und
#      CLAUDE_SESSION_ID — weder AGENT_LOCK_SID noch OPENCODE_SESSION_ID, die
#      openspec/specs/active-sessions-hub.md ("Harness-Stable Session Identity")
#      verbindlich vorschreibt. Daher die Diagnosezeile "Eigene SID: <nicht gesetzt>".
#
# Prüfmodus: command output verification (T002448-M4) — Exit-Codes echter
# Aufrufe von agent-lock.sh bzw. _ticket_lock_guard, kein Quelltext-grep.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_FETCH_TTL=99999

  # Ein echter Worktree mit Unterverzeichnis — der Fall aus dem Ticket.
  WT="$BATS_TEST_TMPDIR/wt"
  mkdir -p "$WT/subdir"
  git -C "$WT" init -q
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name test
  git -C "$WT" commit -q --allow-empty -m init
  git -C "$WT" checkout -q -b fix/demo-T003110
}

@test "check yields the same ownership verdict from a worktree subdirectory as from its root" {
  # Der Lock gehört Session A; die prüfende Session meldet eine andere SID
  # (SID-Drift, der Fall für den die worktree-Erkennung überhaupt existiert).
  AGENT_LOCK_SID=session-A bash "$AGENT_LOCK" claim ticket TOWN1 \
    --label probe --worktree "$WT" --branch fix/demo-T003110
  [ -f "$AGENT_LOCK_DIR/ticket__TOWN1.json" ]

  # Positiv-Anker: aus der Worktree-WURZEL erkennt check den Lock heute schon
  # als eigenen (Exit 0). Ohne diesen Anker bewiese der zweite Aufruf nichts.
  run bash -c "cd '$WT' && AGENT_LOCK_SID=session-B bash '$AGENT_LOCK' check ticket TOWN1"
  [ "$status" -eq 0 ]

  # Die Aussage: dasselbe Lock, dieselbe Session, nur ein anderes cwd INNERHALB
  # desselben Worktrees — das Urteil darf nicht kippen.
  run bash -c "cd '$WT/subdir' && AGENT_LOCK_SID=session-B bash '$AGENT_LOCK' check ticket TOWN1"
  [ "$status" -eq 0 ]
}

@test "check still reports a foreign worktree's lock as held" {
  # Gegenprobe zur Lockerung oben: die cwd-Unabhängigkeit darf NICHT dazu
  # führen, dass ein Lock, der einen ganz anderen Arbeitsbaum nennt, als eigener
  # durchgeht. Sonst wäre der Guard wirkungslos statt nur cwd-empfindlich.
  local other="$BATS_TEST_TMPDIR/other"
  mkdir -p "$other"
  AGENT_LOCK_SID=session-A bash "$AGENT_LOCK" claim ticket TOWN2 \
    --label probe --worktree "$other" --branch fix/demo-T003110
  run bash -c "cd '$WT' && AGENT_LOCK_SID=session-B bash '$AGENT_LOCK' check ticket TOWN2"
  [ "$status" -eq 3 ]
}

@test "ticket lock guard resolves its own session id by the spec'd order, not a private two-name list" {
  # Aufbau: der Lock gehört einer opencode-Session (oc-1). Der Aufrufer IST
  # diese Session, aber agent-lock löst in diesem Aufrufkontext eine andere SID
  # auf (AGENT_LOCK_SID) — die Lage, für die die Rettungsklausel in
  # _ticket_lock_guard (T002498-M10) überhaupt existiert: `check` meldet "held",
  # obwohl der Halter dieselbe Session ist.
  local other="$BATS_TEST_TMPDIR/other2"
  mkdir -p "$other"
  AGENT_LOCK_SID=oc-1 bash "$AGENT_LOCK" claim ticket TOWN3 \
    --label probe --worktree "$other" --branch fix/demo-T003110

  # Vorbedingung des Szenarios, damit der Test nicht am rc==3-Zweig vorbeiläuft:
  # aus diesem Aufrufkontext meldet agent-lock den Lock als fremd.
  run env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID -u OPENCODE_SESSION_ID \
    AGENT_LOCK_SID=session-other bash -c "cd '$REPO_ROOT' && bash '$AGENT_LOCK' check ticket TOWN3"
  [ "$status" -eq 3 ]

  # Positiv-Anker: eine wirklich fremde Session bleibt blockiert (Exit 7).
  run env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID OPENCODE_SESSION_ID=oc-fremd \
    AGENT_LOCK_SID=session-other \
    bash -c "cd '$REPO_ROOT' && source scripts/vda/ticket/_ticket-core.sh >/dev/null 2>&1 && _ticket_lock_guard TOWN3"
  [ "$status" -eq 7 ]

  # Die Aussage: der Halter oc-1 ist der Aufrufer selbst. Die Rettungsklausel
  # MUSS greifen — sie tut es nur, wenn der Guard OPENCODE_SESSION_ID kennt.
  # openspec/specs/active-sessions-hub.md führt den Namen seit T002671 in der
  # verbindlichen Auflösungsreihenfolge; die private Liste im Guard nennt nur
  # CLAUDE_CODE_SESSION_ID und CLAUDE_SESSION_ID und läuft damit auseinander.
  run env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID OPENCODE_SESSION_ID=oc-1 \
    AGENT_LOCK_SID=session-other \
    bash -c "cd '$REPO_ROOT' && source scripts/vda/ticket/_ticket-core.sh >/dev/null 2>&1 && _ticket_lock_guard TOWN3"
  [ "$status" -eq 0 ]
}

@test "a refused ticket lock guard names the caller's own session id in its diagnostic" {
  local other="$BATS_TEST_TMPDIR/other3"
  mkdir -p "$other"
  AGENT_LOCK_SID=session-A bash "$AGENT_LOCK" claim ticket TOWN4 \
    --label probe --worktree "$other" --branch fix/demo-T003110

  run env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID OPENCODE_SESSION_ID=oc-diag \
    AGENT_LOCK_SID=session-B \
    bash -c "cd '$REPO_ROOT' && source scripts/vda/ticket/_ticket-core.sh >/dev/null 2>&1 && _ticket_lock_guard TOWN4 2>&1"
  # Positiv-Anker: der Guard verweigert (sonst gäbe es keine Diagnose zu prüfen)
  # und benennt den Halter.
  [ "$status" -eq 7 ]
  grep -qF 'session-A' <<<"$output"
  # Die Aussage: die Diagnose nennt die EIGENE Session. Heute steht dort
  # "<nicht gesetzt>", weil der Guard OPENCODE_SESSION_ID nicht liest — genau
  # die Zeile aus dem Ticketbefund, die die Untersuchung in die Irre führte.
  grep -qF 'oc-diag' <<<"$output"
}
