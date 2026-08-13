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

  # T004041: Fixture-Digests statt env-file-Placeholder. Der Renderer ist seit
  # T004041 fail-closed gegen die Placeholder-Digests (sha256:1111.../2222...)
  # — ein Offline-Render OHNE Caller-Digest wuerde am Guard abbrechen. Zugleich
  # machen echte Caller-Digests die Pinning-Tests unten zu echten
  # Regressions-Tests: clobbert env-resolve die Caller-Werte, landet der
  # Placeholder im Artefakt und der Guard faengt ihn.
  export WEBSITE_IMAGE_DIGEST="sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41"
  export BRETT_IMAGE_DIGEST="sha256:9090909090909090909090909090909090909090909090909090909090909090"

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

@test "T004041: caller-provided website digest survives into the rendered artifact" {
  # Regressions-Test (T004041): render-fleet-artifact.yml setzt den echten Digest
  # als Env, flux-render-artifact.sh sourced danach env-resolve.sh — env-resolve
  # ueberschrieb den Caller-Wert mit dem Placeholder sha256:1111... aus
  # environments/fleet-*.yaml. Der Caller-Digest muss das Artefakt erreichen.
  _render
  [ "$status" -eq 0 ]

  local manifest="${RENDER_OUT}/website-mentolder/website-mentolder.yaml"
  [ -f "$manifest" ]

  # Positiv-Anker: der Caller-Digest steht im gerenderten Deployment.
  grep -q "ghcr.io/paddione/website@sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41" "$manifest"
  # Negativ-Aussage: der Placeholder erreicht das Artefakt nicht.
  ! grep -q "sha256:1111111111111111111111111111111111111111111111111111111111111111" "$manifest"
}

@test "T004041: renderer aborts when a placeholder digest would reach the artifact" {
  # Fail-closed-Guard: ein Placeholder-Digest (Caller-set oder aus der
  # env-Datei) darf nie in einem Artefakt landen — er pinnt ein nicht
  # existierendes Image und versetzt jede Brand in ImagePullBackOff.
  local out
  out="$(mktemp -d)"
  export WEBSITE_IMAGE_DIGEST="sha256:1111111111111111111111111111111111111111111111111111111111111111"
  export BRETT_IMAGE_DIGEST="sha256:2222222222222222222222222222222222222222222222222222222222222222"
  run bash "$FLUX_RENDER" --out "$out"
  rm -rf "$out"
  [ "$status" -ne 0 ]
  [[ "$output" == *"placeholder digest"* ]]
}
