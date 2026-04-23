#!/usr/bin/env bash
# scripts/secrets-audit.sh — Interactive cross-namespace secret consistency check
#
# Usage: ./scripts/secrets-audit.sh [ENV]
#        ENV: dev (default) | mentolder | korczewski
#
# Displays:
#   1. Cross-namespace secret sync pairs — highlights mismatches, lets you sync.
#   2. Solo secrets (no sync partner) — numbered, lets you set a new value.
#   3. ConfigMap values (domain-config) — numbered, lets you set a new value.

set -euo pipefail

# ── Colors (disabled when not a TTY) — declared early for use in env picker ──
if [[ -t 1 ]]; then
  RED=$'\033[0;31m' GRN=$'\033[0;32m' YLW=$'\033[0;33m'
  CYN=$'\033[0;36m' BLD=$'\033[1m'    DIM=$'\033[2m'   RST=$'\033[0m'
else
  RED='' GRN='' YLW='' CYN='' BLD='' DIM='' RST=''
fi

# ── Environment selection ─────────────────────────────────────────────────────
ENVS=(dev mentolder korczewski)

pick_env() {
  echo
  echo "${BLD}Select environment:${RST}"
  local i=1
  for e in "${ENVS[@]}"; do
    printf "  ${BLD}[%d]${RST} %s\n" "$i" "$e"
    ((i++)) || true
  done
  echo

  while true; do
    read -rp "${BLD}Environment [1-${#ENVS[@]}]: ${RST}" pick
    if [[ "$pick" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick <= ${#ENVS[@]} )); then
      echo "${ENVS[$((pick - 1))]}"
      return
    fi
    echo "${YLW}Invalid choice. Enter a number between 1 and ${#ENVS[@]}.${RST}"
  done
}

if [[ $# -ge 1 ]]; then
  ENV="$1"
  case "$ENV" in
    dev|mentolder|korczewski) ;;
    *)
      echo "Unknown environment: $ENV" >&2
      echo "Usage: $0 [dev|mentolder|korczewski]" >&2
      exit 1 ;;
  esac
else
  ENV=$(pick_env)
fi

# ── kubectl context ───────────────────────────────────────────────────────────
case "$ENV" in
  dev)        K_ARGS=(--context k3d-dev) ;;
  mentolder)  K_ARGS=(--context mentolder) ;;
  korczewski) K_ARGS=(--context korczewski) ;;
esac
K=(kubectl "${K_ARGS[@]}")

# ── Group definitions — cross-namespace secret pairs ─────────────────────────
# Parallel arrays — one entry per sync group.
#
# GROUP_MEMBERS: pipe-separated "NAMESPACE:SECRET:KEY" tuples.
#   • First tuple is always the canonical SOURCE (workspace-secrets).
#   • Additional tuples are the DESTINATIONS that must mirror the source.
#   • Destination KEY may differ from source KEY (e.g. NEXTCLOUD_ADMIN_PASS).
#
# GROUP_RESTARTS: space-separated "NAMESPACE:DEPLOYMENT" pairs rolled after sync.

GROUP_LABELS=(
  "SIGNALING_SECRET"
  "TURN_SECRET"
  "COLLABORA_ADMIN_PASSWORD"
  "KEYCLOAK_ADMIN_PASSWORD"
  "CRON_SECRET"
  "WEBSITE_OIDC_SECRET"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "SMTP_PASSWORD"
  "NEXTCLOUD_ADMIN_PASSWORD"
)

