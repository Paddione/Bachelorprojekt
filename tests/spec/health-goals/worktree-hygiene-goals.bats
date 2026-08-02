#!/usr/bin/env bats
# Ziele G-WT01..G-WT06 — Worktree- und Session-Hygiene [T002443]
#
# PRÜFMODUS: command output verification (T002448-M4).
# Jeder Test FÜHRT `scripts/lib/wt-hygiene-measure.sh <subcommand>` gegen eine echte
# Fixture AUS und prüft `$output`/`$status`. Kein `grep` auf den Skriptquelltext —
# geprüft wird das Messergebnis, nicht dessen Schreibweise.
#
# AUFBAU je Ziel (Positiv-Anker zuerst, T002356-M1):
#   1. Anker-Test    — ohne Messgrundlage MUSS `n/a` kommen und NICHT `0`.
#   2. Verletzungs-Test — mit präparierter Verletzung MUSS die Verletzung gezählt
#      werden, und ein gültiger Nachbarfall in derselben Fixture darf NICHT
#      mitgezählt werden.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  MEASURE="$REPO_ROOT/scripts/lib/wt-hygiene-measure.sh"
  FIX="$(mktemp -d)"
  export AGENT_LOCK_TTL=1800
  unset CI || true
}

teardown() {
  [ -n "${FIX:-}" ] && rm -rf "$FIX"
  return 0
}

# ── Fixture-Helfer ────────────────────────────────────────────────────────────

# Git-Repo mit einem Commit auf main und gesetzter origin/main-Referenz.
# Kein Netzzugriff: origin/main wird per update-ref lokal gesetzt.
mk_repo() {
  R="$FIX/repo"
  mkdir -p "$R"
  git -C "$R" init -q -b main
  git -C "$R" config user.email "t@example.invalid"
  git -C "$R" config user.name "t"
  echo seed > "$R/seed.txt"
  git -C "$R" add seed.txt
  git -C "$R" commit -qm "init"
  git -C "$R" update-ref refs/remotes/origin/main HEAD
  touch "$R/.git/FETCH_HEAD"
  export HG_REPO_ROOT="$R"
  export AGENT_LOCK_DIR="$FIX/locks"
}

# mk_lock <dateiname-ohne-suffix> <scope> <owner_pid> <alter-in-sekunden> [worktree]
# Vorgabe für <worktree> ist ein NICHT existierender Pfad: `owner_pid` allein trägt
# keine Lebendigkeits-Aussage (agent-lock.sh schreibt dort `$$` eines kurzlebigen
# Bash-Prozesses), deshalb entscheidet der eingetragene Worktree mit. Wer den
# Worktree-Fall braucht, übergibt ihn explizit.
mk_lock() {
  local name="$1" scope="$2" pid="$3" age="$4" wt="${5:-$FIX/kein-worktree}"
  local ts=$(( $(date +%s) - age ))
  mkdir -p "$AGENT_LOCK_DIR"
  cat > "$AGENT_LOCK_DIR/$name.json" <<EOF
{
  "scope": "$scope",
  "id": "$name",
  "owner_sid": "sid-$name",
  "owner_pid": "$pid",
  "tool": "claude",
  "label": "test",
  "worktree": "$wt",
  "branch": "main",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF
}

# Eine garantiert tote PID erzeugen.
dead_pid() {
  local p
  sleep 0 &
  p=$!
  wait "$p" 2>/dev/null || true
  printf '%s' "$p"
}

# ── G-WT01 — Hauptcheckout auf main und sauber ────────────────────────────────

@test "G-WT01: ohne auflösbaren Hauptcheckout meldet main-checkout n/a, nicht 0" {
  # Positiv-Anker zuerst: mit echtem Repo MUSS eine Zahl kommen.
  mk_repo
  run bash "$MEASURE" main-checkout
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]

  # Negativ-Aussage: kein Git-Repo => n/a, niemals 0.
  export HG_REPO_ROOT="$FIX/kein-repo"
  mkdir -p "$HG_REPO_ROOT"
  run bash "$MEASURE" main-checkout
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT01: main-checkout zählt fremden Branch und dirty Tree als Verletzung" {
  mk_repo
  # Positiv-Anker: sauberer main ist 0.
  run bash "$MEASURE" main-checkout
  [ "$output" = "0" ]

  # Verletzung 1: fremder Branch.
  git -C "$R" checkout -q -b chore/abweichung
  run bash "$MEASURE" main-checkout
  [ "$output" = "1" ]

  # Verletzung 2: zurück auf main, aber dirty.
  git -C "$R" checkout -q main
  echo dirty > "$R/dirty.txt"
  run bash "$MEASURE" main-checkout
  [ "$output" = "1" ]
}

