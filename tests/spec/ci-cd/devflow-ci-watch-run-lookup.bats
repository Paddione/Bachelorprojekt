#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats
# SSOT: openspec/specs/ci-cd.md
#
# T014466: Die T003224-Gegenprobe in scripts/devflow-ci-watch.sh soll aggregierte
# failure-Checks entschaerfen, deren Jobs in Wahrheit cancelled/skipped sind. Sie
# suchte den zugehoerigen Run ueber
#     gh run list --branch "$(git rev-parse --abbrev-ref HEAD)"
# also ueber den Branch im cwd DES AUFRUFERS. dev-flow-execute ruft das Skript
# aber ausdruecklich aus dem Haupt-Checkout auf (Schritt 3.8/5.5: cd "$MAIN_REPO"),
# wo main ausgecheckt ist — nicht der PR-Branch. Der Lookup fand dann keinen
# failure-Run, der else-Zweig las "nicht gefunden" als "kein Codefehler" und
# setzte FAILED_CHECKS="". Ergebnis: "alle gruen" mit exit 0 bei rotem CI.
#
# Beobachtet an PR #5081 (T013916) am 2026-08-23: ci-watch meldete "18 CI-Checks,
# alle gruen" (rc=0), waehrend gh pr view mergeStateStatus=BLOCKED und zwei
# FAILURE-Checks fuehrte. Nur die manuelle Gegenpruefung deckte es auf.
#
# PRUEFMODUS: Output-Verifikation ueber einen gh-Stub im PATH — geprueft werden
# Exit-Code und Meldung, nicht der Quelltext.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/devflow-ci-watch.sh"

  WORK="$(mktemp -d)"
  export MARKER_DIR="$WORK/markers"
  mkdir -p "$MARKER_DIR" "$WORK/bin" "$WORK/scripts"

  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo "" > "$MARKER_DIR/mock-rollup-failures"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"
  echo "" > "$MARKER_DIR/mock-check-runs-failures"
  echo "2" > "$MARKER_DIR/mock-total-checks"
  echo "feature/stub-branch" > "$MARKER_DIR/mock-head-ref-name"

  # Fake git repo: `git rev-parse` (run-list-Branch und headRefOid-Default)
  # muss im Test-Workdir aufloesen.
  git -C "$WORK" init -q -b main
  git -C "$WORK" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init

  cat > "$WORK/scripts/ticket.sh" <<'TICKET_EOF'
#!/usr/bin/env bash
case "$1" in
  assert-phase-chain) exit 0 ;;
  *) exit 0 ;;
esac
TICKET_EOF
  chmod +x "$WORK/scripts/ticket.sh"

  # Fake gh — Marker-Dateien unter $MARKER_DIR/:
  #   pr-state                 → `gh pr view --json state -q .state`
  #   mock-head-ref-oid        → `gh pr view --json headRefOid` (default: WORK-HEAD)
  #   mock-total-checks        → check-runs total_count
  #   mock-check-runs-failures → post-jq-Output der check-runs-Abfrage auf
  #                              failure/timed_out-conclusions (Fix-Pfad)
  #   mock-rollup-failures     → post-jq-Output des ALTEN Rollup-Selectors (vor Fix)
  #   mock-rollup-pending      → post-jq-Output der PENDING_COUNT-Abfrage
  #   mock-run-list            → JSON fuer `gh run list` (Gegenprobe T003224)
  #   mock-jobs-failures       → post-jq-Zahl echter failure-Jobs
  cat > "$WORK/bin/gh" <<GH_EOF
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") cat "$MARKER_DIR/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefName -q .headRefName")
    # [T014466] Der Fix bindet den Run-Lookup an den PR-Branch statt an den
    # lokalen. Der Stub liefert ihn aus einer Marker-Datei, damit der Test den
    # Fall "Branch nicht bestimmbar" gezielt herstellen kann.
    cat "$MARKER_DIR/mock-head-ref-name" 2>/dev/null || echo "feature/stub-branch"
    ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "$MARKER_DIR/mock-head-ref-oid" ]]; then
      cat "$MARKER_DIR/mock-head-ref-oid"
    else
      git -C "$WORK" rev-parse HEAD
    fi
    ;;
  *"pr checks"*"--watch"*) exit 0 ;;
  *"--json statusCheckRollup"*)
    if [[ "\$args" == *'"FAILURE"'* || "\$args" == *'"TIMED_OUT"'* ]]; then
      cat "$MARKER_DIR/mock-rollup-failures" 2>/dev/null || true
    elif [[ "\$args" == *'"COMPLETED"'* || "\$args" == *'COMPLETED'* ]]; then
      cat "$MARKER_DIR/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    cat "$MARKER_DIR/mock-total-checks"
    ;;
  *"check-runs"*"failure"*)
    cat "$MARKER_DIR/mock-check-runs-failures" 2>/dev/null || true
    ;;
  *"run list"*)
    cat "$MARKER_DIR/mock-run-list" 2>/dev/null || echo "[]"
    ;;
  *"actions/runs"*"jobs"*)
    cat "$MARKER_DIR/mock-jobs-failures" 2>/dev/null || echo "0"
    ;;
  *) echo "" ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"
}

