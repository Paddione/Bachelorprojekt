#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/flux-render-artifact.sh — Render offline OCI artifact tree
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# T901791: envsubst-Whitelist (Subst-Liste + Skip-Liste) — S4-Referenz, die
# Tests pinnen dieses Sourcing (test_envsubst_whitelist.py).
source "${SCRIPT_DIR}/lib/render-subst-list.sh"

OUT_DIR="out"
# --only a,b rendert nur die genannten Komponenten (platform, mentolder,
# korczewski, korczewski-jobs, website-mentolder, website-korczewski, korczewski-auth,
# staging, website-staging, coturn, office, rustdesk,
# sealed-secrets-{mentolder,korczewski,staging}, clusters).
# Leer = alles (Default).
ONLY=""
KNOWN_COMPONENTS="platform mentolder korczewski korczewski-jobs website-mentolder website-korczewski korczewski-auth staging website-staging coturn office rustdesk sealed-secrets-mentolder sealed-secrets-korczewski sealed-secrets-staging clusters"
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
    --only)
      ONLY="$2"
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

if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra _COMPS <<< "$ONLY"
  for _comp in "${_COMPS[@]}"; do
    _valid=0
    for _known in $KNOWN_COMPONENTS; do
      if [[ "$_comp" == "$_known" ]]; then
        _valid=1
        break
      fi
    done
    if [[ $_valid -eq 0 ]]; then
      echo "unbekannte Komponente: $_comp" >&2
      exit 2
    fi
  done
fi

# want <komponente>: true, wenn kein --only gesetzt ist oder die Komponente darin steht.
want() { [[ -z "$ONLY" || ",${ONLY}," == *",$1,"* ]]; }

mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

# T002209: envsubst kennt kein ${VAR:-default} — nicht gesetzte Variablen werden
# zur leeren Zeichenkette substituiert. Ohne Default wuerde WEBSITE_IMAGE_TAG leer
# gerendert (image: ghcr.io/paddione/website:). Der Flux-Render-Pfad (render-fleet-
# artifact.yml) setzt WEBSITE_IMAGE_TAG aus dem Build-SHA, der Break-glass-Pfad und
# der Dev-Modus brauchen einen sicheren Fallback.
: "${WEBSITE_IMAGE_TAG:=latest}"
# T004041: Kein leeres :=-Export fuer WEBSITE_IMAGE_DIGEST/BRETT_IMAGE_DIGEST —
# env-resolve.sh liefert sie in den Subshells aus environments/fleet-*.yaml.
# Ein leerer Export wuerde nach dem Caller-Respect-Fix (T004041) als
# "Caller-Wert" gelten und die env-file-Placeholder unterdruecken, sodass das
# Image auf `@` endete. Der Placeholder-Guard unten faengt stattdessen die
# Placeholder selbst fail-closed.
export WEBSITE_IMAGE_TAG

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
  # T901777: Cluster-CIDRs fuer die NetworkPolicies (k3d/network-policies.yaml,
  # k3d/website.yaml). Ohne Default wuerde envsubst hier "" einsetzen und ein
  # `cidr: ""` ins Fleet-Artefakt schreiben (fail-open — der Leftover-Check
  # unten faengt nur unsubstituierte ${VAR}, keine leer substituierten).
  export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"
  export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"
  export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"
}

