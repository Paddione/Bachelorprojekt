#!/usr/bin/env bats
# tests/spec/divergence-guard/main-checkout-foreign-guard.bats [T003078/T003097]
#
# PRUEFMODUS: Output-/Ergebnis-Verifikation (T002448-M4). Kein Source-Grep — jede
# Assertion haengt an tatsaechlichem Laufzeitverhalten: dem Exit-Code der
# Bibliotheksfunktion und, im Integrationstest, am *unveraenderten* Arbeitsbaum eines
# echten (Wegwerf-)Haupt-Checkouts nach einem `worktree-create.sh`-Lauf. Das ist die in
# T003078/T003097 verlangte Kernzusicherung: blieb der fremde Arbeitsbaum unangetastet?
#
# HINTERGRUND: T003055 beobachtete drei fremde Agent-Sessions (claude/opencode) mit
# uncommitteten Aenderungen im Haupt-Checkout, waehrend sowohl dev-flow-chore Schritt 0
# als auch der worktree-create.sh Divergence-Guard unbedingt `git stash` ausgefuehrt
# haetten. T003098 belegt am selben Vorfall, dass `agent-lock.sh list` eine Session vor
# ihrem ersten Commit nicht sieht — das gewaehlte Kriterium ist deshalb eine
# `ps`-Prozessliste mit `/proc/<pid>/cwd`-Zuordnung auf `claude`/`opencode`-Prozesse
# ausserhalb der eigenen Ancestor-Kette, kombiniert mit einem `git status --porcelain`
# dirty-Check (siehe design.md dieses Change).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD_LIB="$REPO_ROOT/scripts/lib/main-checkout-foreign-guard.sh"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
  FOREIGN_PID=""
}

teardown() {
  if [ -n "$FOREIGN_PID" ] && kill -0 "$FOREIGN_PID" 2>/dev/null; then
    kill -9 "$FOREIGN_PID" 2>/dev/null || true
  fi
}

# --- Unit-Ebene: die Bibliotheksfunktion direkt ---------------------------------------

@test "mc_foreign_activity_detected: positiver Anker — sauberer, fremdprozessfreier Checkout meldet false" {
  local d="${BATS_TEST_TMPDIR}/clean-repo"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" config user.email t@example.invalid
  git -C "$d" config user.name Test
  echo x > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm base

  # shellcheck disable=SC1090
  source "$GUARD_LIB"
  run mc_foreign_activity_detected "$d"
  [ "$status" -ne 0 ]
}

@test "mc_foreign_activity_detected: dirty checkout MIT fremdem claude-Prozess (cwd-Match) meldet true" {
  local d="${BATS_TEST_TMPDIR}/dirty-repo"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" config user.email t@example.invalid
  git -C "$d" config user.name Test
  echo x > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm base
  echo "uncommitted change" >> "$d/f.txt"

  # Fremden Prozess simulieren: argv[0]='claude', cwd = $d, laeuft ausserhalb unserer
  # eigenen Ancestor-Kette (eigenstaendiger Subshell-Hintergrundprozess).
  ( cd "$d" && exec -a claude sleep 30 ) &
  FOREIGN_PID=$!
  # kurz warten, bis der Kindprozess sein cwd tatsaechlich gesetzt hat
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(readlink "/proc/$FOREIGN_PID/cwd" 2>/dev/null)" = "$d" ] && break
    sleep 0.1
  done

  # shellcheck disable=SC1090
  source "$GUARD_LIB"
  run mc_foreign_activity_detected "$d"
  [ "$status" -eq 0 ]
}

@test "mc_foreign_activity_detected: dirty checkout OHNE fremden Prozess meldet false (Regressionsschutz)" {
  local d="${BATS_TEST_TMPDIR}/dirty-alone-repo"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" config user.email t@example.invalid
  git -C "$d" config user.name Test
  echo x > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm base
  echo "uncommitted change" >> "$d/f.txt"

  # shellcheck disable=SC1090
  source "$GUARD_LIB"
  run mc_foreign_activity_detected "$d"
  [ "$status" -ne 0 ]
}

