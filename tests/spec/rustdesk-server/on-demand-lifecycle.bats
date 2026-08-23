#!/usr/bin/env bats
# tests/spec/rustdesk-server/on-demand-lifecycle.bats
# SSOT: openspec/specs/rustdesk-server.md (Delta T015170: On-Demand-Lifecycle).
# Guards für den task-verwalteten RustDesk-Lifecycle: Taskfile-Registrierung,
# Sleeper-Job mit minimaler RBAC und Kustomize-Isolation von on-demand.yaml.
# Prüfmodus: Konfigurations-Manifestation (Taskfile-/Manifest-Greps) +
# Build-Output — Querschnittstests, deren Ergebnis sich im Repo-Text
# manifestiert (tests/CLAUDE.md, "Output- statt Source-Verifikation" Ausnahme).

setup() {
  # Drei Ebenen hoch: tests/spec/rustdesk-server/ → Repo-Root
  # (Konvention aus tests/spec/ci-cd/spec-dir-convention.bats).
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK="${REPO_ROOT}/k3d/rustdesk-stack"
  TASKFILE="${REPO_ROOT}/taskfiles/Taskfile.rustdesk.yml"
  ON_DEMAND="${STACK}/on-demand.yaml"
}

@test "rustdesk-on-demand: taskfile ist registriert und trägt die Lifecycle-Targets" {
  [ -f "$TASKFILE" ]
  # Include-Eintrag im Root-Taskfile (Registrierung)
  grep -qE '^  rustdesk:' "${REPO_ROOT}/Taskfile.yml"
  grep -qF 'taskfiles/Taskfile.rustdesk.yml' "${REPO_ROOT}/Taskfile.yml"
  # Die vier Lifecycle-Targets sind deklariert (einrückungstolerant —
  # der Namespace kommt vom Include-Key des Root-Taskfiles)
  for target in deploy wake sleep status; do
    grep -qE "^[[:space:]]*${target}:" "$TASKFILE"
  done
}

@test "rustdesk-on-demand: sleeper manifest deklariert TTL-Downscale mit minimaler RBAC" {
  [ -f "$ON_DEMAND" ]
  # Job mit TTL-Wind-down (30 min Default, Scale-to-0 für hbbs+hbbr)
  grep -qE '^kind:[[:space:]]*Job$' "$ON_DEMAND"
  grep -q 'name: rustdesk-sleeper' "$ON_DEMAND"
  grep -qF 'sleep 1800' "$ON_DEMAND"
  grep -qF -- '--replicas=0' "$ON_DEMAND"
  # RBAC-Trio vollständig
  grep -qE '^kind:[[:space:]]*ServiceAccount$' "$ON_DEMAND"
  grep -qE '^kind:[[:space:]]*Role$' "$ON_DEMAND"
  grep -qE '^kind:[[:space:]]*RoleBinding$' "$ON_DEMAND"
  # Role listet ausschließlich deployments/scale (get/update/patch) + deployments (get)
  role_block="$(awk '/^kind: Role$/,/^---$/' "$ON_DEMAND")"
  echo "$role_block" | grep -qF 'deployments/scale'
  echo "$role_block" | grep -qF '"get", "update", "patch"'
  echo "$role_block" | grep -qE 'resources:[[:space:]]*\["deployments"\]'
  echo "$role_block" | grep -qE 'verbs:[[:space:]]*\["get"\]'
  # Negativ-Aussage: keine weitergehenden Verben im Role-Block
  bad_verbs="$(echo "$role_block" | grep -cE '(^|[^a-z])(delete|create|list|watch|patch-all|"\*")([^a-z]|$)' || true)"
  [ "$bad_verbs" -eq 0 ]
}

@test "rustdesk-on-demand: on-demand.yaml bleibt außerhalb des Kustomize-Builds" {
  # Positiv-Anker: die bewachte Datei existiert überhaupt (sonst wäre die
  # Isolations-Aussage vakuos — T002356-M1)
  [ -f "$ON_DEMAND" ]
  command -v kustomize >/dev/null || skip "kustomize not installed"
  run kustomize build "$STACK"
  [ "$status" -eq 0 ]
  # Der Stack-Build liefert nach wie vor die Relay-Deployments ...
  echo "$output" | grep -qE '^kind:[[:space:]]+Deployment'
  # ... aber null Treffer auf den Sleeper-Job (er rolliert nie über Flux/Kustomize)
  leaks="$(echo "$output" | grep -c 'rustdesk-sleeper' || true)"
  [ "$leaks" -eq 0 ]
  # Belt-and-braces: on-demand.yaml ist in keiner Kustomization referenziert
  refs="$(grep -rE 'on-demand\.yaml' "${REPO_ROOT}/k3d" "${REPO_ROOT}/prod" \
            --include='kustomization.yaml' || true)"
  [ -z "$refs" ]
}
