#!/usr/bin/env bash
# scripts/factory/sandbox-run.sh — run a factory command inside an isolated sandbox.
#   sandbox-run.sh <worktree> <command...>               # one-shot mode
#   sandbox-run.sh --agent <worktree> --slot N -- <cmd>  # agent mode (long-running)
set -euo pipefail
REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
SANDBOX_IMAGE="${FACTORY_SANDBOX_IMAGE:-factory-sandbox:local}"
AGENT_IMAGE="${FACTORY_AGENT_IMAGE:-factory-sandbox-agent:local}"
AGENT_MODE=false
SLOT_ID=""
TICKET_ID="${FACTORY_TICKET_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT_MODE=true; shift ;;
    --slot) SLOT_ID="${2:?--slot requires a value}"; shift 2 ;;
    --ticket) TICKET_ID="$2"; shift 2 ;;
    --) shift; break ;;
    -*) echo "sandbox-run: unknown flag $1" >&2; exit 2 ;;
    *) break ;;
  esac
done

WORKTREE="${1:?usage: sandbox-run.sh <worktree> <command...>}"; shift
CMD="$*"
IMAGE="$SANDBOX_IMAGE"
if $AGENT_MODE; then IMAGE="$AGENT_IMAGE"; fi

# Never sandbox the main checkout (would defeat worktree isolation).
case "${WORKTREE%/}" in
  "${REPO%/}") echo "sandbox-run: refusing to sandbox the main checkout" >&2; exit 3 ;;
esac

# Ensure the worktree directory exists.
mkdir -p "${WORKTREE}"

resolve_mode() {
  case "${FACTORY_SANDBOX:-auto}" in
    docker|k8s|off) echo "${FACTORY_SANDBOX}"; return 0 ;;
  esac
  if docker info >/dev/null 2>&1; then echo docker; return 0; fi
  if kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" version >/dev/null 2>&1; then echo k8s; return 0; fi
  echo off
}

egress_allowlist() {
  local prod_domain="${PROD_DOMAIN:-}"
  [[ -n "$prod_domain" ]] || prod_domain="$(awk -F'"' '/^[[:space:]]*PROD_DOMAIN:/ {print $2; exit}' "${REPO}/k3d/configmap-domains.yaml")"
  printf '%s\n' api.anthropic.com registry.npmjs.org github.com codeload.github.com "${prod_domain}" "staging.${prod_domain}"
}

ensure_network() {
  local net="${1:-factory-sandbox-egress}"
  docker network inspect "$net" >/dev/null 2>&1 || \
    docker network create "$net" >/dev/null 2>&1 || true
}

build_image() {
  local img="$1" dockerfile="$2"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "sandbox-run: building image ${img}..." >&2
    docker build -t "$img" -f "$dockerfile" "${REPO}/scripts/factory" >&2
  fi
}

enforce_egress() {
  local net="$1"
  # default-deny egress, then allow each host in the allowlist
  docker run --rm --cap-add=NET_ADMIN --network "$net" alpine:latest sh -c '
    iptables -I OUTPUT 1 -j DROP
    '"$(egress_allowlist | while read -r host; do
      [[ -n "$host" ]] || continue
      echo "iptables -I OUTPUT 1 -d ${host} -j ACCEPT;"
    done)"'
    iptables -I OUTPUT 1 -d 127.0.0.1 -j ACCEPT
    iptables -I OUTPUT 1 -d 1.1.1.1 -d 8.8.8.8 -d 8.8.4.4 -p udp --dport 53 -j ACCEPT
    iptables -I OUTPUT 1 -d 1.1.1.1 -d 8.8.8.8 -d 8.8.4.4 -p tcp --dport 53 -j ACCEPT
    echo "egress rules applied to ${net}"
  ' 2>/dev/null || echo "sandbox-run: egress enforcement failed (non-fatal)" >&2
}

run_docker() {
  local net="${FACTORY_SANDBOX_NET:-factory-sandbox-egress}"
  if $AGENT_MODE; then
    net="factory-sandbox-slot-${SLOT_ID:-0}"
    ensure_network "$net"
    # enforce egress on first use of this slot network
    local marker="/tmp/.sandbox-net-${net}"
    if [[ ! -f "$marker" ]]; then
      enforce_egress "$net" && touch "$marker" || true
    fi
  else
    ensure_network "$net"
  fi
  build_image "$IMAGE" "${REPO}/scripts/factory/sandbox.Dockerfile"

  local docker_dns=""
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then
    docker_dns="--dns 1.1.1.1"
  fi

  local container_name=""
  local extra_opts=""
  local tmpdir="/tmp"
  if $AGENT_MODE && [[ -n "$SLOT_ID" ]]; then
    local ticket="${TICKET_ID:-$(basename "$WORKTREE")}"
    container_name="factory-agent-slot-${SLOT_ID}-${ticket}"
    tmpdir="/tmp/factory-slot-${SLOT_ID}"
    mkdir -p "$tmpdir"
    extra_opts="--cpus=2 --memory=4g --hostname agent-slot-${SLOT_ID}"
  fi

  docker run --rm \
    ${container_name:+--name ${container_name}} \
    ${docker_dns} \
    ${extra_opts} \
    --network "$net" \
    --cap-add="${AGENT_MODE:+NET_ADMIN}" \
    -v "${WORKTREE}:/work" \
    -v "${tmpdir}:/tmp" \
    -w /work \
    "${IMAGE}" \
    bash -lc "${CMD}"
}

run_k8s() {
  local job_id="sf-job-$$"
  local ns="${FACTORY_NS:-workspace}"
  local job_file
  job_file=$(mktemp)

  sed -e "s|TEMPLATE_JOB_ID|${job_id}|g" \
      -e "s|TEMPLATE_NAMESPACE|${ns}|g" \
      -e "s|TEMPLATE_IMAGE|${IMAGE}|g" \
      -e "s|TEMPLATE_CMD|${CMD//|/\\|}|g" \
      -e "s|TEMPLATE_WORKTREE_PATH|${WORKTREE}|g" \
      "${REPO}/scripts/factory/sandbox-job.yaml" > "${job_file}"

  kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" apply -f "${job_file}" >/dev/null

  kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" wait --for=condition=complete --timeout=300s "job/factory-sandbox-job-${job_id}" -n "${ns}" >/dev/null 2>&1 || true
  kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" logs -n "${ns}" "job/factory-sandbox-job-${job_id}" || true

  kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" delete -f "${job_file}" >/dev/null 2>&1 || true
  rm -f "${job_file}"
}

run_off() {
  local mode_label="one-shot"
  $AGENT_MODE && mode_label="agent (slot=${SLOT_ID:-?})"
  echo "sandbox-run: FACTORY_SANDBOX=off — running UNSANDBOXED on host (${mode_label})" >&2
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.sandbox.off 1 mode="${mode_label}" || true
  exec bash -c "cd '${WORKTREE}' && ${CMD}"
}

MODE="$(resolve_mode)"
case "$MODE" in
  docker) run_docker ;;
  k8s)    run_k8s ;;
  off)    run_off ;;
esac
