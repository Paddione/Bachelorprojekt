#!/bin/bash
# check-updates.sh – Compare running container image digests against their registries.
# Reports which services have newer images available and which ":latest" images
# will refresh when restarted (imagePullPolicy: Always).

set -uo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

NAMESPACES=("workspace" "website" "monitoring")

UPDATES_AVAILABLE=0   # versioned images with confirmed newer digest
RESTARTABLE=0         # :latest images that will pull fresh on restart
CHECKED=0

declare -A remote_cache   # cache registry responses per image ref

# ── Registry API helper ───────────────────────────────────────────────────────
# Prints the manifest-list (or manifest) digest from the registry, or
# "SKIP" (local/private image) or "UNAVAILABLE" (network/auth failure).
get_remote_digest() {
    local full_image="$1"   # e.g.  quay.io/keycloak/keycloak
    local tag="$2"          # e.g.  26.6

    # Skip images we can never reach from the host
    if [[ "$full_image" == registry.localhost/* || "$full_image" == mcp/* ]]; then
        echo "SKIP"; return
    fi
    # Microsoft registry requires auth – skip gracefully
    if [[ "$full_image" == mcr.microsoft.com/* ]]; then
        echo "SKIP"; return
    fi

    local registry name token="" digest=""

    if [[ "$full_image" == ghcr.io/* ]]; then
        registry="ghcr.io"; name="${full_image#ghcr.io/}"
    elif [[ "$full_image" == quay.io/* ]]; then
        registry="quay.io"; name="${full_image#quay.io/}"
    else
        registry="docker.io"; name="$full_image"
        # Official Docker Hub images live under "library/"
        [[ "$name" != */* ]] && name="library/$name"
    fi

    local accept1="Accept: application/vnd.docker.distribution.manifest.list.v2+json"
    local accept2="Accept: application/vnd.docker.distribution.manifest.v2+json"
    local accept3="Accept: application/vnd.oci.image.index.v1+json"

    case "$registry" in
        docker.io)
            token=$(curl -sf --max-time 8 \
                "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull" \
                2>/dev/null | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || true
            if [[ -n "$token" ]]; then
                digest=$(curl -sfI --max-time 8 \
                    -H "$accept1" -H "$accept2" -H "$accept3" \
                    -H "Authorization: Bearer $token" \
                    "https://registry-1.docker.io/v2/${name}/manifests/${tag}" 2>/dev/null \
                    | grep -i "^docker-content-digest:" \
                    | awk '{print $2}' | tr -d '\r') || true
            fi
            ;;
        ghcr.io)
            token=$(curl -sf --max-time 8 \
                "https://ghcr.io/token?service=ghcr.io&scope=repository:${name}:pull" \
                2>/dev/null | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || true
            if [[ -n "$token" ]]; then
                digest=$(curl -sfI --max-time 8 \
                    -H "$accept1" -H "$accept2" -H "$accept3" \
                    -H "Authorization: Bearer $token" \
                    "https://ghcr.io/v2/${name}/manifests/${tag}" 2>/dev/null \
                    | grep -i "^docker-content-digest:" \
                    | awk '{print $2}' | tr -d '\r') || true
            fi
            ;;
        quay.io)
            # quay.io allows anonymous pulls for public repos
            digest=$(curl -sfI --max-time 8 \
                -H "$accept1" -H "$accept2" -H "$accept3" \
                "https://quay.io/v2/${name}/manifests/${tag}" 2>/dev/null \
                | grep -i "^docker-content-digest:" \
                | awk '{print $2}' | tr -d '\r') || true
            ;;
    esac

    echo "${digest:-UNAVAILABLE}"
}

# ── Normalize an image reference to a canonical short form ───────────────────
# Kubernetes fully-qualifies image names in containerStatuses (e.g.
# "docker.io/library/node:22-alpine") while deployment specs use short forms
# ("node:22-alpine"). We strip the docker.io prefixes so both sides match.
normalize_image() {
    local img="$1"
    img="${img#docker.io/library/}"
    img="${img#docker.io/}"
    echo "$img"
}

# ── Build running-digest map for a namespace ──────────────────────────────────
# Populates running_digests[] indexed by both the full qualified name and the
# normalized short form so lookups succeed regardless of which form the
# deployment spec uses.
build_running_digests() {
    local ns="$1"
    while IFS='|' read -r img imgid; do
        [[ -z "$img" || -z "$imgid" ]] && continue
        local_digest=$(echo "$imgid" | grep -o 'sha256:[a-f0-9]\+') || true
        [[ -z "$local_digest" ]] && continue
        running_digests["$img"]="$local_digest"
        # Also store under the normalized (short) form
        local norm; norm=$(normalize_image "$img")
        running_digests["$norm"]="$local_digest"
    done < <(kubectl get pods -n "$ns" \
        -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.image}{"|"}{.imageID}{"\n"}{end}{range .status.initContainerStatuses[*]}{.image}{"|"}{.imageID}{"\n"}{end}{end}' \
        2>/dev/null || true)
}

# ── Main loop ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}Workspace Image Update Check${NC}"
echo -e "${BLUE}$(printf '─%.0s' {1..58})${NC}"
echo ""

