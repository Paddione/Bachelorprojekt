#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/flux-render-artifact.sh — Render offline OCI artifact tree
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUT_DIR="out"
WEBSITE_IMAGE_OVERRIDE="${WEBSITE_IMAGE_TAG:-}"
BRETT_IMAGE_OVERRIDE="${BRETT_IMAGE_TAG:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --website-image)
      WEBSITE_IMAGE_OVERRIDE="$2"
      shift 2
      ;;
    --brett-image)
      BRETT_IMAGE_OVERRIDE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

# T002209: envsubst kennt kein ${VAR:-default} — nicht gesetzte Variablen werden
# zur leeren Zeichenkette substituiert. Ohne Default wuerde WEBSITE_IMAGE_TAG leer
# gerendert (image: ghcr.io/paddione/website:). Der Flux-Render-Pfad (render-fleet-
# artifact.yml) setzt WEBSITE_IMAGE_TAG aus dem Build-SHA, der Break-glass-Pfad und
# der Dev-Modus brauchen einen sicheren Fallback.
: "${WEBSITE_IMAGE_TAG:=latest}"
: "${BRETT_IMAGE_TAG:=latest}"
export WEBSITE_IMAGE_TAG BRETT_IMAGE_TAG

# T002174: environments/schema.yaml ist die autoritative Spezifikation und definiert für
# einzelne optionale Variablen ein Verhalten im leeren Fall. Der Taskfile-Render-Pfad
# implementiert diese Verträge (Taskfile.yml:2831, 2961, 3641), der Flux-Pfad tat es nicht
# und substituierte stattdessen den leeren Wert — was aus "Default anwenden" ein kaputtes
# Manifest machte (Endpoints rigger-gateway mit ip: "" ließ flux-mentolder dauerhaft rot
# stehen, wodurch Flux den gesamten Satz darin nicht mehr applizierte).
#
# Bewusst KEIN generischer "leere Variable = Fehler"-Check: über die vier Overlays hinweg
# gibt es dutzende legitim leerer ${VAR}-Referenzen — Shell-Variablen in ConfigMap-
# Skriptblöcken, Grafana-Dashboard-Templates und Platzhalter, die aus SealedSecrets
# stammen. Nur explizit spezifizierte Verträge gehören hierher.
apply_schema_defaults() {
  # schema.yaml:403 — "Defaults to COMFY_HOST_IP when empty."
  export RIGGER_HOST_IP="${RIGGER_HOST_IP:-${COMFY_HOST_IP:-}}"
}

render_component() {
  local overlay="$1" out="$2"
  # Dynamically extract ALL ${VAR} references from kustomize output.
  # This is the same proven pattern as .github/workflows/build-website.yml (lines ~184-192)
  # and ensures the allowlist never drifts.
  local rendered
  rendered="$(kustomize build "$overlay" --load-restrictor=LoadRestrictionsNone)"
  
  # grep exits 1 when the overlay has no ${VAR} refs at all; that's a valid outcome
  # (handled by the -z "$vars" branch below), not a script failure — || true keeps
  # set -e from aborting on the "no matches" case.
  local vars
  vars="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" | tr -d '${}' | sort -u | tr '\n' ' ')" || true

  # T002156: WEBSITE_CONFIG_SHA wird NICHT aus der Umgebung substituiert — der
  # Wert entsteht erst aus dem fertig substituierten Manifest (siehe unten).
  # Ohne diese Ausnahme setzt envsubst den ungesetzten Wert auf "" und die
  # Annotation ist dauerhaft leer: genau so ging T002154 live kaputt.
  local wants_config_sha=0
  if [[ " $vars " == *" WEBSITE_CONFIG_SHA "* ]]; then
    wants_config_sha=1
    vars="$(tr ' ' '\n' <<<"$vars" | sed '/^WEBSITE_CONFIG_SHA$/d;/^$/d' | tr '\n' ' ')"
  fi

  if [[ -z "$vars" ]]; then
    # No vars to substitute — write as-is
    echo "$rendered" > "$out"
    return
  fi
  
  # Build envsubst variable list (space-separated, each prefixed with $)
  local envsubst_vars=""
  for v in $vars; do
    envsubst_vars="${envsubst_vars}\$${v} "
  done
  
  # Wrap bare ${VAR} at end of line in double quotes (envsubst needs quoting context),
  # then substitute, then unwrap any $$ escaping envsubst introduced.
  sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' <<<"$rendered" \
    | envsubst "$envsubst_vars" \
    | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
    > "$out"

  # T002156: checksum/config NACH envsubst aus dem website-config-data-Block
  # bilden. Der gemeinsame Helper garantiert, dass alle drei Render-Pfade
  # (dieser hier, Taskfile website:deploy, build-website.yml) denselben Wert
  # berechnen — sonst ueberschreiben sie sich gegenseitig und loesen bei jedem
  # Flux-Reconcile einen unnoetigen Rollout aus.
  if (( wants_config_sha )); then
    local config_sha
    config_sha="$(WEBSITE_CONFIG_SHA="" "${SCRIPT_DIR}/website-config-sha.sh" < "$out")"
    if [[ -z "$config_sha" ]]; then
      echo "ERROR: website-config-sha.sh returned an empty checksum for $out." >&2
      exit 1
    fi
    WEBSITE_CONFIG_SHA="$config_sha" envsubst '$WEBSITE_CONFIG_SHA' < "$out" > "${out}.tmp"
    mv "${out}.tmp" "$out"
  fi

  # FAIL-CLOSED (T002156): eine LEER substituierte checksum/config ist genauso
  # kaputt wie ein uebrig gebliebener Platzhalter — der Check unten faengt nur
  # letzteres. `checksum/config: ""` bedeutet: die Annotation aendert sich nie,
  # loest also nie einen Rollout aus, und ueberschreibt still den Wert, den ein
  # anderer Render-Pfad gesetzt hat.
  if grep -qE '^\s*checksum/config: *("")?\s*$' "$out"; then
    echo "ERROR: checksum/config is empty in $out — the annotation would never" >&2
    echo "       change and would silently override other render paths." >&2
    exit 1
  fi

  # FAIL-CLOSED: after substitution, check for any remaining unsubstituted ${VAR}
  # references. If any exist, the build fails instead of silently shipping a broken
  # manifest with literal placeholders (secret-exposure risk / fail-open).
  if grep -qE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$out"; then
    echo "ERROR: Unsubstituted variable references remain in $out after envsubst." >&2
    echo "       The following vars were not defined in the environment:" >&2
    grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$out" | sort -u >&2
    echo "       Ensure all referenced env vars are set or add them to the allowlist." >&2
    exit 1
  fi
}

