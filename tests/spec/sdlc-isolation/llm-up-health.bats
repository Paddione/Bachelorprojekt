#!/usr/bin/env bats
# tests/spec/sdlc-isolation/llm-up-health.bats
# SSOT: openspec/changes/dev-up-llm-proxy/tasks.md (T002656)
#
# Acceptance tests for the sdlc:up chat-loadout start (scripts/sdlc/llm-up.sh)
# and the extended health-gate probes (llm-proxy-readiness, llm-loadout).
#
# Pruefmodus: Output-Verifikation (T002448-M4) — die Tests fuehren die Skripte
# und `task --dry` AUS und pruefen Exit-Codes und Meldungs-Substrings, sie
# greppen nicht die Implementierungsquelle. Substring-Proben ohne Zeilenanker
# (T002716): geprueft wird die Fehlersemantik, nicht die Formulierung.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/llm-up-health.bats
# or:  task test:unit SPEC=sdlc-isolation/llm-up-health

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  TASK="task"
  LLM_UP="${REPO_ROOT}/scripts/sdlc/llm-up.sh"
  HEALTH_GATE="${REPO_ROOT}/scripts/sdlc/health-gate.sh"
}

# Kein fester Port: unter WSL2 sind Bereiche wie 49152-49251 von Hyper-V
# reserviert und liefern EADDRINUSE ohne sichtbaren Lauscher. (Muster aus
# tests/spec/dev-flow-plan/plan-qa-livez-probe.bats)
free_port() {
  python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
}

# ── Namespace / Task-Liste ──────────────────────────────────────────────────

@test "sdlc:up is listed as a task" {
  run $TASK --list-all
  echo "$output" | grep -q 'sdlc:up'
}

@test "sdlc:down is listed as a task" {
  run $TASK --list-all
  echo "$output" | grep -q 'sdlc:down'
}

@test "dev:up is NOT listed as a task (namespace belongs to dev-stack)" {
  run $TASK --list-all
  # Positiv-Anker zuerst (T002356-M1): Liste ist nicht leer und enthaelt eine
  # bestehende dev:-Konvention — erst dann ist die Negativ-Aussage belastbar.
  [ -n "$output" ]
  echo "$output" | grep -q 'dev:deploy'
  ! echo "$output" | grep -qw 'dev:up'
}

# ── Orchestrierungs-Reihenfolge: sdlc:up ────────────────────────────────────

@test "sdlc:up dry-run calls proxy:start before llm-up.sh before health-gate" {
  run $TASK --dry sdlc:sdlc:up
  PROXY_LINE=$(echo "$output" | grep -n 'llm:proxy:start' | head -1 | cut -d: -f1)
  LOADOUT_LINE=$(echo "$output" | grep -n 'llm-up.sh' | head -1 | cut -d: -f1)
  HEALTH_LINE=$(echo "$output" | grep -n 'health-gate' | head -1 | cut -d: -f1)
  [ -n "$PROXY_LINE" ]
  [ -n "$LOADOUT_LINE" ]
  [ -n "$HEALTH_LINE" ]
  [ "$PROXY_LINE" -lt "$LOADOUT_LINE" ]
  [ "$LOADOUT_LINE" -lt "$HEALTH_LINE" ]
}

# ── Orchestrierungs-Reihenfolge: sdlc:down ──────────────────────────────────

@test "sdlc:down dry-run calls llm-up.sh down before proxy:stop before cluster:delete" {
  run $TASK --dry sdlc:sdlc:down
  LOADOUT_LINE=$(echo "$output" | grep -n 'llm-up.sh down' | head -1 | cut -d: -f1)
  STOP_LINE=$(echo "$output" | grep -n 'llm:proxy:stop' | head -1 | cut -d: -f1)
  DELETE_LINE=$(echo "$output" | grep -n 'sdlc:cluster:delete' | head -1 | cut -d: -f1)
  [ -n "$LOADOUT_LINE" ]
  [ -n "$STOP_LINE" ]
  [ -n "$DELETE_LINE" ]
  [ "$LOADOUT_LINE" -lt "$STOP_LINE" ]
  [ "$STOP_LINE" -lt "$DELETE_LINE" ]
}

# ── llm-up.sh: Fehlerpfade (deterministisch, kein Live-Cluster noetig) ───────

@test "llm-up.sh against dead port fails and names the proxy" {
  PORT="$(free_port)"
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    skip "port ${PORT} unexpectedly in use"
  fi
  # Positiv-Anker (T002356-M1): der Fehlerpfad existiert ueberhaupt erst, wenn
  # ein Lauf mit gesetztem SDLC_LLM_LOADOUT gegen denselben toten Port mit
  # Exit != 0 endet.
  run env LLM_PROXY_PORT="$PORT" SDLC_LLM_LOADOUT="anchor-loadout" bash "$LLM_UP"
  [ "$status" -ne 0 ]
  # Eigentliche Aussage: ohne SDLC_LLM_LOADOUT-Gesetztheit nennt der Fehler
  # den Proxy/Port (Substring ohne Zeilenanker).
  run env LLM_PROXY_PORT="$PORT" bash "$LLM_UP"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qiE 'llm-up|proxy'
}

@test "llm-up.sh with unknown loadout slug fails and names the slug" {
  if ! curl -fsS --max-time 2 "http://127.0.0.1:${LLM_PROXY_PORT:-18235}/livez" >/dev/null 2>&1; then
    skip "llm-proxy not running locally (needed for the 404 path)"
  fi
  run env SDLC_LLM_LOADOUT="nonexistent-loadout" bash "$LLM_UP"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'nonexistent-loadout'
}

@test "llm-up.sh down against dead port is best-effort (exit 0)" {
  PORT="$(free_port)"
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    skip "port ${PORT} unexpectedly in use"
  fi
  run env LLM_PROXY_PORT="$PORT" bash "$LLM_UP" down
  [ "$status" -eq 0 ]
}

# ── health-gate: Readiness-Probe benennt den Proxy ───────────────────────────

@test "health-gate fails when the proxy is not ready and names llm-proxy" {
  if ! kubectl config get-contexts k3d-mentolder-dev >/dev/null 2>&1; then
    skip "cluster k3d-mentolder-dev context not configured"
  fi
  if ! kubectl --context k3d-mentolder-dev get nodes --request-timeout=3s >/dev/null 2>&1; then
    skip "cluster k3d-mentolder-dev not reachable"
  fi
  PORT="$(free_port)"
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    skip "port ${PORT} unexpectedly in use"
  fi
  run env LLM_PROXY_PORT="$PORT" bash "$HEALTH_GATE" --context k3d-mentolder-dev --timeout 5
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'llm-proxy'
}