teardown() {
  rm -rf "$WORK"
}

# ── Positiv-Anker ───────────────────────────────────────────────────────────
# Ohne sie waeren die Negativ-Aussagen vakuos: ein Skript, das an allem
# scheitert, wuerde sie zufaellig erfuellen.

@test "Anker: gruener PR-HEAD meldet 'alle grün' mit exit 0" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo -n "" > "$MARKER_DIR/mock-check-runs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  grep -q "alle grün" <<<"$output" \
    || { echo "Positiv-Anker verletzt — Testaufbau kaputt, nicht der Fix"; false; }
}

@test "Anker: ein echt roter Job wird als rot gemeldet" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  printf '%s\n' 'Factory spec shard 2: https://example.invalid/1' > "$MARKER_DIR/mock-check-runs-failures"
  printf '%s\n' '[{"databaseId":42,"headSha":"'"$(git -C "$WORK" rev-parse HEAD)"'","status":"completed","conclusion":"failure"}]' > "$MARKER_DIR/mock-run-list"
  echo "1" > "$MARKER_DIR/mock-jobs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  [ "$status" -ne 0 ]
}

# ── Die eigentliche Zusicherung ─────────────────────────────────────────────

@test "T014466: unbestimmbarer Run-Lookup meldet NICHT 'alle grün'" {
  # Der Fall aus dem Haupt-Checkout: check-runs meldet failure, aber gh run list
  # liefert nichts. "Nicht gefunden" ist keine Entwarnung.
  echo "OPEN" > "$MARKER_DIR/pr-state"
  printf '%s\n' 'Factory spec shard 2: https://example.invalid/1' > "$MARKER_DIR/mock-check-runs-failures"
  printf '%s\n' '[]' > "$MARKER_DIR/mock-run-list"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  ! grep -q "alle grün" <<<"$output" \
    || { echo "FALSCH GRUEN: rote check-runs + leerer Run-Lookup als gruen gemeldet"; echo "$output"; false; }
  [ "$status" -ne 0 ] || { echo "Exit 0 trotz roter check-runs"; false; }
}

@test "T014466: der Run-Lookup fragt nicht den lokalen Branch ab" {
  run grep -n 'run list' "$SCRIPT"
  [ "$status" -eq 0 ]
  ! grep -q 'rev-parse --abbrev-ref HEAD' <<<"$output" \
    || { echo "Run-Lookup haengt weiterhin am lokalen Branch: $output"; false; }
}

@test "T014466: ein nachweislich harmloses Aggregat bleibt gruen" {
  # Entwarnt werden darf nur, wenn der Run GEFUNDEN wurde und seine Jobs
  # nachweislich keinen failure tragen.
  echo "OPEN" > "$MARKER_DIR/pr-state"
  printf '%s\n' 'Aggregat: https://example.invalid/1' > "$MARKER_DIR/mock-check-runs-failures"
  printf '%s\n' '[{"databaseId":42,"headSha":"'"$(git -C "$WORK" rev-parse HEAD)"'","status":"completed","conclusion":"failure"}]' > "$MARKER_DIR/mock-run-list"
  echo "0" > "$MARKER_DIR/mock-jobs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  [ "$status" -eq 0 ] \
    || { echo "harmloses Aggregat faelschlich als rot behandelt: $output"; false; }
}

@test "T014466: nicht bestimmbarer PR-Branch entlastet nicht" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  printf '%s\n' 'Aggregat: https://example.invalid/1' > "$MARKER_DIR/mock-check-runs-failures"
  echo -n "" > "$MARKER_DIR/mock-head-ref-name"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  ! grep -q "alle grün" <<<"$output" \
    || { echo "FALSCH GRUEN bei unbestimmbarem PR-Branch"; echo "$output"; false; }
  [ "$status" -ne 0 ]
}
