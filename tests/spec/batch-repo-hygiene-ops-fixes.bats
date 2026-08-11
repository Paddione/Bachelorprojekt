#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
# tests/spec/batch-repo-hygiene-ops-fixes.bats — Batch T003490 (repo-hygiene-ops §1-§3 Fixes)
#
# Deckt die sechs Defekte der Kind-Tickets ab:
#   T003074  branch-reaper --sweep ohne --ticket (Sweep über ALLE Remote-Heads)
#   T003183  §2 [gone]-Prune-Reihenfolge + Archiv-Tag-Signal
#   T003181  §3 merge-tree Konfliktprobe statt invasivem Arbeitsbaum-Merge
#   T003224  §3/ci-watch: cancelled ≠ fail (Gegenprobe auf Job-Ebene)
#   T003225  ci-watch: statusCheckRollup nur für den aktuellen head-SHA
#   T003227  §1/cron: Factory-Tick-Vorcheck (tick_running) vor der Worktree-Messung
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION (branch-reaper-Tests gegen Wegwerf-Repo,
# devflow-ci-watch gegen gh/ticket.sh-Stubs, Runbook-Texte per Marker-Grep).
# Runbook-Aussagen (T003183/T003181/T003227-Doku) sind Textverträge — ihr Defekt
# ist die FEHLENDE dokumentierte Prozedur, also wird die Anwesenheit geprüft.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WORK="$(mktemp -d)"
  export MARKER_DIR="$WORK/markers"
  mkdir -p "$MARKER_DIR" "$WORK/bin" "$WORK/scripts"
}

teardown() {
  rm -rf "$WORK"
}

# ─────────────────────────────────────────────────────────────────────────────
# T003074 — Reaper-Sweep (p1)
# ─────────────────────────────────────────────────────────────────────────────

_reaper_fixture() {
  FIXTURE="$WORK/fixture"
  REMOTE="$WORK/remote.git"
  STUBS="$WORK/stubs"
  mkdir -p "$STUBS" "$FIXTURE/openspec/changes/x"

  git init --bare --quiet "$REMOTE"
  git -C "$FIXTURE" init --quiet
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"
  echo base > "$FIXTURE/openspec/changes/x/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m base
  git -C "$FIXTURE" push --quiet origin HEAD:main

  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$FIXTURE/openspec/changes/x/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/plan-T009001   # Ticket done -> Sweep-Kandidat
  _branch chore/plan-T009002   # Ticket done, ANDERE ID -> zweiter Kandidat

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"
  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T003074 Positiv-Anker: --sweep ohne --ticket listet ALLE Remote-Heads mit REAP" {
  _reaper_fixture
  run env -C "$WORK" bash "$PROJECT_DIR/scripts/branch-reaper.sh" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'T009001')" -eq 1 ] || { echo "T009001 nicht gereapt: $output"; false; }
  [ "$(printf '%s\n' "$reaped" | grep -c 'T009002')" -eq 1 ] || { echo "T009002 nicht gereapt (Sweep filtert auf EINE ID?): $output"; false; }
}

@test "T003074: leerer Sweep-Bestand ist von Fehlschlag unterscheidbar (explizite Meldung, Exit 0)" {
  _reaper_fixture
  # Kein Branch hat einen done/archived-Ticket-Status -> keine REAP-Kandidaten
  cat > "$WORK/stubs/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"in_progress"}'
STUB
  chmod +x "$WORK/stubs/ticket-stub.sh"
  run env -C "$WORK" bash "$PROJECT_DIR/scripts/branch-reaper.sh" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -c '^REAP ')" -eq 0 ]
  printf '%s\n' "$output" | grep -q "keine verwaisten Branches gefunden" || { echo "keine explizite Leer-Meldung: $output"; false; }
}

# ─────────────────────────────────────────────────────────────────────────────
# T003183 — §2 [gone]-Prune-Reihenfolge + Archiv-Tag (p2, Runbook-Textvertrag)
# ─────────────────────────────────────────────────────────────────────────────

