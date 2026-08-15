#!/usr/bin/env bats
# tests/spec/software-factory/docker-info-timeout.bats
# SSOT: openspec/specs/software-factory.md
# T006303 — Docker-Daemon haengt: Factory-Tick hing ~1h an `docker info`
# (ELAPSED 58:20, 2026-08-15). Beide Backend-Selektionspfade rufen `docker info`
# ohne Timeout auf — ein daemon-haenger blockiert den Tick unbegrenzt.
#
# Beruehrte Pfade (find-changed-tests.sh path-probe):
#   scripts/factory/sandbox-run.sh  — resolve_mode (docker-Probe, Z.45)
#   scripts/factory/wakeup.sh       — Sandbox-Preflight (docker-Probe, Z.209)
#
# Pruefmodus [T002448-M4]: Output-/Resultat-Verifikation (behavioral). Die Tests
# FUEHREN die Skripte mit einem haengenden docker-Stub + fehlschlagendem
# kubectl-Stub aus und pruefen die Semantik: Exit-Code, Positiv-Anker (der
# Befehl/der Tick lief trotzdem weiter, unsandboxed) und die Zeitgrenze
# (Aufloesung <20s) — kein Format-Anker, kein Quelltext-Grep.
#
# Zeitgeometrie: docker-Stub schlaeft 30s. Ohne Timeout-Guard dauert die
# Aufloesung ~30s (elapsed >= 20 → rot). Mit `timeout 10 docker info` endet die
# Probe nach ~10s und faellt zurueck (elapsed < 20 → gruen). Der 20s-Bound ist
# die Semantik "ein haengender Daemon darf den Tick nicht blockieren".

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

SANDBOX_RUN="${BATS_TEST_DIRNAME}/../../../scripts/factory/sandbox-run.sh"
WAKEUP="${BATS_TEST_DIRNAME}/../../../scripts/factory/wakeup.sh"

# Hängender docker-Stub (Daemon antwortet nicht, Socket existiert aber) +
# nicht erreichbarer kubectl-Stub (Fallback-Kette kann nicht weitergehen).
# $1 = Stub-Verzeichnis (wird befuellt).
_stub_hanging_docker() {
  local dir="$1"
  cat > "${dir}/docker" <<'STUB'
#!/usr/bin/env bash
sleep 30
exit 1
STUB
  chmod +x "${dir}/docker"
  cat > "${dir}/kubectl" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
  chmod +x "${dir}/kubectl"
}

# Zeitgrenzen-Messung: elapsed in Sekunden (< 20 = gruen; ~30 = rot).
_elapsed_since() { echo "$(( $(date +%s) - $1 ))"; }

@test "T006303: sandbox backend resolution falls through within bound when docker hangs" {
  local stubdir wt start elapsed
  stubdir="$(mktemp -d)"
  _stub_hanging_docker "$stubdir"
  wt="$(mktemp -d)"

  start="$(date +%s)"
  run env FACTORY_REPO="$REPO" FACTORY_SANDBOX=auto PATH="${stubdir}:${PATH}" \
    bash "$SANDBOX_RUN" "$wt" 'echo OFF_MODE_OK'
  elapsed="$(_elapsed_since "$start")"
  local status_run="$status" output_run="$output"
  rm -rf "$wt" "$stubdir"

  # Positiv-Anker [T002356-M1]: der Befehl lief unsandboxed durch (off-Fallback
  # funktioniert ueberhaupt) — erst dann gilt die Negativ-Aussage (nicht haengen).
  [ "$status_run" -eq 0 ]
  echo "$output_run" | grep -q 'OFF_MODE_OK'
  echo "$output_run" | grep -q 'UNSANDBOXED'
  # Die Negativ-Aussage: kein Haengen — Aufloesung innerhalb der Zeitgrenze.
  [ "$elapsed" -lt 20 ]
}

@test "T006303: wakeup.sh tick preflight proceeds unsandboxed within bound when docker hangs" {
  local tmp stubdir bridgefile start elapsed
  tmp="$(mktemp -d)"
  stubdir="$(mktemp -d)"
  _stub_hanging_docker "$stubdir"
  bridgefile="${tmp}/bridge-invoked"

  mkdir -p "${tmp}/scripts/factory"
  cat > "${tmp}/scripts/factory/lib.sh" <<LIB
#!/usr/bin/env bash
# Test-Stub (vgl. _stub_factory_lib in wakeup.bats) — kein DB-Zugriff.
factory_backlog_count() { echo 0; }
LIB
  cat > "${tmp}/bridge-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "bridge-called" > "${bridgefile}"
STUB
  chmod +x "${tmp}/bridge-stub"

  start="$(date +%s)"
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" \
    FACTORY_DISPATCHER_BRIDGE="${tmp}/bridge-stub" FACTORY_DRY_RUN=true \
    FACTORY_SANDBOX=auto \
    FACTORY_IDLE_RETICK_ENABLED=false \
    FACTORY_TICK_LOCK="${tmp}/tick.lock" FACTORY_ENV_FILE="${tmp}/no-env" \
    PATH="${stubdir}:${PATH}" run bash "$WAKEUP"
  elapsed="$(_elapsed_since "$start")"
  local status_run="$status" output_run="$output"
  # Dateizustand VOR dem Aufraeumen festhalten — nach rm -rf ist der Pfad weg.
  local bridge_called=false
  [[ -f "${bridgefile}" ]] && bridge_called=true
  rm -rf "$tmp" "$stubdir"

  # Positiv-Anker [T002356-M1]: der Tick lief trotz hängendem Daemon weiter
  # (Bridge aufgerufen, unsandboxed-Meldung) — erst dann zaehlt die Negativ-
  # Aussage (Preflight haengt nicht an docker info).
  [ "$status_run" -eq 0 ]
  [ "$bridge_called" = true ]
  echo "$output_run" | grep -q 'UNSANDBOXED'
  # Die Negativ-Aussage: der Sandbox-Preflight haengt nicht an der docker-Probe.
  [ "$elapsed" -lt 20 ]
}
