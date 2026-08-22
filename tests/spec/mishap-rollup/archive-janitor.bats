#!/usr/bin/env bats
# tests/spec/mishap-rollup/archive-janitor.bats — T013305 Mechanismus D
#
# PRUEFMODUS: OUTPUT-VERIFIKATION [T002448-M4] mit Status-Override. Der Janitor
# liest den Ticketstatus ueber ROLLUP_JANITOR_STATUS_CMD (Test-Idiom: injizierter
# Befehl statt kubectl/psql) und wird gegen einen synthetischen Changes-Baum
# gefahren.
#
# Hintergrund: Archivierung war session-owned Prosa — die letzten vier
# abgeschlossenen Zyklen lagen unarchiviert. Der Janitor scannt maschine-owned:
# Ticket done/archived + Dir noch in openspec/changes/ → move nach archive/.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  JAN="$REPO_ROOT/scripts/factory/rollup-archive-janitor.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  mkdir -p "$WORK"
}

_status_cmd() {
  local dir="$1"
  cat > "$dir/status.sh" <<'STUBEOF'
#!/usr/bin/env bash
case "$1" in
  T012445) echo "done" ;;
  T012909) echo "done" ;;
  T013107) echo "plan_staged" ;;
  *)       echo "" ;;
esac
STUBEOF
  chmod +x "$dir/status.sh"
}

@test "done-Zyklen werden fuer das Archiv gemeldet, aktive bleiben unberuehrt" {
  _status_cmd "$WORK"
  mkdir -p "$WORK/repo/openspec/changes/mishap-incident-rollup-2026-08-19-T012445"
  printf 'T012445' > "$WORK/repo/openspec/changes/mishap-incident-rollup-2026-08-19-T012445/.ticket"
  mkdir -p "$WORK/repo/openspec/changes/mishap-incident-rollup-2026-08-22-T013107"
  printf 'T013107' > "$WORK/repo/openspec/changes/mishap-incident-rollup-2026-08-22-T013107/.ticket"

  ROLLUP_JANITOR_STATUS_CMD="$WORK/status.sh" \
    run bash "$JAN" --scan "$WORK/repo"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der done-Zyklus ist mit seinem Archiv-Ziel dabei ...
  printf '%s\n' "$output" | grep -qF 'mishap-incident-rollup-2026-08-19-T012445'
  printf '%s\n' "$output" | grep -qF 'archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445'
  # ... der aktive Zyklus (Container nicht done) nicht.
  [ "$(printf '%s\n' "$output" | grep -cF 'T013107')" -eq 0 ]
}

@test "bereits archivierte Dirs kommen nicht erneut in den Scan" {
  _status_cmd "$WORK"
  local root="$WORK/repo2"
  mkdir -p "$root/openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445"
  printf 'T012445' > "$root/openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445/.ticket"

  ROLLUP_JANITOR_STATUS_CMD="$WORK/status.sh" \
    run bash "$JAN" --scan "$root"
  [ "$status" -eq 3 ]
}

@test "--apply verschiebt den done-Zyklus nach archive/<datum>-<slug>" {
  _status_cmd "$WORK"
  local root="$WORK/repo3"
  mkdir -p "$root"
  git -C "$root" init -q
  git -C "$root" config user.email t@t && git -C "$root" config user.name t
  mkdir -p "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909"
  printf 'T012909' > "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909/.ticket"
  printf 'x' > "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909/tasks.md"
  git -C "$root" add -A && git -C "$root" commit -qm init

  ROLLUP_JANITOR_STATUS_CMD="$WORK/status.sh" \
    run bash "$JAN" --apply "$root"
  [ "$status" -eq 0 ]
  [ -d "$root/openspec/changes/archive/2026-08-20-mishap-incident-rollup-2026-08-20-T012909" ]
  [ ! -d "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909" ]
}