render_component() {
  local overlay="$1" out="$2"
  local rendered
  rendered="$(kustomize build "$overlay" --load-restrictor=LoadRestrictionsNone)"

  # T901791: Die Subst-Liste kommt aus der Whitelist-Lib (nur gesetzte
  # Owned-Vars, ohne $$-Runtime und Skip-Liste) statt Alles-Extraktion.
  # Die Alles-Extraktion steht noch in .github/workflows/build-website.yml
  # (eigener Render-Pfad, Follow-up-Kandidat) — hier ist sie ersetzt, weil
  # sie fremde Platzhalter (Grafana ${datasource} u.a.) leer substituierte.
  local vars
  vars="$(render_subst_list <<<"$rendered")"

  # T002156: WEBSITE_CONFIG_SHA wird NICHT aus der Umgebung substituiert — der
  # Wert entsteht erst aus dem fertig substituierten Manifest (siehe unten).
  # Ohne diese Ausnahme setzt envsubst den ungesetzten Wert auf "" und die
  # Annotation ist dauerhaft leer: genau so ging T002154 live kaputt.
  # Erkennung am TEXT (nicht an $vars — die Lib schliesst den Namen
  # grundsaetzlich aus, der Sonderpfad unten substituiert separat).
  local wants_config_sha=0
  if grep -qE '\$\{WEBSITE_CONFIG_SHA\}' <<<"$rendered"; then
    wants_config_sha=1
  fi

  # T002306: Variablen, die im Manifest bewusst als $${VAR} geschrieben sind,
  # sind LAUFZEIT-Variablen — die Shell IM Container soll sie expandieren, nicht
  # der Renderer. Siehe Lib-Kommentar zur Historie (2026-07-27 shared-db,
  # T901780 klammerloses $$VAR). Die Lib schliesst sie von der Substitution
  # aus; hier werden sie zusaetzlich fuer die Leftover-Ausnahme gesammelt.
  # (Literal-identisch mit der Lib — der T901780-Kopplungstest pinnt beide.)
  local runtime_vars
  runtime_vars="$(grep -oE '\$\$(\{)?[A-Za-z_][A-Za-z0-9_]*\}?' <<<"$rendered" \
    | sed -E 's/^\$\$\{//; s/^\$\$//; s/\}$//' | sort -u | tr '\n' ' ')" || true
  local rv sv

  if [[ -z "$vars" ]]; then
    # Nichts zu substituieren — aber das $$-Unwrapping muss trotzdem laufen,
    # sonst blieben $${VAR}/$$VAR als Doppel-Dollar im Manifest stehen.
    sed -E 's/\$\$([a-zA-Z0-9_({!?])/$\1/g' <<<"$rendered" > "$out"
    # T900029: Render-Guard — leere Wildcard-Reste ("*.") und unsubstituierte
    # ${VAR} in dnsNames/Host-Zeilen sind ein Build-Fehler, kein Prod-Zertifikat.
    "${SCRIPT_DIR}/render-guard.sh" "$out"
    return
  fi
  
  # Build envsubst variable list (space-separated, each prefixed with $)
  local envsubst_vars=""
  for v in $vars; do
    envsubst_vars="${envsubst_vars}\$${v} "
  done
  
  # Wrap bare ${VAR} at end of line in double quotes (envsubst needs quoting context),
  # then substitute, then unwrap any $$ escaping envsubst introduced.
  #
  # T012503: Das Unwrapping deckt neben Variablennamen auch (, !, ? ab. Wer ein
  # ConfigMap-Skript escaped, verdoppelt jedes Dollarzeichen — auch $$(cmd),
  # $$! und $$?. envsubst fasst diese drei zwar ohnehin nicht an, aber ein
  # Unwrapping, das sie auslaesst, liefert sie als literales $$ aus: in der
  # Shell ist $$ die PID, aus $$(seq 1 3) wird "1234(seq 1 3)" und das Skript
  # bricht mit einem Syntaxfehler ab. Genau so lag der gitlab-runner ab
  # bc80f246b im CrashLoop.
  sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' <<<"$rendered" \
    | envsubst "$envsubst_vars" \
    | sed -E 's/\$\$([a-zA-Z0-9_({!?])/$\1/g' \
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
  # T901791: RENDER_SKIP_VARS (fremde Platzhalter wie Grafana ${datasource})
  # ueberleben gewollt und sind ebenfalls ausgenommen.
  local leftover
  leftover="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$out" | sort -u)" || true
  for rv in $runtime_vars; do
    leftover="$(grep -vxF "\${${rv}}" <<<"$leftover" || true)"
  done
  for sv in $RENDER_SKIP_VARS; do
    leftover="$(grep -vxF "\${${sv}}" <<<"$leftover" || true)"
  done
  if [[ -n "$leftover" ]]; then
    echo "ERROR: Unsubstituted variable references remain in $out after envsubst." >&2
    echo "       The following vars were not defined in the environment:" >&2
    echo "$leftover" >&2
    echo "       Set them, or — if the container shell" >&2
    echo "       is meant to expand them at runtime — write them as \$\${VAR}." >&2
    echo "       Foreign placeholders (vendored content) belong in RENDER_SKIP_VARS" >&2
    echo "       (scripts/lib/render-subst-list.sh), never in the subst list." >&2
    exit 1
  fi

  # T900029: Render-Guard — leere Wildcard-Reste ("*.") und unsubstituierte
  # ${VAR} in dnsNames/Host-Zeilen sind ein Build-Fehler (fail-closed). Steht
  # hinter dem generischen Leftover-Check, weil leer substituierte Werte dort
  # durchfallen (die Substitution HAT stattgefunden).
  "${SCRIPT_DIR}/render-guard.sh" "$out"
}

cd "$PROJECT_DIR"

# 1. Platform
if want platform; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/platform"
  render_component prod-fleet/platform "${OUT_DIR}/platform/platform.yaml"
)
fi

