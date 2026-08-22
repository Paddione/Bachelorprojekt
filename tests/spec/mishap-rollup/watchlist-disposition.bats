#!/usr/bin/env bats
# tests/spec/mishap-rollup/watchlist-disposition.bats — T013305 Mechanismus B
#
# PRUEFMODUS: OUTPUT-VERIFIKATION [T002448-M4]. Die Watchlist-Modi von
# rollup-carryover.sh werden gegen synthetische Zyklus-Plaene gefahren und das
# Template an rollup-plan-tasks.sh geprueft.
#
# Hintergrund: "kein Repo-Fix — Beobachtungspunkt" terminierte permanent —
# nichts beobachtete weiter (gemma12-MTP-Crash: Workaround 3 Tage Live-Stand).
# Die vierte Disposition 'beobachten (bis Zyklus <Datum>)' gibt dem Eintrag ein
# Ablaufdatum; der Generator nimmt ihn bis dahin in jeden Zyklus auf.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CARRY="$REPO_ROOT/scripts/factory/rollup-carryover.sh"
  PLAN_TASKS="$REPO_ROOT/scripts/factory/rollup-plan-tasks.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  mkdir -p "$WORK"
}

# Zwei abgeschlossene Zyklen: der junge haelt die lebende Beobachtung, der
# alte den abgelaufenen Eintrag.
_plan_with_watchlist() {
  local dir="$1"
  # [T013316 #10] Plaene liegen unter openspec/changes/ — der Scan-Suchort von _cycle_plans().
  mkdir -p "$dir/openspec/changes/mishap-incident-rollup-2026-08-21-T012973"
  cat > "$dir/openspec/changes/mishap-incident-rollup-2026-08-21-T012973/tasks.md" <<'EOF'
- [x] **1. MTP-Crash transient** (broken, llm-proxy) — Disposition: beobachten (bis Zyklus 2026-08-25), Workaround operativ
- [x] **3. Erledigt ohne Beobachtung** (drift, factory) — Disposition: kein Repo-Fix, einmalig
EOF
  mkdir -p "$dir/openspec/changes/mishap-incident-rollup-2026-08-20-T012909"
  cat > "$dir/openspec/changes/mishap-incident-rollup-2026-08-20-T012909/tasks.md" <<'EOF'
- [x] **2. Alter Beobachtungspunkt** (degraded, scs-embed) — Disposition: beobachten (bis Zyklus 2026-08-01), laengst abgelaufen
EOF
}

@test "das Plan-Template kennt die vierte Disposition beobachten" {
  run bash "$PLAN_TASKS" < /dev/null
  [ "$status" -eq 0 ]
  # Positiv-Anker: die drei etablierten Dispositionen sind weiterhin genannt ...
  printf '%s\n' "$output" | grep -qF 'kein Repo-Fix'
  # ... und die neue Disposition mit Ablaufdatum-Syntax.
  printf '%s\n' "$output" | grep -qF 'beobachten (bis Zyklus'
}

@test "lebende Watchlist-Eintraege werden als Batch zur Wiederaufnahme gerendert" {
  _plan_with_watchlist "$WORK"
  run bash "$CARRY" --watchlist-live "$WORK" --today 2026-08-22
  [ "$status" -eq 0 ]
  # Der lebende Eintrag ist im Flusher-Batch-Format ...
  printf '%s\n' "$output" | grep -qF '### Mishap-Rollup'
  printf '%s\n' "$output" | grep -qF 'MTP-Crash transient'
  # ... durch dieselbe Tuer wie ein Flusher-Batch zaehlbar ...
  printf '%s\n' "$output" > "$WORK/comment.txt"
  count="$(bash "$PLAN_TASKS" --count < "$WORK/comment.txt")"
  [ "$count" -eq 1 ]
  # ... und nennt seinen Quell-Zyklus.
  printf '%s\n' "$output" | grep -qF 'mishap-incident-rollup-2026-08-21-T012973'
}

@test "abgelaufene Watchlist-Eintraege gehen an die Eskalation, nicht in den Batch" {
  _plan_with_watchlist "$WORK"
  run bash "$CARRY" --watchlist-expired "$WORK" --today 2026-08-22
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'Alter Beobachtungspunkt'
  printf '%s\n' "$output" | grep -qF '2026-08-01'

  run bash "$CARRY" --watchlist-live "$WORK" --today 2026-08-22
  [ "$status" -eq 0 ]
  live_out="$(printf '%s\n' "$output")"
  # Positiv-Anker zuerst: der lebende Eintrag ist im Live-Batch ...
  printf '%s\n' "$live_out" | grep -qF 'MTP-Crash transient'
  # ... der abgelaufene NICHT.
  [ "$(printf '%s\n' "$live_out" | grep -cF 'Alter Beobachtungspunkt')" -eq 0 ]
}

@test "ein Zyklus ohne Watchlist-Eintraege liefert Exit 3 und leeren Output" {
  cat <<'EOF' > "$WORK/tasks.md"
- [x] **1. Normal erledigt** (drift, factory) — Disposition: gefixt, PR #1234
EOF
  run bash "$CARRY" --watchlist-live "$WORK" --today 2026-08-22
  [ "$status" -eq 3 ]
  [ "$(printf '%s' "$output" | tr -d '[:space:]')" = "" ]
}