@test "mc_foreign_activity_detected: erkennt den Fremdprozess auch bei gepolsterter ps-Spalte [T003078]" {
  # REGRESSION: `ps -eo pid=` richtet die Spalte rechts aus und polstert auf die Breite
  # von /proc/sys/kernel/pid_max. Blieb die Polsterung im gelesenen Wert stehen, war jeder
  # daraus gebaute Pfad ungueltig (`/proc/   7219/cwd`) und die Erkennung verwarf JEDEN
  # Prozess ungeprueft. Ob das auffiel, hing allein an der Maschine: sind die eigenen PIDs
  # schon so breit wie pid_max (lang laufende Instanz), entsteht keine Polsterung und der
  # Defekt bleibt unsichtbar — auf einem frischen CI-Runner mit kurzen PIDs schlug er zu.
  # Dieser Test erzwingt die Polsterung per ps-Stub und ist damit unabhaengig davon, welche
  # PID-Breite die ausfuehrende Maschine gerade vergibt.
  local d="${BATS_TEST_TMPDIR}/padded-repo"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" config user.email t@example.invalid
  git -C "$d" config user.name Test
  echo x > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm base
  echo "uncommitted change" >> "$d/f.txt"

  # ps-Stub: polstert AUSSCHLIESSLICH die `-eo pid=`-Form auf und delegiert alles andere
  # an das echte ps (die Funktion braucht auch `-o ppid=` und `-o args=`).
  local real_ps stub_dir="${BATS_TEST_TMPDIR}/stub-bin"
  real_ps="$(command -v ps)"
  mkdir -p "$stub_dir"
  cat > "$stub_dir/ps" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-eo" ] && [ "\$2" = "pid=" ]; then
  "$real_ps" -eo pid= | awk '{printf "%12s\n", \$1}'
  exit 0
fi
exec "$real_ps" "\$@"
STUB
  chmod +x "$stub_dir/ps"
  PATH="$stub_dir:$PATH"

  # Anker 1: der Stub greift wirklich — sonst pruefte dieser Test die Polsterung gar nicht
  # und waere vakuos gruen, sobald der Stub-Pfad einmal nicht mehr zieht.
  run bash -c 'ps -eo pid= | head -1'
  [ "$status" -eq 0 ]
  [[ "$output" == "         "* ]]

  ( cd "$d" && exec -a claude sleep 30 ) &
  FOREIGN_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(readlink "/proc/$FOREIGN_PID/cwd" 2>/dev/null)" = "$d" ] && break
    sleep 0.1
  done

  # Anker 2: die eigentliche Zusicherung — trotz Polsterung wird erkannt.
  # shellcheck disable=SC1090
  source "$GUARD_LIB"
  run mc_foreign_activity_detected "$d"
  [ "$status" -eq 0 ]
}

# --- Integrations-Ebene: worktree-create.sh laesst den fremden Checkout unangetastet ---

@test "worktree-create.sh: Haupt-Checkout bleibt unveraendert, wenn dirty UND fremder claude-Prozess dort aktiv ist" {
  ORIGIN="${BATS_TEST_TMPDIR}/origin.git"
  CLONE="${BATS_TEST_TMPDIR}/clone"

  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$CLONE"
  git -C "$CLONE" config user.email t@example.invalid
  git -C "$CLONE" config user.name Test
  git -C "$CLONE" config commit.gpgsign false

  echo "zeile-eins" > "$CLONE/shared.txt"
  git -C "$CLONE" add shared.txt
  git -C "$CLONE" commit -qm base
  git -C "$CLONE" branch -M main
  git -C "$CLONE" push -q origin main

  # origin bekommt einen weiteren Commit -> lokales main in CLONE liegt zurueck.
  local upstream="${BATS_TEST_TMPDIR}/upstream"
  git clone -q -b main "$ORIGIN" "$upstream"
  git -C "$upstream" config user.email t@example.invalid
  git -C "$upstream" config user.name Test
  git -C "$upstream" config commit.gpgsign false
  echo "zeile-zwei" >> "$upstream/shared.txt"
  git -C "$upstream" commit -qam "remote-commit"
  git -C "$upstream" push -q origin main

  git -C "$CLONE" fetch -q origin

  # Dirty im Haupt-Checkout (uncommittete Aenderung, die ein Stash-Konflikt verursachen
  # wuerde, liefe der Sync unbedingt).
  echo "uncommittete-lokale-aenderung" >> "$CLONE/shared.txt"
  local dirty_before
  dirty_before="$(git -C "$CLONE" status --porcelain)"
  local content_before
  content_before="$(cat "$CLONE/shared.txt")"

  # Fremden claude-Prozess mit cwd=CLONE starten.
  ( cd "$CLONE" && exec -a claude sleep 30 ) &
  FOREIGN_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(readlink "/proc/$FOREIGN_PID/cwd" 2>/dev/null)" = "$CLONE" ] && break
    sleep 0.1
  done

  run env WT_SKIP_NAME_CHECK=1 bash -c \
    "cd '$CLONE' && bash '$SCRIPT' fix/probe-T009999 '${BATS_TEST_TMPDIR}/wt-probe'"

  [ "$status" -eq 0 ]
  [[ "$output" == *"ready on"* ]]
  # Kernzusicherung: der Haupt-Checkout ist byte-identisch zu vorher — kein Stash,
  # kein Pop-Konflikt, keine verschluckte fremde Aenderung.
  local dirty_after content_after
  dirty_after="$(git -C "$CLONE" status --porcelain)"
  content_after="$(cat "$CLONE/shared.txt")"
  [ "$dirty_after" = "$dirty_before" ]
  [ "$content_after" = "$content_before" ]
  # Kein Stash-Eintrag darf entstanden sein.
  run git -C "$CLONE" stash list
  [ -z "$output" ]
}