@test "T003183: Runbook §2 dokumentiert Reaper VOR [gone]-Prune und Archiv-Tag-Signal" {
  RUNBOOK="$PROJECT_DIR/.claude/skills/references/repo-hygiene-ops.md"
  [ -f "$RUNBOOK" ] || { echo "Runbook fehlt"; false; }
  grep -q "refs/tags/reaped/<branch>" "$RUNBOOK" || { echo "Archiv-Tag-Signal fehlt in §2"; false; }
  grep -q "Reaper VOR \[gone\]-Prune" "$RUNBOOK" || { echo "Reihenfolge-Regel fehlt"; false; }
  grep -q "rev-parse --verify --quiet \"refs/tags/reaped/\$b\"" "$RUNBOOK" || { echo "Archiv-Tag im [gone]-Loop fehlt"; false; }
}

# ─────────────────────────────────────────────────────────────────────────────
# T003181 — §3 merge-tree Konfliktprobe (p2, Runbook-Textvertrag + Verhalten)
# ─────────────────────────────────────────────────────────────────────────────

@test "T003181: Runbook §3 nutzt merge-tree --write-tree als primäre Konfliktprobe" {
  RUNBOOK="$PROJECT_DIR/.claude/skills/references/repo-hygiene-ops.md"
  grep -q "git merge-tree --write-tree --name-only" "$RUNBOOK" || { echo "merge-tree-Probe fehlt in §3"; false; }
  # Der invasive Arbeitsbaum-Merge darf nicht mehr als Primärweg dastehen: der
  # Verweis auf die --no-commit-Probe muss als Ausnahme gekennzeichnet sein.
  grep -q "Konfliktmarker im Working" "$RUNBOOK" || { echo "Invasiv-Merge ist nicht als Ausnahme markiert"; false; }
  grep -q "nicht der Primärweg" "$RUNBOOK" || { echo "Invasiv-Merge ist nicht als Ausnahme markiert"; false; }
}

@test "T003181: merge-tree --write-tree mutiert weder Working Tree noch Index" {
  A="$WORK/a" && B="$WORK/b"
  git init --quiet -b main "$A"
  git -C "$A" config user.email t@example.com
  git -C "$A" config user.name Test
  echo one > "$A/f.txt"
  git -C "$A" add -A && git -C "$A" commit --quiet -m one
  # Konfliktfreier Abzweig: Branch B ändert eine Datei, main nicht
  git -C "$A" checkout --quiet -b side
  echo two > "$A/f.txt"
  git -C "$A" commit --quiet -am two
  git -C "$A" checkout --quiet main
  git clone --quiet --no-hardlinks "$A" "$B" 2>/dev/null || git clone --quiet "$A" "$B"
  git -C "$B" checkout --quiet -b side origin/side
  # dirty Working Tree im Normalfall simulieren
  echo dirty > "$B/untracked.txt"
  BEFORE="$(git -C "$B" status --porcelain)"
  out="$(git -C "$B" merge-tree --write-tree --name-only main side 2>&1)"
  rc=$?
  [ "$rc" -eq 0 ] || { echo "merge-tree meldet Konflikt im konfliktfreien Fall: $out"; false; }
  [ "$(git -C "$B" status --porcelain)" = "$BEFORE" ] || { echo "merge-tree hat den Working Tree verändert"; false; }
}

# ─────────────────────────────────────────────────────────────────────────────
# T003224 / T003225 — devflow-ci-watch: cancelled≠fail + headSha-Filter (p3)
# ─────────────────────────────────────────────────────────────────────────────

