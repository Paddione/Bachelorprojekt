#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/flux-render-artifact.sh — Render offline OCI artifact tree
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUT_DIR="out"
# WEBSITE_IMAGE_OVERRIDE steuert den Image-NAMEN (--website-image CLI-Flag),
# WEBSITE_IMAGE_TAG steuert den Image-Tag — getrennte Konzepte, nicht koppeln (T002209).
# Siehe Task 2.2 fuer die Default-Werte des Tags.
WEBSITE_IMAGE_OVERRIDE=""
BRETT_IMAGE_OVERRIDE=""

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
: "${WEBSITE_IMAGE_DIGEST:=}"
: "${BRETT_IMAGE_DIGEST:=}"
export WEBSITE_IMAGE_TAG WEBSITE_IMAGE_DIGEST BRETT_IMAGE_DIGEST

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

  # T002306: Variablen, die im Manifest bewusst als $${VAR} geschrieben sind,
  # sind LAUFZEIT-Variablen — die Shell IM Container soll sie expandieren, nicht
  # der Renderer. Der Extraktions-Regex oben sieht durch das $$ hindurch und
  # nimmt sie sonst in ihre EIGENE Ersetzungsliste auf; envsubst macht aus einer
  # nicht gesetzten Variable dann "" und uebrig bleibt das erste Dollarzeichen.
  # Der fail-closed-Check unten faengt das nicht, weil substituiert ja WURDE.
  #
  # Genau so gingen am 2026-07-27 die shared-db-Passwoerter verloren: aus
  #   ALTER USER nextcloud WITH PASSWORD '$${NEXTCLOUD_DB_PASSWORD}';
  # wurde  ... PASSWORD '$';  — nextcloud, vaultwarden, videovault und pocket_id
  # waren aus ihrer eigenen Datenbank ausgesperrt, SSO plattformweit down.
  # Die klammerlose Form $$VAR war nie betroffen, weil der Regex sie nicht sieht.
  local runtime_vars
  runtime_vars="$(grep -oE '\$\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" \
    | sed -E 's/^\$\$\{//; s/\}$//' | sort -u | tr '\n' ' ')" || true
  local rv
  for rv in $runtime_vars; do
    vars="$(tr ' ' '\n' <<<"$vars" | sed "/^${rv}\$/d;/^\$/d" | tr '\n' ' ')"
  done

  if [[ -z "$vars" ]]; then
    # Nichts zu substituieren — aber das $$-Unwrapping muss trotzdem laufen,
    # sonst blieben $${VAR}/$$VAR als Doppel-Dollar im Manifest stehen.
    sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' <<<"$rendered" > "$out"
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
  # T002306: Die als $${VAR} markierten Laufzeit-Variablen stehen nach dem
  # Unwrapping als ${VAR} im Manifest — genau so sollen sie dort stehen. Sie
  # sind hier deshalb ausgenommen; alles andere bleibt ein harter Fehler.
  local leftover
  leftover="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$out" | sort -u)" || true
  for rv in $runtime_vars; do
    leftover="$(grep -vxF "\${${rv}}" <<<"$leftover" || true)"
  done
  if [[ -n "$leftover" ]]; then
    echo "ERROR: Unsubstituted variable references remain in $out after envsubst." >&2
    echo "       The following vars were not defined in the environment:" >&2
    echo "$leftover" >&2
    echo "       Set them, add them to the allowlist, or — if the container shell" >&2
    echo "       is meant to expand them at runtime — write them as \$\${VAR}." >&2
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
# T002174: environments/schema.yaml:474 spezifiziert für DEV_DOMAIN
# "Empty disables the dev stack." Der Renderer setzte den leeren Wert stattdessen
# stumpf ein, wodurch k3d/dev-stack/dev-ingress.yaml als `host: "*."` und
# `tls.hosts[0]: ""` im Artefakt landete. Beides ist für die Kubernetes-API ungültig,
# die flux-dev-Kustomization scheiterte am Dry-Run — und Flux appliziert dann den
# GESAMTEN Satz darin nicht mehr, nicht nur das kaputte Ingress.
# Aus einer Abschaltung wurde so eine Fehlkonfiguration.
#
# T002630: DEV_DOMAIN kommt seit der Env-Entflechtung aus environments/dev-cluster.yaml.
# environments/dev.yaml beschreibt die lokale k3d-Umgebung (keine oeffentliche Domain)
# und darf den Cluster-Dev-Stack nicht mehr abschalten. Siehe environments/schema.yaml
# DEV_DOMAIN-Doku.
(
  set +u
  # Kein `|| true`: schlug env-resolve fehl, lief der Render mit leerer Umgebung
  # weiter und schrieb ein Manifest voller leer substituierter Werte ins Artefakt.
  if ! source scripts/env-resolve.sh dev-cluster 2>/dev/null; then
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

# 3b. Mentolder Jobs (T002207)
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/mentolder-jobs"
  render_component prod-fleet/mentolder-jobs "${OUT_DIR}/mentolder-jobs/mentolder-jobs.yaml"
)

