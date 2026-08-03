#!/usr/bin/env bats
# tests/spec/software-factory/worktree-reap.bats — Guards für den Worktree-Reaper in
# scripts/agent-lock.sh cmd_reap [T002622]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt `agent-lock.sh reap` gegen ein echtes Fixture-Repo mit echten Worktrees aus
# und prüft das RESULTAT (Verzeichnis weg/da, Branch-Ref weg/da, Tag gesetzt) plus die
# Begründungszeilen der Ausgabe. Der Quelltext von agent-lock.sh wird NICHT gegreppt — ein
# Muster im Source belegt nur, dass Text existiert, nicht dass das Verhalten stimmt
# [T002448-M4].
#
# Reihenfolge und Aufbau sind bedeutungstragend [T002356-M1]: Jeder Test, der eine
# NEGATIV-Aussage trifft ("dieser Worktree überlebt"), prüft ZUERST den Positiv-Anker
# (der verwaiste Worktree ist tatsächlich verschwunden). Ohne den Anker wären alle
# Überlebens-Aussagen vakuos wahr, solange die neue Reap-Stufe gar nicht existiert.
#
# Das Fixture bildet die reale Lage vom 2026-08-03 nach: Branches, deren Remote-Ref beim
# Squash-Merge gelöscht wurde. Sie sind bewusst KEINE Vorfahren von main — genau deshalb
# greift `git branch --merged main` bei ihnen nicht.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  LOCKSH="$PROJECT_DIR/scripts/agent-lock.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  WT_ROOT="$BATS_TEST_TMPDIR/wt"
  mkdir -p "$STUBS" "$WT_ROOT"

  git init --bare --quiet "$REMOTE"
  git init --quiet -b main "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"
  git -C "$FIXTURE" commit --quiet --allow-empty -m base
  git -C "$FIXTURE" push --quiet -u origin main

  # Fünf Branches, je ein Commit ueber main hinaus (also nie Vorfahre von origin/main).
  local br
  for br in fix/orphan-T009101 fix/active-T009102 fix/dirty-T009103 \
            fix/noupstream-T009104 fix/nowt-T009105; do
    git -C "$FIXTURE" checkout --quiet -b "$br" main
    git -C "$FIXTURE" commit --quiet --allow-empty -m "work on $br"
  done
  git -C "$FIXTURE" checkout --quiet main

  # Upstream setzen: alle ausser noupstream werden gepusht.
  for br in fix/orphan-T009101 fix/active-T009102 fix/dirty-T009103 fix/nowt-T009105; do
    git -C "$FIXTURE" push --quiet -u origin "$br"
  done

  # Worktrees fuer vier der fuenf Branches (nowt bleibt bewusst ohne).
  git -C "$FIXTURE" worktree add --quiet "$WT_ROOT/orphan"     fix/orphan-T009101
  git -C "$FIXTURE" worktree add --quiet "$WT_ROOT/active"     fix/active-T009102
  git -C "$FIXTURE" worktree add --quiet "$WT_ROOT/dirty"      fix/dirty-T009103
  git -C "$FIXTURE" worktree add --quiet "$WT_ROOT/noupstream" fix/noupstream-T009104

  # Der dirty-Worktree traegt eine uncommittete Datei.
  echo "unsaved work" > "$WT_ROOT/dirty/scratch.txt"

  # Merge simulieren: GitHub loescht den Remote-Branch. Fuer active bleibt er stehen.
  for br in fix/orphan-T009101 fix/dirty-T009103 fix/nowt-T009105; do
    git -C "$FIXTURE" push --quiet origin --delete "$br"
  done
  git -C "$FIXTURE" fetch --quiet --prune origin

  ORPHAN_SHA="$(git -C "$FIXTURE" rev-parse fix/orphan-T009101)"
  NOWT_SHA="$(git -C "$FIXTURE" rev-parse fix/nowt-T009105)"

  # ticket.sh-Stub: alle Fixture-Tickets sind done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"external_id":"T009101","status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export TICKET_SH="$STUBS/ticket-stub.sh"
  # Eigenes Lock-Verzeichnis: der Reaper darf die echten Locks dieser Maschine nicht sehen.
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
}

teardown() {
  git -C "$FIXTURE" worktree prune 2>/dev/null || true
}

# Fuehrt reap im Fixture aus. Ausgabe landet kombiniert in $output; ausgewertet werden
# ausschliesslich die AGENT-LOCK-Zeilen — ein ungefiltertes Substring-Match auf $output
# koennte schon vom Fixture-Pfad in einer Usage-Zeile erfuellt werden.
run_reap() {
  run bash -c "cd '$FIXTURE' && AGENT_LOCK_FETCH_TTL=0 bash '$LOCKSH' reap 2>&1"
}