# ── G-WT02 — Veraltete Worktrees ──────────────────────────────────────────────

@test "G-WT02: ohne registrierten Worktree meldet stale-worktrees n/a, nicht 0" {
  mk_repo
  # Positiv-Anker zuerst: mit einem Worktree MUSS eine Zahl kommen.
  git -C "$R" worktree add -q -b wt-anker "$FIX/wt-anker" >/dev/null 2>&1
  run bash "$MEASURE" stale-worktrees
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: Worktree entfernt => keine Messgrundlage => n/a.
  git -C "$R" worktree remove --force "$FIX/wt-anker"
  run bash "$MEASURE" stale-worktrees
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT02: stale-worktrees zählt gemergten Worktree, nicht den aktiven Nachbarn" {
  mk_repo
  # Gemergt: HEAD ist Vorfahr von origin/main.
  git -C "$R" worktree add -q -b wt-merged "$FIX/wt-merged" >/dev/null 2>&1
  # Aktiv: eigener Commit, nicht auf origin/main, frisch.
  git -C "$R" worktree add -q -b wt-active "$FIX/wt-active" >/dev/null 2>&1
  echo neu > "$FIX/wt-active/neu.txt"
  git -C "$FIX/wt-active" add neu.txt
  git -C "$FIX/wt-active" commit -qm "aktive arbeit"

  run bash "$MEASURE" stale-worktrees
  [ "$status" -eq 0 ]
  # Positiv-Anker: der aktive Worktree wird NICHT mitgezählt — sonst wäre die 1 zufällig.
  [ "$output" = "1" ]
}

# ── G-WT03 — Verwaiste Agent-Locks ────────────────────────────────────────────