_setup_ciwatch() {
  # Fixture: Mini-Repo + gh/ticket.sh-Stubs (Muster aus devflow-ci-watch-merged-exit.bats)
  git -C "$WORK" init -q -b main
  git -C "$WORK" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init
  export HEAD_SHA="${1:-aaaa1111}"

  cat > "$WORK/scripts/ticket.sh" <<'TICKET_EOF'
#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
exit 0
TICKET_EOF
  chmod +x "$WORK/scripts/ticket.sh"

  # ROLLUP_FILE enthält das rohe statusCheckRollup-JSON; der Stub wendet die
  # headSha-Filter-Query an — die Query selbst wird über gh-calls geprüft.
  cat > "$WORK/bin/gh" <<GH_EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$MARKER_DIR/gh-calls"
args="\$*"
case "\$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") echo "OPEN" ;;
  *"checks --watch"*) touch "$MARKER_DIR/watch-called"; exit 0 ;;
  *"--json headRefOid -q .headRefOid"*) echo "\$HEAD_SHA" ;;
  *"--json headRefOid,statusCheckRollup"*)
    jq -c '. as \$p | \$p.statusCheckRollup[] | select(.headSha == \$p.headRefOid) | select((.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT") | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")' "$WORK/rollup.json" 2>/dev/null || true ;;
  *"run list --branch"*) cat "$WORK/runs.json" 2>/dev/null || echo '[]' ;;
  *"actions/runs/"*"/jobs"*) cat "$WORK/jobs-count.txt" 2>/dev/null || echo "1" ;;
  *"check-runs"*"total_count"*) echo "3" ;;
  *) echo "" ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"
}

@test "T003225 Positiv-Anker: nur Checks des aktuellen head-SHA zählen (fremde head-SHAs = grün)" {
  _setup_ciwatch "aaaa1111"
  cat > "$WORK/rollup.json" <<'JSON'
{"headRefOid":"aaaa1111","statusCheckRollup":[
  {"headSha":"ffff9999","conclusion":"FAILURE","name":"alter-check","detailsUrl":"u1"},
  {"headSha":"ffff9999","conclusion":"TIMED_OUT","name":"alter-check-2","detailsUrl":"u2"}
]}
JSON
  echo '[]' > "$WORK/runs.json"
  echo "1" > "$WORK/jobs-count.txt"
  run env -C "$WORK" PATH="$WORK/bin:$PATH" bash "$PROJECT_DIR/scripts/devflow-ci-watch.sh" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  # Die vom Skript an gh übergebene Query MUSS den headSha-Filter enthalten
  grep -q 'headSha == \$p.headRefOid' "$MARKER_DIR/gh-calls" || { echo "headSha-Filter fehlt in gh-Query: $(cat "$MARKER_DIR/gh-calls")"; false; }
  printf '%s\n' "$output" | grep -q "alle grün" || { echo "fremde head-SHAs wurden als Fehler gewertet: $output"; false; }
}

@test "T003225: conclusion=\"\" (laufend) ist kein Fehler" {
  _setup_ciwatch "aaaa1111"
  cat > "$WORK/rollup.json" <<'JSON'
{"headRefOid":"aaaa1111","statusCheckRollup":[
  {"headSha":"aaaa1111","conclusion":"","status":"IN_PROGRESS","name":"laufend","detailsUrl":"u1"}
]}
JSON
  echo '[]' > "$WORK/runs.json"
  run env -C "$WORK" PATH="$WORK/bin:$PATH" bash "$PROJECT_DIR/scripts/devflow-ci-watch.sh" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "laufender Check wurde als Fehler gewertet (Exit $status): $output"; false; }
}

@test "T003224: aggregierter failure-Run ohne failure-Jobs (cancelled/skipped) ist kein Codefehler" {
  _setup_ciwatch "aaaa1111"
  cat > "$WORK/rollup.json" <<'JSON'
{"headRefOid":"aaaa1111","statusCheckRollup":[
  {"headSha":"aaaa1111","conclusion":"FAILURE","name":"ci","detailsUrl":"u1"}
]}
JSON
  # Run am aktuellen HEAD meldet failure, aber 0 Jobs mit conclusion=failure
  cat > "$WORK/runs.json" <<'JSON'
[{"databaseId":42,"headSha":"aaaa1111","status":"completed","conclusion":"failure"}]
JSON
  echo "0" > "$WORK/jobs-count.txt"
  run env -C "$WORK" PATH="$WORK/bin:$PATH" bash "$PROJECT_DIR/scripts/devflow-ci-watch.sh" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "cancelled/skipped wurde als failure gewertet (Exit $status): $output"; false; }
  # Gegenprobe auf Job-Ebene muss tatsächlich aufgerufen worden sein
  grep -q "actions/runs/42/jobs" "$MARKER_DIR/gh-calls" || { echo "Job-Gegenprobe fehlt: $(cat "$MARKER_DIR/gh-calls")"; false; }
}

