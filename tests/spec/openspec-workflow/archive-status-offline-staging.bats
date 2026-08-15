#!/usr/bin/env bats
# tests/spec/openspec-workflow/archive-status-offline-staging.bats
# SSOT: openspec/specs/scripts.md (cmd_archive-Verhalten)
#
# Pruefmodus (T002448-M4): gemischt.
#   Tests 1-2: Output-Verifikation — jeder ruft `scripts/openspec.sh archive`
#   gegen eine Sandbox auf und prueft den Staging-Zustand ($status/$output
#   plus `git diff --cached --name-only`). Kein Source-Grep.
#   Test 3: Querschnitts-Doku-Guard — dokumentierte Ausnahme, weil sich das
#   Pre-Push-Freshness-Verhalten von scripts/devflow-post-merge-finalize.sh
#   ausschliesslich im Quelltext manifestiert (der Archiv-Push zielt auf
#   origin, lokal nicht simulierbar). Positions-Check per awk-Bereichsmuster
#   (T003104), Positiv-Anker im selben Test (T002356-M1).
#
# Sandbox-Mechanik identisch zu archive-terminal-ticket-status.bats:
# scripts/openspec.sh verdrahtet TICKET_SH fest auf "$REPO/scripts/ticket.sh"
# und REPO auf `git rev-parse --show-toplevel` — der Test laeuft daher in
# einem eigenen `git init`-Sandbox-Repo mit Symlinks auf die echten Scripts
# (nur ticket.sh wird durch eine Stub-Datei ersetzt). Die Status-Map schreibt
# unter OPENSPEC_ROOT/website/... in die Sandbox, niemals ins echte Repo.
#
# Hintergrund (T006371): Der T003136-Add-Block in cmd_archive haengt an
# `TICKET_OFFLINE != 1` und schluckt Fehler doppelt (`|| true`). Laeuft ein
# Ausfuehrer offline, wird openspec-status.json weder regeneriert noch
# gestaged, der Archiv-Commit traegt die Datei nicht mit, und der
# Freshness-Gate meldet sie danach als stale — beobachtet bei PR #4529
# (T005560) und #4533 (T005958): je Commit 1 Archiv ohne JSON, Commit 2
# "chore(plans): regenerate openspec-status after archive [...]" als manuelle
# Heilung (T002252-Muster "regenerated but not staged"). Die Status-Map ist
# rein lokal (openspec-status-map.sh) — die Kopplung an das Cluster-Offline-
# Flag ist der Konstruktionsfehler. Zusaetzlich pusht der automatisierte
# Factory-Pfad (devflow-post-merge-finalize.sh Schritt 8) den Archiv-Branch
# ohne Pre-Push-Freshness-Verifikation.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPENSPEC_SH="${REPO_ROOT}/scripts/openspec.sh"

  SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
  mkdir -p "$SANDBOX"
  git init -q "$SANDBOX"

  export OPENSPEC_ROOT="${SANDBOX}/openspec"
  mkdir -p "${OPENSPEC_ROOT}/specs" "${OPENSPEC_ROOT}/changes/demo/specs"
  printf '# Spec: demo\n\n## Purpose\n\nDemo.\n\n## Requirements\n' > "${OPENSPEC_ROOT}/specs/demo.md"
  cat > "${OPENSPEC_ROOT}/changes/demo/specs/demo.md" <<'DELTA'
## ADDED Requirements

### Requirement: Demo requirement

The system SHALL do a demo thing.

#### Scenario: Demo scenario

