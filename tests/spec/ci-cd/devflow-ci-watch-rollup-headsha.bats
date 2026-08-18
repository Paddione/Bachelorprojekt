#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
# SSOT: openspec/specs/ci-cd.md
#
# T012239: scripts/devflow-ci-watch.sh wertet rote Checks über einen
# statusCheckRollup-Selector mit `select(.headSha == $p.headRefOid)` aus. Das Feld
# `headSha` füllt die gh-REST-API im statusCheckRollup aber NIE (live verifiziert an
# PR #4734 und #4728: 33/33 Einträge `headSha: null`). Der Selector liefert daher
# immer die leere Menge, FAILED_CHECKS bleibt leer, und das Skript meldet nach
# Abschluss aller Checks "alle grün" mit Exit 0 — auch wenn Check-Runs auf dem
# PR-HEAD mit conclusion=failure/timed_out vorliegen.
#
# PRUEFMODUS: Output-Verifikation (T002448-M4). Das Skript wird mit einem gh-Stub
# (PATH) als echter Kommandoaufruf durchlaufen; geprueft werden Exit-Code und
# Meldung, nicht der Source.
#
# RED-Erwartung: das Skript fragt die check-runs-API (commits/<head>/check-runs) fuer
# failure-conclusions nie ab — der Rot-Test schlaegt fehl (falsch gruen, exit 0), bis
# der Fix implementiert ist.

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

# ── Positiv-Anker (T002356-M1): gruener HEAD bleibt gruen ───────────────────#

@test "T012239: gruener PR-HEAD (keine failure-Runs) meldet weiterhin 'alle grün' mit exit 0" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo -n "" > "$MARKER_DIR/mock-check-runs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  [ "$status" -eq 0 ] \
    || { echo "unerwarteter Exit $status: $output"; false; }
  grep -q "alle grün" <<<"$output" \
    || { echo "Positiv-Anker verletzt: gruener HEAD meldet nicht 'alle grün' — Testaufbau kaputt, nicht der Fix"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — das Skript fragt die check-runs-API fuer conclusions nie
# ab und meldet trotz failure-Run am PR-HEAD "alle grün" mit exit 0)

@test "T012239: failure-Run auf dem PR-HEAD (check-runs) führt zu exit != 0, nicht falsch grün" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"
  echo "2" > "$MARKER_DIR/mock-total-checks"

  # Ein failure-Run am PR-HEAD — genau das Signal, das der tote Rollup-Selector
  # (headSha nie gefuellt) nicht liefern kann. Array-Form: der echte post-jq-
  # Output der check-runs-Abfrage (filter=latest, Wrapper-Form) bei einem Treffer.
  echo '["BATS Unit + Quality Gates: https://example.invalid/run"]' > "$MARKER_DIR/mock-check-runs-failures"

  SHA="$(git -C "$WORK" rev-parse HEAD)"
  echo "$SHA" > "$MARKER_DIR/mock-head-ref-oid"

  # Gegenprobe (T003224): ein echter failure-Run am selben HEAD + ein failure-Job —
  # sonst leert die Job-Level-Probe FAILED_CHECKS als "kein Codefehler".
  printf '[{"databaseId":42,"headSha":"%s","status":"completed","conclusion":"failure"}]' "$SHA" \
    > "$MARKER_DIR/mock-run-list"
  echo "1" > "$MARKER_DIR/mock-jobs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    MAX_CI_ATTEMPTS=1 \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  # RED phase: script falsely exits 0 with "alle grün" → [ "$status" -ne 0 ] FAILS
  # GREEN phase: FAILED_CHECKS kommt aus der check-runs-API → rot erkannt, exit 1
  [ "$status" -ne 0 ] \
    || { echo "❌ Bug reproduziert: Script meldete 'alle grün' (exit 0) obwohl ein failure-Run auf dem PR-HEAD vorliegt — der tote Rollup-Selector maskiert das Rot"; false; }
  grep -q "BATS Unit + Quality Gates" <<<"$output" \
    || { echo "❌ Der fehlgeschlagene Check erscheint nicht in der Eskalationsmeldung"; false; }
}

# ── T012242: Falsch-Rot durch leeres JSON-Array ──────────────────────────────#
# expected: FAIL (RED — `[]` ist in [[ -n ]] nicht-leer; die T003224-Gegenprobe
# laeuft, findet den stale failure-Run am selben HEAD, und das Skript eskaliert
# nach MAX_CI_ATTEMPTS auf einem gruenen PR — exit 1 trotz gruener Sachlage)
#
# Positiv-Anker (T002356-M1) im selben File: der Test darueber (T012239-Rot-Test)
# beweist, dass die Gegenproben-Kette (run list + jobs) funktioniert, wenn
# FAILED_CHECKS echt gefuellt ist — der D3-Test schlaegt nicht aus kaputtem
# Testaufbau fehl.

@test "T012242: leeres FAILED_CHECKS-Array ([]) darf bei stale failure-Run NICHT als rot eskalieren" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"
  echo "2" > "$MARKER_DIR/mock-total-checks"

  # Gruene Sachlage am PR-HEAD: die check-runs-Abfrage (Array-Form) liefert bei
  # null Fehlern exakt "[]" — den echten post-jq-Output der Wrapper-Form.
  echo '[]' > "$MARKER_DIR/mock-check-runs-failures"

  # Stale failure-Run am selben HEAD (ueberholter Workflow, T003224-Kandidat):
  # die Gegenprobe findet ihn, seine Jobs enden weiterhin auf failure.
  SHA="$(git -C "$WORK" rev-parse HEAD)"
  echo "$SHA" > "$MARKER_DIR/mock-head-ref-oid"
  printf '[{"databaseId":43,"headSha":"%s","status":"completed","conclusion":"failure"}]' "$SHA" \
    > "$MARKER_DIR/mock-run-list"
  echo "1" > "$MARKER_DIR/mock-jobs-failures"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    MAX_CI_ATTEMPTS=1 \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  # RED phase: "[]" nicht-leer → Gegenprobe → stale Run bleibt → exit 1 auf
  #           gruenem PR → [ "$status" -eq 0 ] FAILS
  # GREEN phase: "[]" wird als "keine Fehler" normalisiert → exit 0 "alle grün"
  [ "$status" -eq 0 ] \
    || { echo "❌ Bug reproduziert: leeres [] eskalierte als rot (exit $status) — die T003224-Gegenprobe invertiert auf gruenem PR"; echo "$output"; false; }
  grep -q "alle grün" <<<"$output" \
    || { echo "❌ Gruene Sachlage wurde nicht als grün gemeldet"; echo "$output"; false; }
}
