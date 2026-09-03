#!/usr/bin/env bats
# tests/spec/fleet-operations/vaultwarden-smtp-from.bats
# SSOT: openspec/specs/fleet-operations.md
# Ticket: T900028 (Batch T900041)
#
# PRUEFMODUS: Render-Output. Der Defekt sitzt in dem, was der Overlay-Build
# tatsaechlich emittiert — deshalb wird der Kustomize-Build gerendert und die
# gerenderte Container-Env geprueft, nicht die Patch-Quelle gegrept.
#
# Der Bug: prod/patch-vaultwarden.yaml setzte SMTP_HOST und SMTP_FROM_NAME,
# aber nie SMTP_FROM. Vaultwarden bricht beim Start ab mit
# "Both SMTP_HOST and SMTP_FROM need to be set for email support without
# USE_SENDMAIL" — 942 Neustarts, vault.mentolder.de HTTP 503.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

# Rendert den Brand-Overlay und gibt den vaultwarden-Container-Block aus.
render_vaultwarden_env() {
  local brand="$1"
  cd "$REPO_ROOT" || return 1
  # shellcheck disable=SC1091
  source scripts/env-resolve.sh "$brand" > /dev/null 2>&1 || return 1
  kubectl kustomize "prod-fleet/${brand}" --load-restrictor=LoadRestrictionsNone 2>/dev/null \
    | envsubst \
    | awk '/^  name: vaultwarden$/,/^---$/'
}

@test "T900028: gerenderter Vaultwarden-Deployment traegt SMTP_FROM neben SMTP_HOST" {
  command -v kubectl  >/dev/null 2>&1 || skip "kubectl not installed"
  command -v envsubst >/dev/null 2>&1 || skip "envsubst not installed"

  local brand
  for brand in mentolder korczewski; do
    local rendered
    rendered="$(render_vaultwarden_env "$brand")" || skip "env-resolve/kustomize unavailable for ${brand}"

    # Positiv-Anker (T002356-M1): ohne diesen wuerde ein leerer Render die
    # Aussagen unten trivial erfuellen.
    [[ "$rendered" == *"SMTP_HOST"* ]] \
      || { echo "${brand}: Render enthaelt keinen vaultwarden SMTP_HOST-Block" >&2; return 1; }

    # Der eigentliche Guard: SMTP_FROM muss gesetzt sein. SMTP_FROM_NAME darf
    # den Treffer NICHT erzeugen — deshalb auf den exakten Key ankern.
    [[ "$rendered" == *"name: SMTP_FROM"$'\n'* ]] \
      || { echo "${brand}: SMTP_FROM fehlt im gerenderten vaultwarden-Deployment" >&2; return 1; }

    # ... und einen echten Wert tragen, keinen stehengebliebenen Platzhalter.
    local val
    val="$(printf '%s\n' "$rendered" | grep -A1 'name: SMTP_FROM$' | tail -1)"
    [[ "$val" == *"@"* ]] \
      || { echo "${brand}: SMTP_FROM ohne aufgeloesten Mailwert: ${val}" >&2; return 1; }
    [[ "$val" != *'${'* ]] \
      || { echo "${brand}: SMTP_FROM-Platzhalter nicht substituiert: ${val}" >&2; return 1; }
  done
}

@test "T900028: SMTP_FROM steht in beiden ENVSUBST_VARS-Listen" {
  # Ohne Eintrag in workspace:deploy UND flux:render bliebe '${SMTP_FROM}'
  # literal im Manifest stehen — schlimmer als der urspruengliche Bug.
  local n
  n="$(grep -cF '$SMTP_FROM' "${REPO_ROOT}/Taskfile.yml")"
  [ "$n" -ge 2 ] || { echo "SMTP_FROM in nur ${n} envsubst-Listen" >&2; return 1; }
}