# ─────────────────────────────────────────────────────────────────────────────
# T003227 — Factory-Tick-Vorcheck (p2-Runbook + p4 repo-hygiene-cron.sh)
# ─────────────────────────────────────────────────────────────────────────────

@test "T003227: Runbook §1 dokumentiert den Factory-Tick-Vorcheck (tick_running)" {
  RUNBOOK="$PROJECT_DIR/.claude/skills/references/repo-hygiene-ops.md"
  grep -q "tick_running" "$RUNBOOK" || { echo "tick_running-Vorcheck fehlt in §1"; false; }
  grep -q "/tmp/factory-tick.lock" "$RUNBOOK" || { echo "Lock-Pfad fehlt"; false; }
}

@test "T003227: repo-hygiene-cron.sh überspringt die Worktree-Messung bei tick_running=true" {
  # Fixture-Basis AUSSERHALB von /tmp — der Cron überspringt Worktree-Pfade unter
  # /tmp/*, der Test will aber zählen, dass die Sektion übersprungen wird.
  CRON_BASE="$(mktemp -d /var/tmp/bats-cron-XXXXXX)"
  FIXTURE="$CRON_BASE/fixture"
  WTPATH="$CRON_BASE/wt"
  REMOTE="$CRON_BASE/remote.git"

  git init --bare --quiet "$REMOTE"
  git init --quiet -b main "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"
  echo base > "$FIXTURE/base.txt"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m base
  git -C "$FIXTURE" push --quiet origin HEAD:main
  git -C "$FIXTURE" worktree add --quiet -b feature/x "$WTPATH"

  # gh-Stub: keine offenen PRs
  cat > "$WORK/bin/gh" <<'GH_EOF'
#!/usr/bin/env bash
echo '[]'
GH_EOF
  chmod +x "$WORK/bin/gh"

  # tick_running=true simulieren: Lock-Datei existiert UND ist gehalten.
  # flock -w begrenzt die Wartezeit: hält eine echte Factory den Lock, blockt
  # der Subshell-Flock nicht endlos. stdout/stderr auf /dev/null: überlebt ein
  # verwaister Flock-Kindprozess den kill, hält er die Bats-Output-Pipe nicht
  # offen (sonst hängt die Suite am Testende).
  ( flock -w 10 -x 9; sleep 30 ) 9>/tmp/factory-tick.lock >/dev/null 2>&1 &
  TMP_LOCK_PID=$!
  sleep 0.2

  run --separate-stderr env -C "$WORK" PATH="$WORK/bin:$PATH" REPO_DIR="$FIXTURE" AGENT_LOCK_DIR="$WORK/locks" \
    bash "$PROJECT_DIR/scripts/repo-hygiene-cron.sh" standard
  kill "$TMP_LOCK_PID" 2>/dev/null || true
  wait "$TMP_LOCK_PID" 2>/dev/null || true
  rm -rf "$CRON_BASE"

  [ "$status" -eq 0 ] || { echo "cron fehlgeschlagen (Exit $status): $output"; false; }
  skipped="$(printf '%s\n' "$output" | jq -r '.metrics.worktrees.skipped // 0' 2>/dev/null || echo 0)"
  [ "$skipped" -ge 1 ] || { echo "Worktree-Sektion wurde bei tick_running=true NICHT übersprungen (skipped=$skipped): $output"; false; }
}
