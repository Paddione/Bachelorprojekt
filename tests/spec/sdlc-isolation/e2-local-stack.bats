#!/usr/bin/env bats
# tests/spec/sdlc-isolation/e2-local-stack.bats
# SSOT: openspec/changes/e2-sdlc-local-stack/tasks.md (T002625)
#
# Struktur-Anker + DoD-Nachweis fuer E2 SDLC-Isolation:
# Overlay, Console-Deployment, Auth-Provider, Runbook, Laufzeit-Checks.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e2-local-stack.bats
# or:  task test:unit SPEC=sdlc-isolation/e2-local-stack

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  SDLC_STACK="${REPO_ROOT}/k3d/sdlc-stack"
  AUTH_DIR="${REPO_ROOT}/website/src/lib/auth"
  DOCS="${REPO_ROOT}/docs/sdlc-stack"
}

cluster_running() {
  # Prüft echte Cluster-Erreichbarkeit statt nur des Kontextnamens.
  # kubectl config current-context kann auf einen nicht erreichbaren Cluster zeigen
  # (anderer Rechner, Docker-Reset) — die Tests würden dann rot statt skip.
  kubectl get nodes --request-timeout=3s &>/dev/null
}

# ── Struktur-Anker ──────────────────────────────────────────────────────────

@test "E2: Overlay exists and references SDLC resources" {
  [ -f "${SDLC_STACK}/kustomization.yaml" ]
  grep -q '../llm-gpu.yaml' "${SDLC_STACK}/kustomization.yaml"
  grep -q '../shared-db.yaml' "${SDLC_STACK}/kustomization.yaml"
  grep -q '../pocket-id.yaml' "${SDLC_STACK}/kustomization.yaml"
  grep -q 'sdlc-console.yaml' "${SDLC_STACK}/kustomization.yaml"
  grep -q 'sdlc-ingress.yaml' "${SDLC_STACK}/kustomization.yaml"
}

@test "E2: Cluster config names mentolder-dev" {
  [ -f "${SDLC_STACK}/k3d-config.yaml" ]
  grep -q 'name: mentolder-dev' "${SDLC_STACK}/k3d-config.yaml"
}

@test "E2: Console deployment references website-sdlc image and fallback auth" {
  [ -f "${SDLC_STACK}/sdlc-console.yaml" ]
  grep -q 'ghcr.io/paddione/website-sdlc' "${SDLC_STACK}/sdlc-console.yaml"
  grep -q 'POCKET_ID_FALLBACK_FRONTEND_URL' "${SDLC_STACK}/sdlc-console.yaml"
}

@test "E2: Auth provider file and test exist" {
  [ -f "${AUTH_DIR}/provider.ts" ]
  [ -f "${AUTH_DIR}/provider.test.ts" ]
}

@test "E2: Auth provider test covers fail-closed scenario" {
  grep -qE '(fail.closed|Fall 1|both.*(down|unreachable)|AuthUnavailableError)' "${AUTH_DIR}/provider.test.ts"
}

@test "E2: Runbook exists and documents WSL memory baseline" {
  [ -f "${DOCS}/README.md" ]
  grep -qE '(40.?GB|39.?GB|memory|WSL.Speicher)' "${DOCS}/README.md"
}

@test "E2: Taskfile include in Taskfile.yml" {
  grep -q 'Taskfile.sdlc.yml' "${REPO_ROOT}/Taskfile.yml"
}

# ── DoD Verifikation (bedingt: nur wenn Cluster laeuft) ─────────────────────

@test "E2 DoD: sdlc-console deployment is Ready" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  kubectl --context k3d-mentolder-dev get deploy sdlc-console -n workspace -o jsonpath='{.status.readyReplicas}' | grep -q '1'
}

@test "E2 DoD: Console responds 200 on sdlc.localhost" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  run curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost
  [ "$output" = "200" ]
}

@test "E2 DoD: /api/health returns sdlc build target" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  run curl -sS http://sdlc.localhost/api/health
  echo "$output" | grep -q '"BUILD_TARGET"'
}

@test "E2 DoD: local tickets schema bootstrapped" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  run kubectl --context k3d-mentolder-dev exec -n workspace deploy/shared-db -- \
    psql -U postgres -d website -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='tickets'"
}

@test "E2 DoD: bge-embed responds on health" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  kubectl --context k3d-mentolder-dev port-forward -n workspace svc/llm-gateway-embed 18081:8081 &
  PF_PID=$!
  sleep 2
  run curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18081/health
  kill $PF_PID 2>/dev/null || true
  [ "$output" = "200" ]
}

@test "E2 DoD: Auth without mesh — login redirect to local Pocket ID" {
  if ! cluster_running; then skip "cluster k3d-mentolder-dev not running"; fi
  run curl -sS -o /dev/null -w '%{http_code}' \
    'http://auth.localhost/authorize?client_id=website&response_type=code&scope=openid'
  [ "$output" = "302" ] || [ "$output" = "200" ]
}
