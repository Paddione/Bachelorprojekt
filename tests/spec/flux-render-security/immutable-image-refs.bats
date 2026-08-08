#!/usr/bin/env bats
# tests/spec/flux-render-security/immutable-image-refs.bats
# SSOT: openspec/specs/flux-render-security.md
# Ticket: T002706
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Diese Tests FUEHREN den
# Renderer aus und pruefen den erzeugten Manifest-Baum. Sie greppen NICHT die
# Renderer-Quelle: dass dort ein Digest-Flag vorkommt, belegt nicht, dass im
# Artefakt ein Digest landet — genau diese Luecke ist der Befund D3 (die
# BRETT_IMAGE_TAG-Verkabelung existierte vollstaendig und erreichte kein Manifest).
#
# Vor dem Fix ist mindestens "brett is pinned by digest" rot, weil
# k3d/brett.yaml:34 ueber ${BRETT_IMAGE} rendert und environments/fleet-*.yaml
# das fest auf "latest" setzt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FLUX_RENDER="${REPO_ROOT}/scripts/flux-render-artifact.sh"

  # Nicht-geheime Fixture-Umgebung, gleiche Form wie der bestehende Offline-
  # Render-Test (tests/spec/workspace-deploy.bats). Secret-gestuetzte Werte
  # liegen in SealedSecrets und werden nie envsubst-substituiert.
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411
  export POCKET_ID_DOMAIN=id.example

  RENDER_OUT="$(mktemp -d)"
}

teardown() {
  [ -n "${RENDER_OUT:-}" ] && rm -rf "$RENDER_OUT"
}

# Die prod-Baeume. Der k3d/-Basis-Baum ist bewusst NICHT dabei: dev und k3d
# verfolgen absichtlich einen beweglichen Tag.
_prod_trees() {
  echo "${RENDER_OUT}/mentolder ${RENDER_OUT}/korczewski"
  echo "${RENDER_OUT}/website-mentolder ${RENDER_OUT}/website-korczewski"
}

# Alle image:-Zeilen der prod-Baeume, die auf das uebergebene Repository zeigen.
_image_refs_for() {
  local needle="$1" tree
  for tree in $(_prod_trees); do
    [ -d "$tree" ] || continue
    grep -rhoE "image: *[^ ]*${needle}[^ ]*" "$tree" 2>/dev/null || true
  done
}

_render() {
  run bash "$FLUX_RENDER" --out "$RENDER_OUT"
}

@test "T002706: renderer produces the prod trees offline (positive anchor)" {
  # POSITIV-ANKER (T002356-M1). Ohne ihn bestuenden die Negativ-Aussagen unten
  # vakuos: schlaegt der Render fehl oder aendert sich die Baumstruktur, waere
  # die Kandidatenliste leer und "kein :latest darin" trivial wahr.
  _render
  [ "$status" -eq 0 ]

  local tree found=0
  for tree in $(_prod_trees); do
    [ -d "$tree" ] && found=$((found + 1))
  done
  [ "$found" -eq 4 ]
}

@test "T002706: website image is pinned by digest in every prod tree" {
  _render
  [ "$status" -eq 0 ]

  local refs
  refs="$(_image_refs_for 'paddione/website')"

  # Positiv-Anker: es MUSS Website-Referenzen geben, sonst prueft der Rest nichts.
  [ -n "$refs" ]

  local bad
  bad="$(grep -v '@sha256:' <<<"$refs" || true)"
  if [ -n "$bad" ]; then
    echo "FAIL: Website-Image ohne Digest im prod-Baum:" >&2
    echo "$bad" >&2
    return 1
  fi
}

@test "T002706: brett image is pinned by digest in every prod tree" {
  _render
  [ "$status" -eq 0 ]

  local refs
  refs="$(_image_refs_for 'workspace-brett')"

  [ -n "$refs" ]

  local bad
  bad="$(grep -v '@sha256:' <<<"$refs" || true)"
  if [ -n "$bad" ]; then
    echo "FAIL: Brett-Image ohne Digest im prod-Baum:" >&2
    echo "$bad" >&2
    echo "Hinweis: BRETT_IMAGE_TAG erreicht kein Manifest — k3d/brett.yaml nutzt" >&2
    echo "         \${BRETT_IMAGE}, das environments/fleet-*.yaml auf latest setzt." >&2
    return 1
  fi
}

@test "T002706: no movable :latest tag survives for website or brett in prod" {
  _render
  [ "$status" -eq 0 ]

  local refs
  refs="$(_image_refs_for 'paddione/website')
$(_image_refs_for 'workspace-brett')"
  refs="$(grep -v '^$' <<<"$refs" || true)"

  [ -n "$refs" ]

  local movable
  movable="$(grep -E ':latest *$' <<<"$refs" || true)"
  if [ -n "$movable" ]; then
    echo "FAIL: beweglicher :latest-Tag im prod-Baum:" >&2
    echo "$movable" >&2
    return 1
  fi
}