@test "T002622: verwaister Worktree wird entfernt, Branch geloescht, Tag gesetzt" {
  run_reap

  # Resultat, nicht Ausgabe: das Verzeichnis ist weg.
  [ ! -d "$WT_ROOT/orphan" ]
  # Der Branch-Ref ist weg.
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/orphan-T009101
  [ "$status" -ne 0 ]
  # Das Sicherheitsnetz haelt den Commit fest.
  run git -C "$FIXTURE" rev-parse --verify --quiet "refs/tags/reaped/fix/orphan-T009101"
  [ "$status" -eq 0 ]
  [ "$output" = "$ORPHAN_SHA" ]
}

@test "T002622: reap benennt den entfernten Worktree auf stderr" {
  run_reap
  lines_agent="$(printf '%s\n' "$output" | grep '^AGENT-LOCK: ' || true)"
  [ "$(printf '%s\n' "$lines_agent" | grep -c 'fix/orphan-T009101')" -ge 1 ]
}

@test "T002622: aktiver Worktree mit lebendem Upstream ueberlebt und erzeugt keine Zeile" {
  run_reap

  # Positiv-Anker zuerst: ohne ihn ist die Ueberlebens-Aussage unten vakuos.
  [ ! -d "$WT_ROOT/orphan" ]

  [ -d "$WT_ROOT/active" ]
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/active-T009102
  [ "$status" -eq 0 ]

  lines_agent="$(printf '%s\n' "$output" | grep '^AGENT-LOCK: ' || true)"
  [ "$(printf '%s\n' "$lines_agent" | grep -c 'fix/active-T009102')" -eq 0 ]
}

@test "T002622: uncommittete Aenderungen blockieren die Entfernung und werden begruendet" {
  run_reap

  # Positiv-Anker.
  [ ! -d "$WT_ROOT/orphan" ]

  [ -d "$WT_ROOT/dirty" ]
  [ -f "$WT_ROOT/dirty/scratch.txt" ]
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/dirty-T009103
  [ "$status" -eq 0 ]

  run_reap
  skipped="$(printf '%s\n' "$output" | grep '^AGENT-LOCK: ' | grep 'fix/dirty-T009103\|/dirty' || true)"
  [ -n "$skipped" ]
}

@test "T002622: Branch ohne konfigurierten Upstream wird nie gereapt" {
  run_reap

  # Positiv-Anker.
  [ ! -d "$WT_ROOT/orphan" ]

  [ -d "$WT_ROOT/noupstream" ]
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/noupstream-T009104
  [ "$status" -eq 0 ]
}

@test "T002622: squash-gemergter Branch ohne Worktree wird nach denselben Kriterien gereapt" {
  run_reap

  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/nowt-T009105
  [ "$status" -ne 0 ]
  run git -C "$FIXTURE" rev-parse --verify --quiet "refs/tags/reaped/fix/nowt-T009105"
  [ "$status" -eq 0 ]
  [ "$output" = "$NOWT_SHA" ]
}

@test "T002622: reap loescht nie den Worktree, aus dem es selbst laeuft" {
  # orphan erfuellt alle Loeschkriterien — aber reap laeuft hier AUS diesem Worktree heraus.
  run bash -c "cd '$WT_ROOT/orphan' && AGENT_LOCK_FETCH_TTL=0 bash '$LOCKSH' reap 2>&1"

  [ -d "$WT_ROOT/orphan" ]
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/orphan-T009101
  [ "$status" -eq 0 ]

  # Positiv-Anker: die Stufe LAEUFT, sie verschont nur den eigenen Worktree — belegt daran,
  # dass der worktree-lose Kandidat im selben Lauf verschwunden ist.
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/nowt-T009105
  [ "$status" -ne 0 ]
}

@test "T002622: Branch mit lebendem agent-lock-Claim wird verschont" {
  # Claim auf den sonst reifen orphan-Branch legen.
  bash "$LOCKSH" claim branch fix/orphan-T009101 \
    --worktree "$WT_ROOT/orphan" --branch fix/orphan-T009101 --label test-guard

  run_reap

  [ -d "$WT_ROOT/orphan" ]
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/orphan-T009101
  [ "$status" -eq 0 ]

  # Positiv-Anker: der Lauf war wirksam, nur eben nicht auf dem geclaimten Branch.
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/fix/nowt-T009105
  [ "$status" -ne 0 ]
}
