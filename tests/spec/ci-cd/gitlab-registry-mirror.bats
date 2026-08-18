#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-registry-mirror.bats — Registry-Redundanz [T012415]
#
# Guards zu openspec/specs/ci-cd.md, Requirements:
#   - Build-Artefakte werden in eine zweite Registry gespiegelt
#   - Das signierte OCI-Artefakt wird mitsamt Signatur gespiegelt
#   - Die GitLab-Quelle liegt bereit, aber suspendiert
#
# Jeder Negativtest traegt einen Positiv-Anker (tests/CLAUDE.md): ein leerer
# Treffer darf nie als Erfolg durchgehen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF_DIR="${REPO_ROOT}/.github/workflows"
  MIRROR_SCRIPT="${REPO_ROOT}/scripts/mirror-image-to-gitlab.sh"
  RENDER_WF="${WF_DIR}/render-fleet-artifact.yml"
  OCI_PRIMARY="${REPO_ROOT}/flux/clusters/fleet/oci-source.yaml"
  OCI_GITLAB="${REPO_ROOT}/flux/clusters/fleet/oci-source-gitlab.yaml"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/gitlab-runner.md"
}

# Die Workflows, die ein selbst gebautes Image nach ghcr pushen. renovate.yml
# steht bewusst NICHT hier: es referenziert ein Fremd-Image, das wir nicht bauen.
building_workflows() {
  grep -l 'docker/build-push-action' "${WF_DIR}"/build-*.yml 2>/dev/null | sort
}

@test "gitlab-registry-mirror: Positiv-Anker — es gibt ueberhaupt bauende Workflows" {
  run building_workflows
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  # Anker: unter 5 bauenden Workflows stimmt die Annahme dieses Tests nicht mehr.
  [ "$(echo "$output" | grep -c .)" -ge 5 ]
}

@test "gitlab-registry-mirror: das Spiegel-Skript existiert und ist ausfuehrbar" {
  [ -f "$MIRROR_SCRIPT" ]
  [ -x "$MIRROR_SCRIPT" ]
  run bash -n "$MIRROR_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "gitlab-registry-mirror: jeder bauende Workflow ruft den Spiegel-Schritt auf" {
  local missing=""
  local wf
  while read -r wf; do
    [ -n "$wf" ] || continue
    if ! grep -q 'mirror-image-to-gitlab.sh' "$wf"; then
      missing="${missing} $(basename "$wf")"
    fi
  done < <(building_workflows)
  [ -z "$missing" ] || {
    echo "Workflows ohne Spiegel-Schritt:${missing}"
    return 1
  }
}

@test "gitlab-registry-mirror: der Spiegel-Schritt blockiert den Build nicht" {
  local wf
  while read -r wf; do
    [ -n "$wf" ] || continue
    # continue-on-error muss im selben Step stehen wie der Skriptaufruf.
    run grep -B12 'mirror-image-to-gitlab.sh' "$wf"
    [ "$status" -eq 0 ]
    echo "$output" | grep -q 'continue-on-error: true' || {
      echo "kein continue-on-error im Spiegel-Step von $(basename "$wf")"
      return 1
    }
  done < <(building_workflows)
}

@test "gitlab-registry-mirror: renovate.yml bekommt keinen Spiegel-Schritt" {
  # Positiv-Anker: die Datei existiert und referenziert das Fremd-Image.
  [ -f "${WF_DIR}/renovate.yml" ]
  grep -q 'ghcr.io/renovatebot/renovate' "${WF_DIR}/renovate.yml"
  ! grep -q 'mirror-image-to-gitlab.sh' "${WF_DIR}/renovate.yml"
}

@test "gitlab-registry-mirror: das OCI-Artefakt wird per cosign copy gespiegelt" {
  [ -f "$RENDER_WF" ]
  # Positiv-Anker: der Signier-Schritt existiert weiterhin.
  grep -q 'cosign sign' "$RENDER_WF"
  grep -q 'cosign copy' "$RENDER_WF"
}

@test "gitlab-registry-mirror: kein crane copy fuer das signierte Artefakt" {
  # crane copy laesst die Signatur-Tags zurueck — der Spiegel waere unsigniert.
  #
  # Geprueft wird der ausgefuehrte Aufruf, nicht die Erwaehnung: der Workflow
  # erklaert im Kommentar, WARUM crane hier falsch ist. Ein Guard, der schon an
  # dieser Begruendung anschlaegt, erzoege den Loeschen des Kommentars — also
  # genau des Wissens, das den Fehler kuenftig verhindert.
  run bash -c "grep -v '^[[:space:]]*#' '$RENDER_WF' | grep -c 'crane copy' || true"
  [ "$(echo "$output" | tr -d '[:space:]')" = "0" ]
}

@test "gitlab-registry-mirror: der Spiegel-Schritt folgt auf das Signieren" {
  local sign_line copy_line
  sign_line=$(grep -n 'cosign sign' "$RENDER_WF" | head -1 | cut -d: -f1)
  copy_line=$(grep -n 'cosign copy' "$RENDER_WF" | head -1 | cut -d: -f1)
  [ -n "$sign_line" ]
  [ -n "$copy_line" ]
  [ "$copy_line" -gt "$sign_line" ]
}

@test "gitlab-registry-mirror: die verify-Policy akzeptiert weiterhin genau einen Issuer" {
  [ -f "$OCI_PRIMARY" ]
  # Positiv-Anker: die Policy ist ueberhaupt vorhanden.
  grep -q 'matchOIDCIdentity' "$OCI_PRIMARY"
  [ "$(grep -c 'issuer:' "$OCI_PRIMARY")" -eq 1 ]
  grep -q 'token\\.actions\\.githubusercontent\\.com' "$OCI_PRIMARY"
  ! grep -qi 'gitlab' "$OCI_PRIMARY"
}

@test "gitlab-registry-mirror: die zweite OCIRepository ist deklariert und suspendiert" {
  [ -f "$OCI_GITLAB" ]
  grep -q 'kind: OCIRepository' "$OCI_GITLAB"
  grep -q 'name: fleet-manifests-gitlab' "$OCI_GITLAB"
  grep -q 'suspend: true' "$OCI_GITLAB"
  grep -q 'registry.gitlab.com' "$OCI_GITLAB"
}

@test "gitlab-registry-mirror: die zweite Quelle traegt dieselbe verify-Policy" {
  grep -q 'matchOIDCIdentity' "$OCI_GITLAB"
  grep -q 'token\\.actions\\.githubusercontent\\.com' "$OCI_GITLAB"
  grep -q 'render-fleet-artifact' "$OCI_GITLAB"
}

@test "gitlab-registry-mirror: das Runbook beschreibt beide Umschaltrichtungen" {
  [ -f "$RUNBOOK" ]
  # Positiv-Anker: der bestehende Fallback-Abschnitt ist noch da.
  grep -q 'CI_RUNNER_TAG' "$RUNBOOK"
  grep -q 'Registry-Failover' "$RUNBOOK"
  grep -q 'fleet-manifests-gitlab' "$RUNBOOK"
  # Der Rueckweg ist der Schritt, der vergessen wird.
  grep -qi 'zurueck\|zurück' "$RUNBOOK"
}

@test "gitlab-registry-mirror: das Runbook nennt die Grenze des Spiegels" {
  # Waehrend eines GitHub-Ausfalls entstehen KEINE neuen Artefakte.
  grep -qi 'keine neuen Artefakte' "$RUNBOOK"
}