GROUP_MEMBERS=(
  "workspace:workspace-secrets:SIGNALING_SECRET|coturn:coturn-secrets:SIGNALING_SECRET"
  "workspace:workspace-secrets:TURN_SECRET|coturn:coturn-secrets:TURN_SECRET"
  "workspace:workspace-secrets:COLLABORA_ADMIN_PASSWORD|workspace-office:collabora-secrets:COLLABORA_ADMIN_PASSWORD"
  "workspace:workspace-secrets:KEYCLOAK_ADMIN_PASSWORD|website:website-secrets:KEYCLOAK_ADMIN_PASSWORD"
  "workspace:workspace-secrets:CRON_SECRET|website:website-secrets:CRON_SECRET"
  "workspace:workspace-secrets:WEBSITE_OIDC_SECRET|website:website-secrets:WEBSITE_OIDC_SECRET"
  "workspace:workspace-secrets:STRIPE_SECRET_KEY|website:website-secrets:STRIPE_SECRET_KEY"
  "workspace:workspace-secrets:STRIPE_WEBHOOK_SECRET|website:website-secrets:STRIPE_WEBHOOK_SECRET"
  "workspace:workspace-secrets:SMTP_PASSWORD|website:website-secrets:SMTP_PASSWORD"
  "workspace:workspace-secrets:NEXTCLOUD_ADMIN_PASSWORD|website:website-secrets:NEXTCLOUD_ADMIN_PASS|website:website-secrets:NEXTCLOUD_CALDAV_PASSWORD"
)

GROUP_RESTARTS=(
  "coturn:coturn coturn:janus"
  "coturn:coturn coturn:janus"
  "workspace-office:collabora"
  "website:website"
  "website:website"
  "website:website"
  "website:website"
  "website:website"
  "website:website"
  "website:website"
)