for ns in "${NAMESPACES[@]}"; do
    kubectl get namespace "$ns" &>/dev/null || continue

    echo -e "${CYAN}${BOLD}Namespace: ${ns}${NC}"

    # Build image → running digest map for this namespace
    declare -A running_digests=()
    build_running_digests "$ns"

    deployments=$(kubectl get deployments -n "$ns" \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null) || continue
    [[ -z "$deployments" ]] && { echo "  (no deployments found)"; echo ""; continue; }

    for deploy in $deployments; do
        # Collect all images (containers + initContainers), deduplicated
        mapfile -t images < <(kubectl get deployment "$deploy" -n "$ns" \
            -o jsonpath='{range .spec.template.spec.containers[*]}{.image}{"\n"}{end}{range .spec.template.spec.initContainers[*]}{.image}{"\n"}{end}' \
            2>/dev/null | sort -u | grep -v '^$') || continue

        # Aggregate status across all containers in this deployment.
        # worst: 0=ok  1=unknown(no pod)  2=restartable(:latest)  3=update-available
        worst=0
        img_count=0
        uniq_tags=()

        for image in "${images[@]}"; do
            # Skip local, internal, or already-digest-pinned images
            [[ "$image" == registry.localhost/* || "$image" == mcp/* ]] && continue
            [[ "$image" == *@sha256:* ]] && continue

            # Parse name:tag
            if [[ "$image" == *:* ]]; then
                img_name="${image%:*}"; img_tag="${image##*:}"
            else
                img_name="$image"; img_tag="latest"
            fi

            # Fetch remote digest (cached per image ref)
            if [[ -z "${remote_cache[$image]+x}" ]]; then
                remote_cache[$image]=$(get_remote_digest "$img_name" "$img_tag")
            fi
            remote_digest="${remote_cache[$image]}"

            # Private/local images don't count toward this deployment's status
            [[ "$remote_digest" == "SKIP" ]] && continue

            img_count=$((img_count + 1))

            # Accumulate unique tags for display
            tag_already=0
            for t in "${uniq_tags[@]+"${uniq_tags[@]}"}"; do
                [[ "$t" == "$img_tag" ]] && tag_already=1 && break
            done
            [[ $tag_already -eq 0 ]] && uniq_tags+=("$img_tag")

            # Look up running digest – try spec image as-is, then normalized form
            running_digest="${running_digests[$image]:-}"
            if [[ -z "$running_digest" ]]; then
                norm_image=$(normalize_image "$image")
                running_digest="${running_digests[$norm_image]:-}"
            fi

            # Compute per-image status and escalate worst
            if [[ "$remote_digest" == "UNAVAILABLE" ]]; then
                if [[ "$img_tag" == "latest" ]]; then
                    [[ $worst -lt 2 ]] && worst=2
                fi
            elif [[ -z "$running_digest" ]]; then
                [[ $worst -lt 1 ]] && worst=1
            elif [[ "$remote_digest" != "$running_digest" ]]; then
                if [[ "$img_tag" == "latest" ]]; then
                    [[ $worst -lt 2 ]] && worst=2
                else
                    worst=3   # versioned manifest changed – highest severity
                fi
            fi
            # remote == running → ok, no change to worst
        done

        [[ $img_count -eq 0 ]] && continue
        CHECKED=$((CHECKED + 1))

        # Build tag display string: ":latest, :3.19, :1.27-alpine"
        tag_str=""
        for t in "${uniq_tags[@]}"; do
            [[ -z "$tag_str" ]] && tag_str=":$t" || tag_str="$tag_str, :$t"
        done
        if [[ ${#tag_str} -gt 28 ]]; then
            tag_str="${tag_str:0:25}…"
        fi

        printf "  %-30s %-30s " "$deploy" "$tag_str"

        case $worst in
            0)  echo -e "${GREEN}✓  up to date${NC}" ;;
            1)  echo -e "${YELLOW}?  no running pod to compare${NC}" ;;
            2)
                echo -e "${YELLOW}↑  will pull fresh on restart${NC}"
                RESTARTABLE=$((RESTARTABLE + 1))
                ;;
            3)
                echo -e "${RED}${BOLD}↑  UPDATE AVAILABLE${NC}  (manifest changed)"
                UPDATES_AVAILABLE=$((UPDATES_AVAILABLE + 1))
                ;;
        esac
    done

    unset running_digests
    declare -A running_digests=()
    echo ""
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "${BLUE}$(printf '─%.0s' {1..58})${NC}"
echo -e "  Deployments checked: ${BOLD}${CHECKED}${NC}"
echo -e "  Updates available:   ${BOLD}${UPDATES_AVAILABLE}${NC}  (versioned images with changed manifests)"
echo -e "  Restart to update:   ${BOLD}${RESTARTABLE}${NC}  (:latest images that will pull fresh)"
echo ""

total=$((UPDATES_AVAILABLE + RESTARTABLE))
if [[ $total -gt 0 ]]; then
    echo -e "  ${YELLOW}Run ${BOLD}task workspace:update-all${NC}${YELLOW} to restart all services and apply updates."
    if [[ $UPDATES_AVAILABLE -gt 0 ]]; then
        echo -e "  ${RED}Versioned image updates require editing the image tag in the manifest first.${NC}"
    fi
else
    echo -e "  ${GREEN}All checked services appear up to date.${NC}"
fi
echo ""