# 2. Mentolder
if want mentolder; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/mentolder"
  render_component prod-fleet/mentolder "${OUT_DIR}/mentolder/mentolder.yaml"
)
fi

# 3. Korczewski
if want korczewski; then
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski"
  render_component prod-fleet/korczewski "${OUT_DIR}/korczewski/korczewski.yaml"
)
fi

# 3b. Mentolder Jobs entfallen mit T016558 (Stufe 2): flux-mentolder-jobs
# aus Prod entfernt; Seed-Jobs laufen bei Bedarf manuell bzw. via k3d-Flow.

# 3c. Korczewski Jobs (T002207)
if want korczewski-jobs; then
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski-jobs"
  render_component prod-fleet/korczewski-jobs "${OUT_DIR}/korczewski-jobs/korczewski-jobs.yaml"
)
fi

# 4. Website Mentolder
if want website-mentolder; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-mentolder"
  render_component prod-fleet/website-mentolder "${OUT_DIR}/website-mentolder/website-mentolder.yaml"
)
fi

# 5. Website Korczewski
if want website-korczewski; then
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-korczewski"
  render_component prod-fleet/website-korczewski "${OUT_DIR}/website-korczewski/website-korczewski.yaml"
)
fi

# 5a. Korczewski Auth (T901440) — eigene Pocket ID, Client-Seed und
# Wildcard-Zertifikat im workspace-korczewski Namespace; DB/Rollen aus der
# zentralen shared-db (p1). Produktive Domains erst nach Env-Substitution.
if want korczewski-auth; then
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski-auth"
  render_component prod-fleet/korczewski-auth "${OUT_DIR}/korczewski-auth/korczewski-auth.yaml"
)
fi

# 5b. Staging app stack (T015004) — workspace-staging via prod-fleet/staging.
#     Verdrahtet den bislang GitOps-verwaisten Staging-Namespace (Ursache von
#     T014538/SA-FC-02) in den Flux-Pfad.
if want staging; then
(
  set +u
  source scripts/env-resolve.sh staging 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/staging"
  render_component prod-fleet/staging "${OUT_DIR}/staging/staging.yaml"
)
fi

# 5c. Website Staging (T015004) — website-staging namespace, Ziel der
#     Staging-CronJobs (website.website-staging.svc.cluster.local).
if want website-staging; then
(
  set +u
  source scripts/env-resolve.sh staging 2>/dev/null
  apply_schema_defaults
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-staging"
  render_component prod-fleet/website-staging "${OUT_DIR}/website-staging/website-staging.yaml"
)
fi

# 5d. Coturn/Janus (T016529) — Talk-HPB auf gekko-hetzner-2 (hostNetwork,
#     ohne WG). TURN_* aus fleet-mentolder; Secrets kommen aus dem
#     SealedSecrets-Pfad (./sealed-secrets/mentolder), TLS via eigenes
#     Certificate im Overlay (keine stale Kopie).
if want coturn; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  mkdir -p "${OUT_DIR}/coturn"
  render_component prod-fleet/coturn "${OUT_DIR}/coturn/coturn.yaml"
)
fi

# 5e. Collabora (office-stack) fuer mentolder. Die COLLABORA_*-Werte leitet
#     sonst nur Taskfile.platform.yml (fleet:shared-services) ab; hier dieselbe
#     Ableitung, aber nur fuer mentolder. aliasgroup1 ist ein Regex: `\\.`
#     ergibt nach dem Quoten durch render_component ein literales `\.`.
if want office; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  export COLLABORA_HOST="office.${PROD_DOMAIN}"
  export COLLABORA_SERVER_NAME=""
  export COLLABORA_ALIASGROUP1='https://files\\.'"${PROD_DOMAIN}"':443'
  export COLLABORA_ALIASGROUP2=""
  export COLLABORA_SSL_TERMINATION="true"
  export COLLABORA_TLS_SECRET="${TLS_SECRET_NAME:-workspace-wildcard-tls}"
  export COLLABORA_INGRESS_MIDDLEWARES="workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd"
  mkdir -p "${OUT_DIR}/office"
  render_component prod-fleet/office "${OUT_DIR}/office/office.yaml"
)
fi