NUM_GROUPS=${#GROUP_LABELS[@]}

# ── Solo secret definitions — single-source, no sync partner ─────────────────
# Each SOLO_MEMBERS entry: "NAMESPACE:SECRET:KEY"

SOLO_LABELS=(
  "KEYCLOAK_DB_PASSWORD"
  "NEXTCLOUD_OIDC_SECRET"
  "NEXTCLOUD_DB_PASSWORD"
  "MEETINGS_DB_PASSWORD"
  "DOCS_OIDC_SECRET"
  "TRAEFIK_OIDC_SECRET"
  "OAUTH2_PROXY_COOKIE_SECRET"
  "SHARED_DB_PASSWORD"
  "WHITEBOARD_JWT_SECRET"
  "VAULTWARDEN_DB_PASSWORD"
  "VAULTWARDEN_ADMIN_TOKEN"
  "VAULTWARDEN_OIDC_SECRET"
  "WEBSITE_DB_PASSWORD"
  "RECORDING_SECRET"
  "TRANSCRIBER_BOT_PASSWORD"
  "TRANSCRIBER_SECRET"
  "CLAUDE_CODE_OIDC_SECRET"
  "CLAUDE_CODE_WEBUI_SECRET_KEY"
  "GITHUB_PAT"
  "DOCUSEAL_SECRET_KEY_BASE"
  "DOCUSEAL_API_TOKEN"
  "DOCUSEAL_DB_PASSWORD"
  "GHCR_PAT"
  "IPV64_API_KEY"
  "SMTP_FROM"
  "SMTP_USER"
  "BACKUP_PASSPHRASE"
  "traefik-basic-auth: users (htpasswd)"
  "coturn-secrets: SIGNALING_SECRET"
  "coturn-secrets: TURN_SECRET"
  "collabora-secrets: COLLABORA_ADMIN_PASSWORD"
)

SOLO_MEMBERS=(
  "workspace:workspace-secrets:KEYCLOAK_DB_PASSWORD"
  "workspace:workspace-secrets:NEXTCLOUD_OIDC_SECRET"
  "workspace:workspace-secrets:NEXTCLOUD_DB_PASSWORD"
  "workspace:workspace-secrets:MEETINGS_DB_PASSWORD"
  "workspace:workspace-secrets:DOCS_OIDC_SECRET"
  "workspace:workspace-secrets:TRAEFIK_OIDC_SECRET"
  "workspace:workspace-secrets:OAUTH2_PROXY_COOKIE_SECRET"
  "workspace:workspace-secrets:SHARED_DB_PASSWORD"
  "workspace:workspace-secrets:WHITEBOARD_JWT_SECRET"
  "workspace:workspace-secrets:VAULTWARDEN_DB_PASSWORD"
  "workspace:workspace-secrets:VAULTWARDEN_ADMIN_TOKEN"
  "workspace:workspace-secrets:VAULTWARDEN_OIDC_SECRET"
  "workspace:workspace-secrets:WEBSITE_DB_PASSWORD"
  "workspace:workspace-secrets:RECORDING_SECRET"
  "workspace:workspace-secrets:TRANSCRIBER_BOT_PASSWORD"
  "workspace:workspace-secrets:TRANSCRIBER_SECRET"
  "workspace:workspace-secrets:CLAUDE_CODE_OIDC_SECRET"
  "workspace:workspace-secrets:CLAUDE_CODE_WEBUI_SECRET_KEY"
  "workspace:workspace-secrets:GITHUB_PAT"
  "workspace:workspace-secrets:DOCUSEAL_SECRET_KEY_BASE"
  "workspace:workspace-secrets:DOCUSEAL_API_TOKEN"
  "workspace:workspace-secrets:DOCUSEAL_DB_PASSWORD"
  "workspace:workspace-secrets:GHCR_PAT"
  "workspace:workspace-secrets:IPV64_API_KEY"
  "workspace:workspace-secrets:SMTP_FROM"
  "workspace:workspace-secrets:SMTP_USER"
  "workspace:workspace-secrets:BACKUP_PASSPHRASE"
  "workspace:traefik-basic-auth:users"
  "coturn:coturn-secrets:SIGNALING_SECRET"
  "coturn:coturn-secrets:TURN_SECRET"
  "workspace-office:collabora-secrets:COLLABORA_ADMIN_PASSWORD"
)

# mcp-tokens only exists on the dev cluster (MCP servers are not deployed to
# prod). Include the entries only when auditing dev so prod audits don't
# surface "(secret not found in cluster)" false-positives.
if [[ "$ENV" == "dev" ]]; then
  SOLO_LABELS+=(
    "mcp-tokens: CLUSTER_TOKEN"
    "mcp-tokens: BUSINESS_TOKEN"
  )
  SOLO_MEMBERS+=(
    "default:mcp-tokens:CLUSTER_TOKEN"
    "default:mcp-tokens:BUSINESS_TOKEN"
  )
fi

NUM_SOLOS=${#SOLO_LABELS[@]}

# ── ConfigMap definitions — non-secret environment values ────────────────────
# Each CM_MEMBERS entry: "NAMESPACE:CONFIGMAP:KEY"
# Union of dev + prod domain-config keys; missing keys show as "(not set)".

CM_LABELS=(
  "KC_DOMAIN"
  "NC_DOMAIN"
  "MEET_DOMAIN"
  "SIGNALING_DOMAIN"
  "COLLABORA_DOMAIN"
  "WHITEBOARD_DOMAIN"
  "VAULT_DOMAIN"
  "MAIL_DOMAIN"
  "DOCS_DOMAIN"
  "WEB_DOMAIN"
  "AI_DOMAIN"
  "SIGN_DOMAIN"
  "TRAEFIK_DOMAIN"
  "PROD_DOMAIN"
  "BRAND_NAME"
  "BRAND"
  "WEBSITE_IMAGE"
  "INFRA_NAMESPACE"
  "TLS_SECRET_NAME"
  "NEXTCLOUD_EXTERNAL_URL"
  "DOCS_URL"
  "AUTH_EXTERNAL_URL"
  "VAULT_EXTERNAL_URL"
  "WHITEBOARD_EXTERNAL_URL"
  "SMTP_HOST"
  "SMTP_PORT"
  "SMTP_SECURE"
  "TURN_PUBLIC_IP"
  "TURN_NODE"
  "CONTACT_EMAIL"
  "CONTACT_PHONE"
  "CONTACT_CITY"
  "CONTACT_NAME"
  "LEGAL_STREET"
  "LEGAL_ZIP"
  "LEGAL_JOBTITLE"
  "LEGAL_UST_ID"
  "LEGAL_WEBSITE"
  "KC_USER1_USERNAME"
  "KC_USER1_EMAIL"
  "KC_USER2_USERNAME"
  "KC_USER2_EMAIL"
  "website: STRIPE_PUBLISHABLE_KEY"
  "website: SELLER_NAME"
  "website: SELLER_ADDRESS"
  "website: SELLER_POSTAL_CODE"
  "website: SELLER_CITY"
  "website: SELLER_COUNTRY"
  "website: SELLER_VAT_ID"
)

CM_MEMBERS=(
  "workspace:domain-config:KC_DOMAIN"
  "workspace:domain-config:NC_DOMAIN"
  "workspace:domain-config:MEET_DOMAIN"
  "workspace:domain-config:SIGNALING_DOMAIN"
  "workspace:domain-config:COLLABORA_DOMAIN"
  "workspace:domain-config:WHITEBOARD_DOMAIN"
  "workspace:domain-config:VAULT_DOMAIN"
  "workspace:domain-config:MAIL_DOMAIN"
  "workspace:domain-config:DOCS_DOMAIN"
  "workspace:domain-config:WEB_DOMAIN"
  "workspace:domain-config:AI_DOMAIN"
  "workspace:domain-config:SIGN_DOMAIN"
  "workspace:domain-config:TRAEFIK_DOMAIN"
  "workspace:domain-config:PROD_DOMAIN"
  "website:website-config:BRAND_NAME"
  "website:website-config:BRAND"
  "workspace:domain-config:WEBSITE_IMAGE"
  "workspace:domain-config:INFRA_NAMESPACE"
  "workspace:domain-config:TLS_SECRET_NAME"
  "website:website-config:NEXTCLOUD_EXTERNAL_URL"
  "website:website-config:DOCS_URL"
  "website:website-config:AUTH_EXTERNAL_URL"
  "website:website-config:VAULT_EXTERNAL_URL"
  "website:website-config:WHITEBOARD_EXTERNAL_URL"
  "website:website-config:SMTP_HOST"
  "website:website-config:SMTP_PORT"
  "website:website-config:SMTP_SECURE"
  "workspace:domain-config:TURN_PUBLIC_IP"
  "workspace:domain-config:TURN_NODE"
  "website:website-config:CONTACT_EMAIL"
  "website:website-config:CONTACT_PHONE"
  "website:website-config:CONTACT_CITY"
  "website:website-config:CONTACT_NAME"
  "website:website-config:LEGAL_STREET"
  "website:website-config:LEGAL_ZIP"
  "website:website-config:LEGAL_JOBTITLE"
  "website:website-config:LEGAL_UST_ID"
  "website:website-config:LEGAL_WEBSITE"
  "workspace:domain-config:KC_USER1_USERNAME"
  "workspace:domain-config:KC_USER1_EMAIL"
  "workspace:domain-config:KC_USER2_USERNAME"
  "workspace:domain-config:KC_USER2_EMAIL"
  "website:website-config:STRIPE_PUBLISHABLE_KEY"
  "website:website-seller-config:SELLER_NAME"
  "website:website-seller-config:SELLER_ADDRESS"
  "website:website-seller-config:SELLER_POSTAL_CODE"
  "website:website-seller-config:SELLER_CITY"
  "website:website-seller-config:SELLER_COUNTRY"
  "website:website-seller-config:SELLER_VAT_ID"
)

NUM_CMS=${#CM_LABELS[@]}
TOTAL_ITEMS=$(( NUM_GROUPS + NUM_SOLOS + NUM_CMS ))

# ── Helper: fetch + decode one secret key ────────────────────────────────────
# Outputs empty string if the namespace/secret/key doesn't exist.
get_val() {
  local ns="$1" secret="$2" key="$3"
  "${K[@]}" get secret "$secret" -n "$ns" \
    -o "jsonpath={.data['$key']}" 2>/dev/null \
    | base64 --decode 2>/dev/null \
    || true
}

# ── Helper: fetch one configmap key ──────────────────────────────────────────
get_cm_val() {
  local ns="$1" cm="$2" key="$3"
  "${K[@]}" get configmap "$cm" -n "$ns" \
    -o "jsonpath={.data['$key']}" 2>/dev/null || true
}

# ── Helper: check if a Secret exists ─────────────────────────────────────────
secret_exists() {
  "${K[@]}" get secret "$2" -n "$1" &>/dev/null
}

# ── Helper: check if a namespace exists ──────────────────────────────────────
namespace_exists() {
  "${K[@]}" get namespace "$1" &>/dev/null
}

# ── Helper: display value ────────────────────────────────────────────────────
display_val() {
  local v="$1"
  if [[ -z "$v" ]]; then
    printf '%s(empty/not found)%s' "$YLW" "$RST"
  else
    printf '%s' "$v"
  fi
}

# ── Print one sync group ──────────────────────────────────────────────────────
# Args: $1 = display number, $2 = group index
# Sets global LAST_GROUP_MISMATCH=1 if values differ, 0 otherwise.
print_group() {
  local num="$1" idx="$2"
  local label="${GROUP_LABELS[$idx]}"
  local members_str="${GROUP_MEMBERS[$idx]}"

  IFS='|' read -ra MEMBERS <<< "$members_str"

  # Skip group when a destination namespace is absent (e.g. workspace-office
  # on dev without office-stack, coturn on dev without signaling). The source
  # namespace is always assumed present — the pre-flight verifies `workspace`.
  local skip_reason=""
  for (( j=1; j<${#MEMBERS[@]}; j++ )); do
    IFS=':' read -r ns secret key <<< "${MEMBERS[$j]}"
    if ! namespace_exists "$ns"; then
      skip_reason="namespace '$ns' absent"
      break
    fi
  done

  if [[ -n "$skip_reason" ]]; then
    LAST_GROUP_MISMATCH=0
    printf "${BLD}[%d]${RST} %-46s [%b]\n" "$num" "$label" "${YLW}${BLD}SKIPPED${RST}"
    printf "    %s%s%s\n\n" "$DIM" "$skip_reason" "$RST"
    return
  fi

  # Collect values
  local -a VALS
  for m in "${MEMBERS[@]}"; do
    IFS=':' read -r ns secret key <<< "$m"
    if ! secret_exists "$ns" "$secret"; then
      VALS+=("__MISSING__")
    else
      VALS+=("$(get_val "$ns" "$secret" "$key")")
    fi
  done

  # Determine mismatch
  LAST_GROUP_MISMATCH=0
  local ref="${VALS[0]}"
  for v in "${VALS[@]}"; do
    if [[ "$v" != "$ref" ]]; then
      LAST_GROUP_MISMATCH=1
      break
    fi
  done

  # Group header
  local status_badge
  if [[ $LAST_GROUP_MISMATCH -eq 1 ]]; then
    status_badge="${RED}${BLD}MISMATCH${RST}"
  else
    status_badge="${GRN}${BLD}OK${RST}"
  fi

  printf "${BLD}[%d]${RST} %-46s [%b]\n" "$num" "$label" "$status_badge"

  # Member rows
  local i=0
  for m in "${MEMBERS[@]}"; do
    IFS=':' read -r ns secret key <<< "$m"
    local v="${VALS[$i]}"

    local role_tag=""
    local val_color=""
    local missing=0

    if [[ "$v" == "__MISSING__" ]]; then
      missing=1
      val_color="$YLW"
    elif [[ $LAST_GROUP_MISMATCH -eq 1 ]]; then
      if [[ $i -eq 0 ]]; then
        val_color="$GRN"
      elif [[ "$v" != "$ref" ]]; then
        val_color="$RED"
      fi
    fi

    [[ $i -eq 0 ]] && role_tag=" ${DIM}← source${RST}"

    if [[ $missing -eq 1 ]]; then
      printf "    %s%-20s / %-22s / %s%s\n" \
        "$DIM" "$ns" "$secret" "$key" "$RST$role_tag"
      printf "    %s(secret not found in cluster)%s\n" "$YLW" "$RST"
    else
      printf "    %s%-20s / %-22s / %s%s\n" \
        "$DIM" "$ns" "$secret" "$key" "$RST$role_tag"
      printf "    %s%s%s\n" "$val_color" "$(display_val "$v")" "$RST"
    fi

    ((i++)) || true
  done
  echo
}

# ── Print one solo secret ─────────────────────────────────────────────────────
print_solo() {
  local num="$1" idx="$2"
  local label="${SOLO_LABELS[$idx]}"
  local member="${SOLO_MEMBERS[$idx]}"
  IFS=':' read -r ns secret key <<< "$member"

  local v
  if ! secret_exists "$ns" "$secret"; then
    v="__MISSING__"
  else
    v=$(get_val "$ns" "$secret" "$key")
  fi

  printf "${BLD}[%d]${RST} %-46s\n" "$num" "$label"
  printf "    %s%-20s / %-22s / %s%s\n" "$DIM" "$ns" "$secret" "$key" "$RST"
  if [[ "$v" == "__MISSING__" ]]; then
    printf "    %s(secret not found in cluster)%s\n" "$YLW" "$RST"
  else
    printf "    %s\n" "$(display_val "$v")"
  fi
  echo
}

# ── Set a solo secret value ───────────────────────────────────────────────────
set_solo() {
  local idx="$1"
  local label="${SOLO_LABELS[$idx]}"
  local member="${SOLO_MEMBERS[$idx]}"
  IFS=':' read -r ns secret key <<< "$member"

  local new_val
  read -rp "${BLD}New value for ${CYN}${label}${RST}: " new_val

  if [[ -z "$new_val" ]]; then
    echo "${YLW}Empty input — skipped.${RST}"
    return 0
  fi

  local val_b64
  val_b64=$(printf '%s' "$new_val" | base64 --wrap=0)

  printf "  Patching  %s / %s [%s] ... " "$ns" "$secret" "$key"
  "${K[@]}" patch secret "$secret" -n "$ns" \
    --type=merge -p "{\"data\":{\"$key\":\"$val_b64\"}}" \
    --output=name 2>&1 | sed 's|^|→ |'
  echo "${GRN}done${RST}"
  echo
}

# ── Print one configmap entry ─────────────────────────────────────────────────
print_cm() {
  local num="$1" idx="$2"
  local label="${CM_LABELS[$idx]}"
  local member="${CM_MEMBERS[$idx]}"
  IFS=':' read -r ns cm key <<< "$member"

  local v
  v=$(get_cm_val "$ns" "$cm" "$key")

  printf "${BLD}[%d]${RST} %-46s\n" "$num" "$label"
  printf "    %s%-20s / %-22s / %s%s\n" "$DIM" "$ns" "$cm" "$key" "$RST"
  if [[ -z "$v" ]]; then
    printf "    %s(empty/not set)%s\n" "$YLW" "$RST"
  else
    printf "    %s\n" "$(display_val "$v")"
  fi
  echo
}

# ── Set a configmap value ─────────────────────────────────────────────────────
set_cm() {
  local idx="$1"
  local label="${CM_LABELS[$idx]}"
  local member="${CM_MEMBERS[$idx]}"
  IFS=':' read -r ns cm key <<< "$member"

  local new_val
  read -rp "${BLD}New value for ${CYN}${label}${RST}: " new_val

  printf "  Patching  %s / %s [%s] ... " "$ns" "$cm" "$key"
  "${K[@]}" patch configmap "$cm" -n "$ns" \
    --type=merge -p "{\"data\":{\"$key\":\"$new_val\"}}" \
    --output=name 2>&1 | sed 's|^|→ |'
  echo "${GRN}done${RST}"
  echo
}

# ── Print all items (sync groups + solo secrets + configmap entries) ──────────
# Fills global assoc array MISMATCH_MAP (display_num -> group_idx) for sync groups.
print_all_items() {
  declare -gA MISMATCH_MAP=()
  local n

  # 1. Sync groups
  printf "${CYN}${BLD}── Secret Sync Groups (cross-namespace pairs) ─────────────────────${RST}\n\n"
  for (( i=0; i<NUM_GROUPS; i++ )); do
    n=$(( i + 1 ))
    print_group "$n" "$i"
    if [[ $LAST_GROUP_MISMATCH -eq 1 ]]; then
      MISMATCH_MAP[$n]=$i
    fi
  done

  # 2. Solo secrets
  printf "${CYN}${BLD}── Solo Secrets (single-source, no sync partner) ──────────────────${RST}\n\n"
  for (( i=0; i<NUM_SOLOS; i++ )); do
    n=$(( NUM_GROUPS + i + 1 ))
    print_solo "$n" "$i"
  done

  # 3. ConfigMap values
  printf "${CYN}${BLD}── ConfigMap Values (non-secret, domain-config) ───────────────────${RST}\n\n"
  for (( i=0; i<NUM_CMS; i++ )); do
    n=$(( NUM_GROUPS + NUM_SOLOS + i + 1 ))
    print_cm "$n" "$i"
  done
}

# ── Sync a group (source → all destinations) ──────────────────────────────────
sync_group() {
  local idx="$1"
  local label="${GROUP_LABELS[$idx]}"
  local members_str="${GROUP_MEMBERS[$idx]}"
  local restarts="${GROUP_RESTARTS[$idx]}"

  IFS='|' read -ra MEMBERS <<< "$members_str"

  # Read canonical source value
  IFS=':' read -r src_ns src_secret src_key <<< "${MEMBERS[0]}"
  local src_val
  src_val=$(get_val "$src_ns" "$src_secret" "$src_key")

  if [[ -z "$src_val" ]]; then
    echo "${RED}ERROR: Source value in ${src_ns}/${src_secret}[${src_key}] is empty — cannot sync.${RST}"
    return 1
  fi

  local val_b64
  val_b64=$(printf '%s' "$src_val" | base64 --wrap=0)

  # Patch each destination
  for (( i=1; i<${#MEMBERS[@]}; i++ )); do
    IFS=':' read -r ns secret key <<< "${MEMBERS[$i]}"
    printf "  Patching  %s / %s [%s] ... " "$ns" "$secret" "$key"
    "${K[@]}" patch secret "$secret" -n "$ns" \
      --type=merge -p "{\"data\":{\"$key\":\"$val_b64\"}}" \
      --output=name 2>&1 | sed 's|^|→ |'
    echo "${GRN}done${RST}"
  done

  # Restart affected deployments
  if [[ -n "$restarts" ]]; then
    echo
    echo "  Restarting affected deployments:"
    for r in $restarts; do
      IFS=':' read -r r_ns r_deploy <<< "$r"
      printf "    deploy/%-20s in %-20s ... " "$r_deploy" "$r_ns"
      if "${K[@]}" get deploy "$r_deploy" -n "$r_ns" &>/dev/null; then
        "${K[@]}" rollout restart "deploy/$r_deploy" -n "$r_ns" &>/dev/null
        echo "${GRN}restarted${RST}"
      else
        echo "${YLW}not found — skipped${RST}"
      fi
    done
  fi
}

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! "${K[@]}" get namespace workspace &>/dev/null; then
  echo "${RED}Cannot reach cluster (ENV=$ENV). Is the cluster running and kubeconfig set?${RST}" >&2
  exit 1
fi

# ── Entry point ───────────────────────────────────────────────────────────────
divider="${CYN}${BLD}══════════════════════════════════════════════════════════════════${RST}"

echo
echo "$divider"
printf "${CYN}${BLD}  Secret & Config Audit  —  ENV: %s${RST}\n" "$ENV"
echo "$divider"
echo

print_all_items

# Summary line
if [[ ${#MISMATCH_MAP[@]} -eq 0 ]]; then
  echo "${GRN}${BLD}All sync groups are in sync.${RST}"
else
  echo "${YLW}${BLD}${#MISMATCH_MAP[@]} sync group(s) have mismatches (shown above).${RST}"
fi
echo

# Range hint
solo_start=$(( NUM_GROUPS + 1 ))
solo_end=$(( NUM_GROUPS + NUM_SOLOS ))
cm_start=$(( NUM_GROUPS + NUM_SOLOS + 1 ))
cm_end=$TOTAL_ITEMS

echo "${BLD}Enter item numbers to update (comma-separated), or 'q' to quit.${RST}"
printf "${DIM}  Sync groups (sync source→dest): 1–%d\n" "$NUM_GROUPS"
printf "  Solo secrets (set new value):    %d–%d\n" "$solo_start" "$solo_end"
printf "  ConfigMap values (set new value):%d–%d${RST}\n" "$cm_start" "$cm_end"
echo

while true; do
  read -rp "${BLD}Items to update: ${RST}" choice || { echo; break; }

  # Quit
  if [[ "$choice" =~ ^[qQ]$ ]]; then
    echo "Aborted."
    break
  fi

  # Split input on commas, strip whitespace
  IFS=',' read -ra RAW_CHOICES <<< "$choice"
  local_choices=()
  for c in "${RAW_CHOICES[@]}"; do
    c="${c// /}"
    local_choices+=("$c")
  done

  # Validate all tokens before doing anything
  valid=1
  for c in "${local_choices[@]}"; do
    if ! [[ "$c" =~ ^[0-9]+$ ]] || (( c < 1 || c > TOTAL_ITEMS )); then
      echo "${YLW}Invalid: '${c}' must be a number between 1 and ${TOTAL_ITEMS}.${RST}"
      valid=0
    elif (( c <= NUM_GROUPS )) && [[ -z "${MISMATCH_MAP[$c]+x}" ]]; then
      echo "${YLW}Sync group $c has no mismatch — nothing to sync. (To change a synced secret, edit the source directly.)${RST}"
      valid=0
    fi
  done
  [[ $valid -eq 0 ]] && continue

  # Process each chosen item
  any_failed=0
  for c in "${local_choices[@]}"; do

    if (( c <= NUM_GROUPS )); then
      # ── Sync group ────────────────────────────────────────────────────────
      group_idx="${MISMATCH_MAP[$c]}"
      group_label="${GROUP_LABELS[$group_idx]}"
      echo
      echo "${BLD}Syncing [$c] $group_label ...${RST}"
      echo
      if sync_group "$group_idx"; then
        echo
        echo "${BLD}Updated values for [$c] $group_label:${RST}"
        echo
        print_group "$c" "$group_idx"
      else
        echo
        echo "${RED}Sync of [$c] failed. Check errors above.${RST}"
        echo
        any_failed=1
      fi

    elif (( c <= NUM_GROUPS + NUM_SOLOS )); then
      # ── Solo secret ───────────────────────────────────────────────────────
      solo_idx=$(( c - NUM_GROUPS - 1 ))
      echo
      echo "${BLD}Editing [$c] ${SOLO_LABELS[$solo_idx]} ...${RST}"
      echo
      set_solo "$solo_idx"
      print_solo "$c" "$solo_idx"

    else
      # ── ConfigMap entry ───────────────────────────────────────────────────
      cm_idx=$(( c - NUM_GROUPS - NUM_SOLOS - 1 ))
      echo
      echo "${BLD}Editing [$c] ${CM_LABELS[$cm_idx]} ...${RST}"
      echo
      set_cm "$cm_idx"
      print_cm "$c" "$cm_idx"
    fi

  done

  [[ $any_failed -eq 1 ]] && echo "${YLW}One or more syncs failed — see above.${RST}" && echo

  # Re-check
  echo "$divider"
  echo "${BLD}Re-checking all items ...${RST}"
  echo "$divider"
  echo
  print_all_items

  if [[ ${#MISMATCH_MAP[@]} -eq 0 ]]; then
    echo "${GRN}${BLD}All sync groups are in sync.${RST}"
  else
    echo "${YLW}${BLD}${#MISMATCH_MAP[@]} sync group(s) still have mismatches.${RST}"
  fi
  echo

  echo "${BLD}Enter more item numbers to update, or 'q' to quit.${RST}"
  printf "${DIM}  Sync groups: 1–%d  │  Solo secrets: %d–%d  │  ConfigMap: %d–%d${RST}\n" \
    "$NUM_GROUPS" "$solo_start" "$solo_end" "$cm_start" "$cm_end"
  echo
done