@test "G-WT03: ohne Lock-Datei meldet orphan-locks n/a, nicht 0" {
  mk_repo
  # Positiv-Anker zuerst: mit einem Lock MUSS eine Zahl kommen.
  mk_lock "ticket__T000001" "ticket" "$$" 10
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: Lock weg => keine Messgrundlage => n/a.
  rm -f "$AGENT_LOCK_DIR"/*.json
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT03: orphan-locks zählt toten Lock, nicht den lebenden Nachbarn" {
  mk_repo
  local dp; dp="$(dead_pid)"
  mk_lock "ticket__T000dead" "ticket" "$dp" 60
  mk_lock "ticket__T000live" "ticket" "$$" 10

  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  # Positiv-Anker: der lebende Lock zählt NICHT mit — sonst wäre die Zahl 2.
  [ "$output" = "1" ]
}

@test "G-WT03 (Vorfall T002570): toter PID mit nie fortgeschriebenem Heartbeat bei existierendem Worktree wird gezählt" {
  mk_repo
  local dp; dp="$(dead_pid)"
  # Positiv-Anker: derselbe Aufbau mit LEBENDER PID darf nicht zählen.
  mk_lock "ticket__T002570live" "ticket" "$$" 10
  run bash "$MEASURE" orphan-locks
  [ "$output" = "0" ]

  # Der belegte Fall: PID tot, heartbeat_at == created_at, älter als 2×TTL,
  # Worktree existiert weiterhin (deshalb räumt `agent-lock.sh reap` ihn nicht).
  mk_lock "ticket__T002570" "ticket" "$dp" 7200 "$HG_REPO_ROOT"
  [ -d "$HG_REPO_ROOT" ]
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "G-WT03 (stärkster Anker): der Lock der laufenden Session gilt als lebendig, obwohl seine owner_pid tot ist" {
  # `agent-lock.sh::_write_lock` schreibt "owner_pid": "$$" — die PID des kurzlebigen
  # agent-lock.sh-Prozesses. Sekunden nach dem Claim ist sie IMMER tot, auch beim Lock
  # der gerade laufenden Session. Eine Regel "tote PID ⇒ verwaist" stufte am 2026-08-02
  # alle fünf Locks des Hauptcheckouts als verwaist ein, darunter den eigenen.
  mk_repo
  local dp; dp="$(dead_pid)"

  # Positiv-Anker: die Messung ist scharf — derselbe tote PID OHNE lebenden Worktree zählt.
  mk_lock "ticket__T000weg" "ticket" "$dp" 60
  run bash "$MEASURE" orphan-locks
  [ "$output" = "1" ]

  # Der Lock der laufenden Session: tote owner_pid, aber der eingetragene Worktree
  # existiert, steht auf dem eingetragenen Branch, und der Heartbeat ist frisch.
  mk_lock "ticket__T002443" "ticket" "$dp" 300 "$HG_REPO_ROOT"
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  # Die Zahl darf sich NICHT erhöhen — sonst ist das Messverfahren kaputt.
  [ "$output" = "1" ]
}

@test "G-WT03 (Gegenprobe): Lock mit lebender owner_pid und frischem Heartbeat wird nicht gezählt" {
  mk_repo
  # Positiv-Anker: die Messung ist scharf — ein toter Lock in derselben Fixture wird erkannt.
  local dp; dp="$(dead_pid)"
  mk_lock "ticket__T000tot" "ticket" "$dp" 60
  run bash "$MEASURE" orphan-locks
  [ "$output" = "1" ]

  # Der lebende Lock dieser Session kommt hinzu — die Zahl darf sich NICHT erhöhen.
  mk_lock "ticket__T002443" "ticket" "$$" 10
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "G-WT03: abgelaufener Heartbeat wird auch ohne tote PID gezählt" {
  mk_repo
  # Positiv-Anker: frischer Heartbeat derselben PID zählt nicht.
  mk_lock "ticket__T000fresh" "ticket" "$$" 10
  run bash "$MEASURE" orphan-locks
  [ "$output" = "0" ]

  # heartbeat_at älter als 2×AGENT_LOCK_TTL (2×1800 = 3600 s).
  mk_lock "ticket__T000stale" "ticket" "$$" 7200
  run bash "$MEASURE" orphan-locks
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── G-WT04 — Löschbereite Worktrees mit ungesicherter Arbeit ──────────────────

@test "G-WT04: ohne registrierten Worktree meldet unsafe-worktrees n/a, nicht 0" {
  mk_repo
  # Positiv-Anker zuerst.
  git -C "$R" worktree add -q -b wt-anker4 "$FIX/wt-anker4" >/dev/null 2>&1
  run bash "$MEASURE" unsafe-worktrees
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  git -C "$R" worktree remove --force "$FIX/wt-anker4"
  run bash "$MEASURE" unsafe-worktrees
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT04: unsafe-worktrees zählt nur die Schnittmenge aus löschbereit UND dirty" {
  mk_repo
  # Löschbereit (gemergt) UND dirty => zählt.
  git -C "$R" worktree add -q -b wt-gefahr "$FIX/wt-gefahr" >/dev/null 2>&1
  echo ungesichert > "$FIX/wt-gefahr/ungesichert.txt"
  # Löschbereit (gemergt), aber sauber => zählt NICHT.
  git -C "$R" worktree add -q -b wt-sauber "$FIX/wt-sauber" >/dev/null 2>&1
  # Dirty, aber NICHT löschbereit (eigener Commit) => zählt NICHT.
  git -C "$R" worktree add -q -b wt-aktiv "$FIX/wt-aktiv" >/dev/null 2>&1
  echo neu > "$FIX/wt-aktiv/neu.txt"
  git -C "$FIX/wt-aktiv" add neu.txt
  git -C "$FIX/wt-aktiv" commit -qm "aktive arbeit"
  echo auch-dirty > "$FIX/wt-aktiv/dirty.txt"

  run bash "$MEASURE" unsafe-worktrees
  [ "$status" -eq 0 ]
  # Positiv-Anker: beide Nachbarfälle bleiben ungezählt — sonst käme 2 oder 3.
  [ "$output" = "1" ]
}

# ── G-WT05 — Lokaler main hinter origin/main ─────────────────────────────────

@test "G-WT05: ohne origin/main-Referenz meldet main-divergence n/a, nicht 0" {
  mk_repo
  # Positiv-Anker zuerst: mit origin/main MUSS eine Zahl kommen.
  run bash "$MEASURE" main-divergence
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]

  # Negativ-Aussage: origin/main entfernt => n/a.
  git -C "$R" update-ref -d refs/remotes/origin/main
  run bash "$MEASURE" main-divergence
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT05: main-divergence zählt Commits in main..origin/main" {
  mk_repo
  # Positiv-Anker: synchron ist 0.
  run bash "$MEASURE" main-divergence
  [ "$output" = "0" ]

  # origin/main um zwei Commits voranstellen, lokalen main stehen lassen.
  git -C "$R" checkout -q -b tmp-remote
  echo a > "$R/a.txt"; git -C "$R" add a.txt; git -C "$R" commit -qm "a"
  echo b > "$R/b.txt"; git -C "$R" add b.txt; git -C "$R" commit -qm "b"
  git -C "$R" update-ref refs/remotes/origin/main HEAD
  git -C "$R" checkout -q main

  run bash "$MEASURE" main-divergence
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

# ── G-WT06 — Phantom-Scope-Locks ─────────────────────────────────────────────

@test "G-WT06: ohne Lock-Datei meldet phantom-scope-locks n/a, nicht 0" {
  mk_repo
  # Positiv-Anker zuerst.
  mk_lock "ticket__T000002" "ticket" "$$" 10
  run bash "$MEASURE" phantom-scope-locks
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  rm -f "$AGENT_LOCK_DIR"/*.json
  run bash "$MEASURE" phantom-scope-locks
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-WT06: phantom-scope-locks zählt Flag-als-Scope neben gültigem ticket-Scope" {
  mk_repo
  # Der belegte Fall vom 2026-08-02: `--label` wurde als Positionsargument
  # (Scope) gelesen. Daneben ein wohlgeformter Lock als Positiv-Anker.
  mk_lock "ticket__T000gut" "ticket" "$$" 10
  mk_lock "phantom__flag" "--label" "$$" 10

  run bash "$MEASURE" phantom-scope-locks
  [ "$status" -eq 0 ]
  # Positiv-Anker: der gültige ticket-Scope zählt NICHT mit — sonst wäre die Zahl 2.
  [ "$output" = "1" ]
}

@test "G-WT06: leerer Scope zählt, wohlgeformter Scope nicht" {
  mk_repo
  mk_lock "branch__ok" "branch" "$$" 10
  run bash "$MEASURE" phantom-scope-locks
  [ "$output" = "0" ]

  mk_lock "phantom__leer" "" "$$" 10
  run bash "$MEASURE" phantom-scope-locks
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── Querschnitt ──────────────────────────────────────────────────────────────

@test "wt-hygiene-measure: unbekanntes Subkommando bricht ab statt n/a zu melden" {
  mk_repo
  # Positiv-Anker: ein bekanntes Subkommando läuft durch.
  run bash "$MEASURE" main-checkout
  [ "$status" -eq 0 ]

  run bash "$MEASURE" gibt-es-nicht
  [ "$status" -ne 0 ]
  [ "$output" != "n/a" ]
}
