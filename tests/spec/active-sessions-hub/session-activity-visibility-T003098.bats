#!/usr/bin/env bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T003098 — `agent-lock.sh list` zeigt eine Session erst ab ihrem ERSTEN
# COMMIT. Der main-checkout-Claim entsteht im pre-commit-Hook (.githooks/pre-commit),
# also nicht ab Arbeitsbeginn. Wer `list` als Vorab-Check auf konkurrierende Arbeit
# nutzt (dev-flow-chore Schritt 1), bekommt in genau dem Fenster ein
# falsch-negatives Ergebnis und arbeitet inline im Haupt-Checkout weiter.
#
# ENTSCHEIDUNG (siehe openspec/changes/agent-lock-sid-detection-T003110/design.md):
# Der Claim wird NICHT auf den Session-Start vorgezogen — software-factory.md
# ("main-checkout lock is self-claimed on every commit") legt den Zeitpunkt
# ausdrücklich fest, und ein früher Claim überlebt seine Session um bis zu
# AGENT_LOCK_TTL (30 min), in denen guard-precommit fremde Commits blockiert.
# Statt Falsch-Negativen gegen Falsch-Positive zu tauschen, bekommt das Werkzeug
# eine zweite, claim-unabhängige Evidenzquelle: laufende Prozesse, deren cwd im
# Repo liegt — genau das Signal, das im gemeldeten Fall verlässlich war.
#
# Prüfmodus: command output verification (T002448-M4) — der Test startet einen
# echten Prozess und prüft, ob `agent-lock.sh activity` ihn meldet.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_FETCH_TTL=99999

  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO"
  git -C "$REPO" init -q
  git -C "$REPO" config user.email t@example.com
  git -C "$REPO" config user.name test
  git -C "$REPO" commit -q --allow-empty -m init
}

teardown() {
  [ -n "${WORKER_PID:-}" ] && kill "$WORKER_PID" 2>/dev/null
  return 0
}

@test "activity reports a session working in the repo that has not committed yet" {
  # Ein Prozess arbeitet im Repo — hat aber noch nichts committet, hält also
  # keinen Claim. Genau die Lage aus dem Ticket.
  ( cd "$REPO" && exec sleep 30 ) &
  WORKER_PID=$!
  # Auf den cwd-Wechsel des Kindprozesses warten, statt ihn anzunehmen.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(readlink "/proc/$WORKER_PID/cwd" 2>/dev/null)" = "$REPO" ] && break
    sleep 0.2
  done
  [ "$(readlink "/proc/$WORKER_PID/cwd" 2>/dev/null)" = "$REPO" ]

  # Belegt die Lücke: `list` kennt diese Session nicht (keine Claim-Datei).
  run bash -c "cd '$REPO' && bash '$AGENT_LOCK' list"
  [ "$status" -eq 0 ]
  ! grep -qF "$WORKER_PID" <<<"$output"

  # Positiv-Anker + Aussage: `activity` meldet sie, weil es zusätzlich
  # Prozess-Evidenz auswertet.
  run bash -c "cd '$REPO' && bash '$AGENT_LOCK' activity"
  [ "$status" -eq 0 ]
  grep -qF "$WORKER_PID" <<<"$output"

  # Und es hält nicht an toter Evidenz fest: ist der Prozess beendet, ist er weg.
  kill "$WORKER_PID" 2>/dev/null
  wait "$WORKER_PID" 2>/dev/null || true
  run bash -c "cd '$REPO' && bash '$AGENT_LOCK' activity"
  [ "$status" -eq 0 ]
  ! grep -qF "$WORKER_PID" <<<"$output"
  WORKER_PID=""
}

@test "activity does not report its own invoking process as foreign activity" {
  # Ohne Selbstausschluss meldete `activity` immer mindestens sich selbst und
  # wäre als Vorab-Check wertlos: die Antwort wäre nie "niemand arbeitet hier".
  run bash -c "cd '$REPO' && bash '$AGENT_LOCK' activity"
  [ "$status" -eq 0 ]
  ! grep -qF " $BASHPID " <<<"$output"
  ! grep -qF " $$ " <<<"$output"
}