- **GIVEN** a demo
- **WHEN** it runs
- **THEN** it works
DELTA
  echo "T990001" > "${OPENSPEC_ROOT}/changes/demo/.ticket"

  mkdir -p "${SANDBOX}/scripts"
  for f in "${REPO_ROOT}"/scripts/*; do
    ln -s "$f" "${SANDBOX}/scripts/$(basename "$f")"
  done
  rm -f "${SANDBOX}/scripts/ticket.sh"

  # Status-Map-Zielverzeichnis: openspec-status-map.sh kann nur schreiben,
  # wenn website/src/data existiert (im echten Repo immer vorhanden).
  mkdir -p "${SANDBOX}/website/src/data"
}

_stub_ticket_status() {
  local st="$1"
  cat > "${SANDBOX}/scripts/ticket.sh" <<STUB
#!/usr/bin/env bash
echo '{"status":"${st}"}'
STUB
  chmod +x "${SANDBOX}/scripts/ticket.sh"
}

@test "T006371: TICKET_OFFLINE=1 — archive staged openspec-status.json trotzdem (RED-Kern)" {
  # Offline laufende Ausfuehrer (TICKET_OFFLINE=1) uebersprangen den
  # T003136-Add-Block komplett — Regeneration UND Staging entfielen, der
  # Archiv-Commit trug die JSON nicht mit (PR #4529/#4533). Die Status-Map
  # ist rein lokal: die Kopplung an das Cluster-Offline-Flag ist der
  # Konstruktionsfehler. Mit TICKET_OFFLINE=1 faellt der Ticket-Status-Check
  # aus (cmd_archive), der Stub ist hier nur Form.
  _stub_ticket_status done
  run bash -c "cd '$SANDBOX' && TICKET_OFFLINE=1 bash '$OPENSPEC_SH' archive demo"
  [ "$status" -eq 0 ]
  run git -C "$SANDBOX" diff --cached --name-only
  [ "$status" -eq 0 ]
  [[ "$output" == *"website/src/data/openspec-status.json"* ]] \
    || { echo "openspec-status.json NICHT gestaged nach archive (TICKET_OFFLINE=1): '$output'" >&2; return 1; }
}

@test "T006371: ohne TICKET_OFFLINE — archive staged openspec-status.json weiterhin (Regression)" {
  # Positiv-Anker zum Offline-Fall: der Online-Pfad (bestehender T003136-Test
  # in archive-terminal-ticket-status.bats) bleibt gruen — der Fix darf den
  # Regelfall nicht brechen.
  _stub_ticket_status done
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
  [ "$status" -eq 0 ]
  run git -C "$SANDBOX" diff --cached --name-only
  [ "$status" -eq 0 ]
  [[ "$output" == *"website/src/data/openspec-status.json"* ]] \
    || { echo "openspec-status.json NICHT gestaged nach archive: '$output'" >&2; return 1; }
}

@test "T006371: finalize.sh Schritt 8 verifiziert Freshness vor dem Archiv-Push (Querschnitt)" {
  # Doku-Guard: der automatisierte Factory-Pfad (devflow-post-merge-finalize.sh
  # Schritt 8) darf den Archiv-Branch nicht ohne Pre-Push-Verifikation pushen
  # — sonst wiederholt sich T002252 ("regenerated but not staged"). Der
  # Bereich laeuft vom archive-Aufruf bis zum Archiv-Push; der Check muss
  # zwischen cherry-pick und push liegen (awk-Bereichsmuster, T003104).
  FINALIZE="${REPO_ROOT}/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ] || { echo "Skript fehlt: $FINALIZE" >&2; return 1; }
  run awk '/bash scripts\/openspec.sh archive/,/git push -u origin "\$ARCHIVE_BRANCH"/' "$FINALIZE"
  [ "$status" -eq 0 ] || { echo "Bereich 'archive .. push' nicht auffindbar in $FINALIZE" >&2; return 1; }
  [ -n "$output" ] || { echo "Bereich 'archive .. push' ist leer" >&2; return 1; }
  # Positiv-Anker (T002356-M1): freshness:check muss im Bereich stehen.
  echo "$output" | grep -qF 'task freshness:check' \
    || { echo "kein 'task freshness:check' zwischen archive und Push" >&2; return 1; }
  # Negativ-Aussage: die Regenerations-Zeile darf kein '|| true' tragen —
  # sonst umgeht sie set -e in der Subshell und Drift laeuft still weiter.
  if echo "$output" | grep -E 'task freshness:regenerate' | grep -qE '\|\|[[:space:]]*true'; then
    echo "freshness:regenerate traegt noch '|| true' — Fehler werden geschluckt" >&2
    return 1
  fi
}
