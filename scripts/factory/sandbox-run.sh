#!/usr/bin/env bash
# scripts/factory/sandbox-run.sh — run a factory command inside an isolated sandbox.
#   sandbox-run.sh <worktree> <command...>                # one-shot mode
#   sandbox-run.sh --agent --slot N -- <wt> <cmd>         # agent mode (long-running)
set -euo pipefail
REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
SANDBOX_IMAGE="${FACTORY_SANDBOX_IMAGE:-factory-sandbox:local}"
AGENT_IMAGE="${FACTORY_AGENT_IMAGE:-factory-sandbox-agent:local}"
PROXY_NAME="factory-sandbox-proxy"
PROXY_IMAGE="factory-sandbox-proxy:local"
PROXY_CONF_DIR="/tmp/factory-sandbox-proxy"
PROXY_CONF="${PROXY_CONF_DIR}/squid.conf"
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
  # Modell-Endpunkte der Subagenten: opencode.ai (OpenCode-Go-Gateway) und
  # api.deepseek.com (direkte DeepSeek-API) — ohne sie wuerde ein sandboxed
  # Agent beim Modell-Call still gedroppt.
  printf '%s\n' \
    api.anthropic.com \
    opencode.ai \
    api.deepseek.com \
    registry.npmjs.org \
    github.com \
    codeload.github.com \
    "${prod_domain}" \
    "staging.${prod_domain}"
}

ensure_network() {
  local net="${1:-factory-sandbox-egress}"
  if docker network inspect "$net" >/dev/null 2>&1; then
    # Alt-Netz aus dem fehlerhaften Bestand (angelegt OHNE --internal): neu
    # anlegen — nur so wird default-deny per Konstruktion wirksam.
    local internal
    internal="$(docker network inspect "$net" --format '{{.Internal}}')"
    if [[ "$internal" != "true" ]]; then
      docker network disconnect "$net" "$PROXY_NAME" >/dev/null 2>&1 || true
      docker network rm "$net" >/dev/null 2>&1 || true
      docker network create --internal "$net" >/dev/null 2>&1 || true
    fi
    return 0
  fi
  # internal = keine externe Route; der Egress-Proxy ist der einzige Ausgang.
  docker network create --internal "$net" >/dev/null 2>&1 || true
}

build_image() {
  local img="$1" dockerfile="$2"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "sandbox-run: building image ${img}..." >&2
    docker build -t "$img" -f "$dockerfile" "${REPO}/scripts/factory" >&2
  fi
}

wait_proxy_ready() {
  local name="$1"
  # Squid braucht nach dem Start einen Moment bis der Listener steht — ohne
  # Wait racen Sandbox-Container gegen den Proxy (connection refused). Der
  # cache.log ist je Container-Start geleert (siehe Dockerfile), die
  # "Accepting HTTP"-Zeile ist also der frische Listener-Beleg.
  local tries=0
  until docker exec "$name" grep -q 'Accepting HTTP' /var/log/squid/cache.log 2>/dev/null; do
    tries=$((tries + 1))
    [[ $tries -lt 30 ]] || break
    sleep 0.5
  done
}

ensure_egress_proxy() {
  local net="$1"
  build_image "$PROXY_IMAGE" "${REPO}/scripts/factory/sandbox-proxy.Dockerfile"

  # Squid-Config aus egress_allowlist() generieren — die Funktion bleibt die
  # EINE Quelle der Allowlist (keine zweite Liste inline).
  mkdir -p "$PROXY_CONF_DIR"
  local domains
  domains="$(egress_allowlist | paste -sd ' ' -)"
  cat > "$PROXY_CONF" <<EOF
http_port 3128
acl allowed_domains dstdomain ${domains}
acl CONNECT method CONNECT
acl SSL_ports port 443
http_access allow CONNECT SSL_ports allowed_domains
http_access allow allowed_domains
http_access deny all
EOF

  if docker container inspect "$PROXY_NAME" >/dev/null 2>&1; then
    # Idempotent: fehlende Netz-Connects nachziehen (z.B. nach Netz-Neuanlage);
    # geaenderte Config -> Restart (cmp gegen Snapshot, kein Blind-Restart).
    docker network connect "$net" "$PROXY_NAME" >/dev/null 2>&1 || true
    if [[ ! -f "${PROXY_CONF}.running" ]] || ! cmp -s "$PROXY_CONF" "${PROXY_CONF}.running"; then
      docker restart "$PROXY_NAME" >/dev/null 2>&1 || true
      cp "$PROXY_CONF" "${PROXY_CONF}.running"
      wait_proxy_ready "$PROXY_NAME"
    fi
    return 0
  fi

  # WSL-DNS-Workaround (T002250): --dns 1.1.1.1 bekommt der PROXY (er haengt am
  # Default-Bridge, 1.1.1.1 ist dort erreichbar) — die Sandbox-Container
  # brauchen ihn nicht: im internalen Netz waere 1.1.1.1 unerreichbar und
  # wuerde die Proxy-Hostname-Aufloesung (eingebetteter Docker-DNS) brechen.
  local dns_opts=""
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then
    dns_opts="--dns 1.1.1.1"
  fi

  docker run -d --name "$PROXY_NAME" \
    ${dns_opts} \
    --network "$net" \
    -v "$PROXY_CONF:/etc/squid/squid.conf" \
    "$PROXY_IMAGE" >/dev/null
  # Default-Bridge = der EINZIGE externe Pfad; die Sandbox-Netze sind internal.
  docker network connect bridge "$PROXY_NAME" >/dev/null 2>&1 || true
  cp "$PROXY_CONF" "${PROXY_CONF}.running"
  wait_proxy_ready "$PROXY_NAME"
}

run_docker() {
  local net="${FACTORY_SANDBOX_NET:-factory-sandbox-egress}"
  if $AGENT_MODE; then
    net="factory-sandbox-slot-${SLOT_ID:-0}"
  fi
  # Beide Pfade (one-shot UND agent) sichern Netz + Proxy — der One-shot-Pfad
  # lief vorher ohne jede Egress-Restriktion.
  ensure_network "$net"
  ensure_egress_proxy "$net"
  build_image "$IMAGE" "${REPO}/scripts/factory/sandbox.Dockerfile"

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

  # Keine NET_ADMIN- oder sonstige Netz-Capability (T003871): die
  # Egress-Policy ist strukturell (internal network + Proxy-Allowlist).
  docker run --rm \
    ${container_name:+--name ${container_name}} \
    ${extra_opts} \
    --network "$net" \
    -e "HTTP_PROXY=http://${PROXY_NAME}:3128" \
    -e "HTTPS_PROXY=http://${PROXY_NAME}:3128" \
    -e "NO_PROXY=localhost,127.0.0.1" \
    -e "http_proxy=http://${PROXY_NAME}:3128" \
    -e "https_proxy=http://${PROXY_NAME}:3128" \
    -e "no_proxy=localhost,127.0.0.1" \
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
