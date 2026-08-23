#!/usr/bin/env bats
# tests/spec/flux-render-security/no-default-secrets.bats — Keine Hardcoded-Creds im Prod-Artefakt [T014536]
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Diese Tests FUEHREN den Renderer aus
# und pruefen den erzeugten Manifest-Baum. Sie greppen NICHT die Renderer-Quelle — das
# Artefakt selbst ist die einzige Quelle der Wahrheit.
#
# Hintergrund: Das kube-prometheus-stack Chart rendert ein `monitoring-grafana` Secret mit den
# Hardcoded-Credentials admin/admin (base64: YWRtaW4=). Im Prod-Fleet-Artefakt darf dieses
# Secret NICHT vorkommen — das Grafana-Admin-Passwort kommt stattdessen aus dem
# `grafana-oidc` SealedSecret (GRAFANA_ADMIN_PASSWORD), und der Admin-User ist literal "admin".
# Der Fix loescht das Secret via `$patch: delete` in prod/monitoring/kustomization.yaml und
# ersetzt die secretKeyRef-Verweise durch value: "admin" (T014536).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER_SCRIPT="${REPO_ROOT}/scripts/flux-render-artifact.sh"

  # Nicht-geheime Fixture-Umgebung — gleiche Form wie immutable-image-refs.bats.
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411
  export POCKET_ID_DOMAIN=id.example

  # T004041: Fixture-Digests statt env-file-Placeholder.
  export WEBSITE_IMAGE_DIGEST="sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41"
  export BRETT_IMAGE_DIGEST="sha256:9090909090909090909090909090909090909090909090909090909090909090"

  RENDER_OUT="$(mktemp -d)"
}

teardown() {
  [ -n "${RENDER_OUT:-}" ] && rm -rf "$RENDER_OUT"
}

_prod_trees() {
  echo "${RENDER_OUT}/mentolder ${RENDER_OUT}/korczewski"
}

_render() {
  run bash "$RENDER_SCRIPT" --out "$RENDER_OUT"
}

# Alle YAML-Dateien in den prod trees, die Grafana-Content enthalten.
_grafana_manifests() {
  local tree
  for tree in $(_prod_trees); do
    [ -d "$tree" ] || continue
    find "$tree" -name '*.yaml' -exec grep -l 'GF_SECURITY_ADMIN_USER\|REQ_USERNAME.*grafana\|kind: Secret' {} \; 2>/dev/null
  done
}

@test "T014536: renderer produces the prod trees offline (positive anchor)" {
  # POSITIV-ANKER (T002356-M1): sicherstellen, dass der Render durchlaeuft.
  _render
  [ "$status" -eq 0 ]

  local tree
  for tree in $(_prod_trees); do
    [ -d "$tree" ]
  done
}

@test "T014536: kein monitoring-grafana Secret mit admin-user/admin-password im gerenderten Artefakt" {
  _render
  [ "$status" -eq 0 ]

  # Positiv-Anker: es gibt ueberhaupt Secret-Dateien im Render.
  local secret_count
  secret_count="$(find $(_prod_trees) -name '*.yaml' -exec grep -l 'kind: Secret' {} \; 2>/dev/null | wc -l)"
  [ "$secret_count" -gt 0 ]

  # Eigentliche Aussage: kein Secret mit "admin-user" oder "admin-password" als key existiert.
  # Diese Keys stehen im monitoring-grafana Secret (chart default).
  local bad_files
  bad_files="$(find $(_prod_trees) -name '*.yaml' -exec grep -l 'key: admin-user\|key: admin-password' {} \; 2>/dev/null || true)"
  [ -z "$bad_files" ]
}

@test "T014536: keine base64 YWRtaW4= (admin) in gerenderten Secrets" {
  _render
  [ "$status" -eq 0 ]

  # base64 YWRtaW4= decodiert zu "admin" — Suche nach base64-codierten admin-Werten.
  local bad_files
  bad_files="$(find $(_prod_trees) -name '*.yaml' -exec grep -l 'YWRtaW4' {} \; 2>/dev/null || true)"
  [ -z "$bad_files" ]
}

@test "T014536: GF_SECURITY_ADMIN_USER verwendet value: admin statt secretKeyRef zu monitoring-grafana" {
  _render
  [ "$status" -eq 0 ]

  # Positiv-Anker: die Grafana-Deployment-Datei existiert und enthaelt GF_SECURITY_ADMIN_USER.
  local mentolder_manifest="${RENDER_OUT}/mentolder/mentolder.yaml"
  [ -f "$mentolder_manifest" ]
  grep -q 'GF_SECURITY_ADMIN_USER' "$mentolder_manifest"

  # Negativ-Aussage: GF_SECURITY_ADMIN_USER sollte NICHT mit valueFrom/secretKeyRef -> monitoring-grafana verknuepft sein.
  # Suche nach 5 Zeilen um GF_SECURITY_ADMIN_USER — wenn valueFrom und monitoring-grafana beide vorkommen, ist es ein Fehler.
  local context
  context="$(grep -B3 -A5 'GF_SECURITY_ADMIN_USER' "$mentolder_manifest" 2>/dev/null || true)"

  # Wenn valueFrom UND monitoring-grafana in der naechsten Umgebung vorkommen, ist der secretKeyRef noch da.
  if echo "$context" | grep -q 'valueFrom'; then
    if echo "$context" | grep -q 'monitoring-grafana'; then
      echo "FAIL: GF_SECURITY_ADMIN_USER verweist noch auf monitoring-grafana Secret:" >&2
      echo "$context" >&2
      return 1
    fi
  fi
}

@test "T014536: sidecar REQ_USERNAME verwendet value: admin statt secretKeyRef zu monitoring-grafana" {
  _render
  [ "$status" -eq 0 ]

  local mentolder_manifest="${RENDER_OUT}/mentolder/mentolder.yaml"
  [ -f "$mentolder_manifest" ]

  # Positiv-Anker: REQ_USERNAME sollte im Deployment vorkommen.
  grep -q 'REQ_USERNAME' "$mentolder_manifest"

  # Negativ-Aussage: kein REQ_USERNAME mit valueFrom -> secretKeyRef -> monitoring-grafana.
  # Suche nach allen REQ_USERNAME Blöcken und pruefe, ob einer auf monitoring-grafana verweist.
  local found_bad=0
  while IFS= read -r line; do
    # Nimm 5 Zeilen nach jedem REQ_USERNAME
    local start_line
    start_line="$(grep -n 'REQ_USERNAME' "$mentolder_manifest" 2>/dev/null | grep "^${line}:")"
    [ -n "$start_line" ] || continue
    local lineno="${start_line%%:*}"
    local context
    context="$(sed -n "$((lineno-2)),$((lineno+5))p" "$mentolder_manifest" 2>/dev/null || true)"

    if echo "$context" | grep -q 'valueFrom' && echo "$context" | grep -q 'monitoring-grafana'; then
      found_bad=1
      echo "FAIL: REQ_USERNAME verweist noch auf monitoring-grafana Secret:" >&2
      echo "$context" >&2
      return 1
    fi
  done < <(grep -n 'REQ_USERNAME' "$mentolder_manifest" 2>/dev/null | cut -d: -f1)

  [ "$found_bad" -eq 0 ]
}
