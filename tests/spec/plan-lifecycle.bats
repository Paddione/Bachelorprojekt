#!/usr/bin/env bats
# tests/spec/plan-lifecycle.bats — Delete-Guards: kein Plan-Delete ohne
# verifizierten DB-Record in tickets.ticket_plans (fail-closed) [T900999-P3].
#
# Pruefmodus: COMMAND OUTPUT VERIFICATION. Jeder Test faehrt
# scripts/branch-reaper.sh (--sweep --plan-cleanup --dry-run) bzw.
# scripts/devflow-post-merge-finalize.sh gegen ein Wegwerf-Git-Repo in
# BATS_TEST_TMPDIR; ticket.sh und gh sind Stubs (kein Cluster, kein Netz).
# scripts/plan-lint.sh dient nur lesend als Referenz und wird NICHT geaendert.
#
# Failing-Test-Protokoll: auf dem Alt-Stand (origin/main, ohne --plan-cleanup /
# ohne Receipt-Idempotenz) scheitern die Fall-A/B/C/F-Tests mit
# "FEHLER: unbekanntes Argument '--plan-cleanup'" bzw. fehlender
# Receipt-idempotent-Zeile (expected: FAIL); auf dem Implementierungsstand sind
# alle Tests gruen (GREEN-Nachweis im Ticket).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  REAPER="${REAPER_OVERRIDE:-$PROJECT_DIR/scripts/branch-reaper.sh}"
  FINALIZE="$PROJECT_DIR/scripts/devflow-post-merge-finalize.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  # Zwei Plan-Ordner auf origin/main, je mit ticket_id-Frontmatter.
  mkdir -p "$FIXTURE/.agents/plans/demo-done" "$FIXTURE/.agents/plans/demo-open"
  printf -- '---\ntitle: Demo\nticket_id: T009001\ndomains: [x]\nstatus: completed\n---\n' > "$FIXTURE/.agents/plans/demo-done/tasks.md"
  printf -- '---\ntitle: Open\nticket_id: T009004\ndomains: [x]\nstatus: active\n---\n' > "$FIXTURE/.agents/plans/demo-open/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" -c commit.gpgsign=false commit --quiet -m "seed"
  git -C "$FIXTURE" push --quiet origin HEAD:main
  git -C "$FIXTURE" fetch --quiet origin
  git -C "$FIXTURE" checkout --quiet main

  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009004 ist offen, alle anderen done. get-timeline meldet
  # einen plan_archived-Record NUR fuer T009001/demo-done (Fall B); T009002 ist
  # done aber OHNE Record (Fall A); T009003 meldet einen Record mit FALSCHEM
  # Slug (Fall C: unverifiziert/ungueltig).
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "get" ]; then
  for a in "$@"; do [ "$a" = "T009004" ] && { echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; }; done
  echo '{"status":"done"}'; exit 0
fi
if [ "$1" = "get-timeline" ]; then
  for a in "$@"; do
    [ "$a" = "T009001" ] && { echo '{"events":[{"source":"plan_archived","detail":{"slug":"demo-done"}}]}'; exit 0; }
    [ "$a" = "T009003" ] && { echo '{"events":[{"source":"plan_archived","detail":{"slug":"fremder-slug"}}]}'; exit 0; }
  done
  echo '{"events":[]}'; exit 0
fi
echo '{}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

# Positiv-Anker: der lesende Sweep läuft durch und benennt Plan-Kandidaten. Ohne
# ihn wären die KEEP/REAP-Aussagen unten vakuos (leere Ausgabe erfüllt jedes
# "kommt nicht vor").
@test "T900999-P3 Positiv-Anker: --sweep --plan-cleanup --dry-run laeuft und nennt Plan-Kandidaten" {
  run bash "$REAPER" --sweep --plan-cleanup --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -c '^\(REAP\|KEEP\) PLAN ')" -ge 1 ]
}

@test "T900999-P3 Fall A: done-Ticket OHNE Record -> Delete verweigert (exit 0, KEEP, Ordner bleibt)" {
  # demo-done ist done — aber der Stub meldet den Record nur fuer T009001; hier
  # wird T009002 (done, kein Record) simuliert, indem demo-done auf T009002 zeigt.
  sed -i 's/ticket_id: T009001/ticket_id: T009002/' "$FIXTURE/.agents/plans/demo-done/tasks.md"
  git -C "$FIXTURE" -c commit.gpgsign=false commit --quiet -am "reticket"
  git -C "$FIXTURE" push --quiet origin HEAD:main
  git -C "$FIXTURE" fetch --quiet origin
  run bash "$REAPER" --sweep --plan-cleanup --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP PLAN ' | grep 'demo-done' || true)" ]
  [ "$(printf '%s\n' "$output" | grep '^REAP PLAN ' | grep -c 'demo-done' || true)" -eq 0 ]
  [ -f "$FIXTURE/.agents/plans/demo-done/tasks.md" ]
}

@test "T900999-P3 Fall B: done-Ticket MIT verifiziertem Record -> Delete erlaubt (REAP PLAN)" {
  run bash "$REAPER" --sweep --plan-cleanup --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^REAP PLAN ' | grep 'demo-done' || true)" ]
}

@test "T900999-P3 Fall C: Record mit falschem Slug -> Delete verweigert" {
  sed -i 's/ticket_id: T009001/ticket_id: T009003/' "$FIXTURE/.agents/plans/demo-done/tasks.md"
  git -C "$FIXTURE" -c commit.gpgsign=false commit --quiet -am "reticket"
  git -C "$FIXTURE" push --quiet origin HEAD:main
  git -C "$FIXTURE" fetch --quiet origin
  run bash "$REAPER" --sweep --plan-cleanup --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP PLAN ' | grep 'demo-done' || true)" ]
  [ "$(printf '%s\n' "$output" | grep '^REAP PLAN ' | grep -c 'demo-done' || true)" -eq 0 ]
}

@test "T900999-P3: offenes Ticket -> Plan-Ordner wird verschont" {
  run bash "$REAPER" --sweep --plan-cleanup --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP PLAN ' | grep 'demo-open' || true)" ]
  [ "$(printf '%s\n' "$output" | grep '^REAP PLAN ' | grep -c 'demo-open' || true)" -eq 0 ]
}

@test "T900999-P3: --plan-cleanup ohne --sweep wird abgelehnt (kein Einzel-Pfad)" {
  run bash "$REAPER" --plan-cleanup --repo "$FIXTURE"
  [ "$status" -ne 0 ]
}

@test "T900999-P4: archive-plan --reason bogus scheitert validiert (exit 2, ohne Cluster)" {
  run bash "$PROJECT_DIR/scripts/ticket.sh" archive-plan --id T009001 --slug s --branch b --plan-file "$FIXTURE/.agents/plans/demo-done/tasks.md" --reason bogus
  [ "$status" -eq 2 ]
}