cd "$PROJECT_DIR"

# 1. Platform
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/platform"
  render_component prod-fleet/platform "${OUT_DIR}/platform/platform.yaml"
)

# 1b. Dev (workspace-dev namespace)
#
# T002174: environments/schema.yaml:466 spezifiziert für DEV_DOMAIN
# "Empty disables the dev stack." Der Renderer setzte den leeren Wert stattdessen
# stumpf ein, wodurch k3d/dev-stack/dev-ingress.yaml als `host: "*."` und
# `tls.hosts[0]: ""` im Artefakt landete. Beides ist für die Kubernetes-API ungültig,
# die flux-dev-Kustomization scheiterte am Dry-Run — und Flux appliziert dann den
# GESAMTEN Satz darin nicht mehr, nicht nur das kaputte Ingress.
# Aus einer Abschaltung wurde so eine Fehlkonfiguration.
(
  set +u
  # Kein `|| true`: schlug env-resolve fehl, lief der Render mit leerer Umgebung
  # weiter und schrieb ein Manifest voller leer substituierter Werte ins Artefakt.
  if ! source scripts/env-resolve.sh dev 2>/dev/null; then
    echo "ERROR: env-resolve.sh dev failed — refusing to render the dev stack with" >&2
    echo "       an empty environment (would emit empty-substituted manifests)." >&2
    exit 1
  fi
  mkdir -p "${OUT_DIR}/dev"
  if [[ -z "${DEV_DOMAIN:-}" ]]; then
    # Leeres, gültiges Kustomize-Verzeichnis statt gar keines: die flux-dev
    # Kustomization zeigt fest auf path=./dev mit prune=true. Fehlte das Verzeichnis,
    # scheiterte sie an "path not found" — also wieder rot, nur mit anderem Text.
    # So wird sie Ready, appliziert nichts und prunt einen etwaigen Altbestand sauber weg.
    echo "flux-render: DEV_DOMAIN is empty — rendering an empty dev stack (schema.yaml contract)."
    cat > "${OUT_DIR}/dev/kustomization.yaml" <<'EOF'
# Rendered empty by scripts/flux-render-artifact.sh: DEV_DOMAIN is unset for this
# environment, and environments/schema.yaml defines that as "Empty disables the dev stack".
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: []
EOF
  else
    render_component prod-fleet/dev "${OUT_DIR}/dev/dev.yaml"
  fi
)

# 2. Mentolder
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/mentolder"
  render_component prod-fleet/mentolder "${OUT_DIR}/mentolder/mentolder.yaml"
)

# 3. Korczewski
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski"
  render_component prod-fleet/korczewski "${OUT_DIR}/korczewski/korczewski.yaml"
)

# 4. Website Mentolder
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-mentolder"
  render_component prod-fleet/website-mentolder "${OUT_DIR}/website-mentolder/website-mentolder.yaml"
)

# 5. Website Korczewski
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-korczewski"
  render_component prod-fleet/website-korczewski "${OUT_DIR}/website-korczewski/website-korczewski.yaml"
)

# 6. Sealed Secrets (copied static, filtered per brand if needed)
# Nested per-brand: both files carry a SealedSecret for the shared
# grafana-oidc secret (namespace monitoring), so a single flat kustomize
# build across both would collide on that resource id. Separate
# directories give kustomize-controller one independent build per brand.
mkdir -p "${OUT_DIR}/sealed-secrets/mentolder" "${OUT_DIR}/sealed-secrets/korczewski"
cp environments/sealed-secrets/fleet-mentolder.yaml "${OUT_DIR}/sealed-secrets/mentolder/fleet-mentolder.yaml"
cp environments/sealed-secrets/fleet-korczewski.yaml "${OUT_DIR}/sealed-secrets/korczewski/fleet-korczewski.yaml"

# 7. Cluster CRs (top-level only under flux/clusters/fleet/, excluding bootstrap/)
mkdir -p "${OUT_DIR}/clusters/fleet"
find flux/clusters/fleet -maxdepth 1 -name "*.yaml" -exec cp {} "${OUT_DIR}/clusters/fleet/" \;

echo "Successfully rendered Flux OCI artifact tree to ${OUT_DIR}"