# 3c. Korczewski Jobs (T002207)
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski-jobs"
  render_component prod-fleet/korczewski-jobs "${OUT_DIR}/korczewski-jobs/korczewski-jobs.yaml"
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

# 8. Validation gate — check rendered YAML is parseable before the
# artifact is pushed. Catches empty renders, envsubst-corrupted output,
# and YAML structural issues that would make Flux dry-run fail.
# (T002207)
echo "flux-render: running validation gate..."
VALIDATION_FAILED=0
for tree_dir in "${OUT_DIR}/mentolder" "${OUT_DIR}/korczewski" "${OUT_DIR}/mentolder-jobs" "${OUT_DIR}/korczewski-jobs" "${OUT_DIR}/platform" "${OUT_DIR}/website-mentolder" "${OUT_DIR}/website-korczewski"; do
  manifest="${tree_dir}/$(basename "${tree_dir}").yaml"
  if [ ! -f "$manifest" ]; then
    # Empty component trees (e.g. dev with DEV_DOMAIN="") write a
    # kustomization.yaml instead of a combined .yaml — skip those.
    continue
  fi
  # Check the file is valid multi-document YAML with apiVersion on each doc
  if python3 -c "
import yaml, sys

# [T002236] Upstream CRDs carry YAML 1.1 value-key scalars that PyYAML's
# SafeLoader has no constructor for. The kube-prometheus-stack AlertManager
# matchType enum is one: a bare '=' among quoted operators.
#
#     enum:
#     - '!='
#     - =        <-- tag:yaml.org,2002:value
#     - =~
#     - '!~'
#
# Go-YAML — what kubectl, kustomize and Flux actually parse with — reads this
# without complaint, so the manifest is correct and must not be reformatted;
# it is vendored upstream content, not hand-written YAML. Only this validator
# rejected it, and because the gate is fail-closed it aborted the artifact push
# for BOTH brands on every main push from 2026-07-26 18:19 onward, silently
# freezing prod at the last good artifact.
#
# Treat the tag as the plain scalar it is and keep the rest of the gate strict.
yaml.SafeLoader.add_constructor(
    'tag:yaml.org,2002:value', lambda loader, node: loader.construct_scalar(node))

with open('${manifest}') as f:
    docs = list(yaml.safe_load_all(f))
if not docs:
    print('ERROR: empty document', file=sys.stderr)
    sys.exit(1)
for i, doc in enumerate(docs):
    if doc is None:
        continue
    if not doc.get('apiVersion'):
        print(f'ERROR: doc {i} in ${manifest} has no apiVersion', file=sys.stderr)
        sys.exit(1)
print(f'OK: {len(docs)} docs')
" 2>&1; then
    : # valid
  else
    echo "VALIDATION FAILED: ${manifest}" >&2
    VALIDATION_FAILED=1
  fi
done
if [ "$VALIDATION_FAILED" -ne 0 ]; then
  echo "ERROR: Render validation failed — aborting artifact push." >&2
  exit 1
fi
echo "flux-render: validation gate passed."

echo "Successfully rendered Flux OCI artifact tree to ${OUT_DIR}"