# 5f. RustDesk-Relay (hbbs/hbbr) fuer mentolder. Substituiert wird nur
#     ${TURN_NODE} (Knoten-Pin wie coturn); always-on, ohne den
#     On-demand-Sleeper (T015170).
if want rustdesk; then
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  apply_schema_defaults
  mkdir -p "${OUT_DIR}/rustdesk"
  render_component prod-fleet/rustdesk "${OUT_DIR}/rustdesk/rustdesk.yaml"
)
fi

# 6. Sealed Secrets (copied static, filtered per brand if needed)
# Nested per-brand: both files carry a SealedSecret for the shared
# grafana-oidc secret (namespace monitoring), so a single flat kustomize
# build across both would collide on that resource id. Separate
# directories give kustomize-controller one independent build per brand.
# Je Brand einzeln schaltbar (--only sealed-secrets-mentolder usw.).
if want sealed-secrets-mentolder; then
  mkdir -p "${OUT_DIR}/sealed-secrets/mentolder"
  cp environments/sealed-secrets/fleet-mentolder.yaml "${OUT_DIR}/sealed-secrets/mentolder/fleet-mentolder.yaml"
fi
if want sealed-secrets-korczewski; then
  mkdir -p "${OUT_DIR}/sealed-secrets/korczewski"
  cp environments/sealed-secrets/fleet-korczewski.yaml "${OUT_DIR}/sealed-secrets/korczewski/fleet-korczewski.yaml"
fi
# T015004: Staging-SealedSecrets sind bereits auf workspace-staging/
# website-staging/monitoring gesealed (environments/sealed-secrets/staging.yaml).
if want sealed-secrets-staging; then
  mkdir -p "${OUT_DIR}/sealed-secrets/staging"
  cp environments/sealed-secrets/staging.yaml "${OUT_DIR}/sealed-secrets/staging/staging.yaml"
fi

# 7. Cluster CRs (top-level only under flux/clusters/fleet/, excluding bootstrap/)
if want clusters; then
mkdir -p "${OUT_DIR}/clusters/fleet"
find flux/clusters/fleet -maxdepth 1 -name "*.yaml" -exec cp {} "${OUT_DIR}/clusters/fleet/" \;
fi

# 8. Validation gate — check rendered YAML is parseable before the
# artifact is pushed. Catches empty renders, envsubst-corrupted output,
# and YAML structural issues that would make Flux dry-run fail.
# (T002207)
echo "flux-render: running validation gate..."
VALIDATION_FAILED=0
for tree_dir in "${OUT_DIR}/mentolder" "${OUT_DIR}/korczewski" "${OUT_DIR}/korczewski-jobs" "${OUT_DIR}/platform" "${OUT_DIR}/website-mentolder" "${OUT_DIR}/website-korczewski" "${OUT_DIR}/korczewski-auth" "${OUT_DIR}/staging" "${OUT_DIR}/website-staging" "${OUT_DIR}/dev-pod" "${OUT_DIR}/coturn" "${OUT_DIR}/office" "${OUT_DIR}/rustdesk"; do
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

# T004041: FAIL-CLOSED — die Placeholder-Digests (sha256:1111.../2222...) sind
# nur der dokumentierte Offline-Fallback in environments/fleet-*.yaml, aber nie
# ein gueltiges Artefakt: sie pinnen ein nicht existierendes Image und
# versetzen jede Brand in ImagePullBackOff. CI setzt die echten Digests via
# scripts/resolve-image-digest.sh (render-fleet-artifact.yml) — wer offline
# rendert, exportiert sie selbst.
PLACEHOLDER_HITS="$(grep -rl \
  -e 'sha256:1111111111111111111111111111111111111111111111111111111111111111' \
  -e 'sha256:2222222222222222222222222222222222222222222222222222222222222222' \
  "${OUT_DIR}" 2>/dev/null || true)"
if [ -n "$PLACEHOLDER_HITS" ]; then
  echo "ERROR: placeholder digest found in rendered artifact:" >&2
  echo "$PLACEHOLDER_HITS" >&2
  echo "       CI sets the real digests via scripts/resolve-image-digest.sh;" >&2
  echo "       offline renders must export WEBSITE_IMAGE_DIGEST/BRETT_IMAGE_DIGEST." >&2
  exit 1
fi

echo "Successfully rendered Flux OCI artifact tree to ${OUT_DIR}"
