#!/usr/bin/env bash
# scripts/factory/sandbox-run.sh — run a factory command inside an isolated sandbox.
set -euo pipefail
REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
WORKTREE="${1:?usage: sandbox-run.sh <worktree> <command...>}"; shift
CMD="$*"
SANDBOX_IMAGE="${FACTORY_SANDBOX_IMAGE:-factory-sandbox:local}"

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

run_docker() {
  docker network inspect "${FACTORY_SANDBOX_NET:-factory-sandbox-egress}" >/dev/null 2>&1 || \
    docker network create "${FACTORY_SANDBOX_NET:-factory-sandbox-egress}" >/dev/null 2>&1 || true

  if ! docker image inspect "${SANDBOX_IMAGE}" >/dev/null 2>&1; then
    echo "sandbox-run: building sandbox image ${SANDBOX_IMAGE}..." >&2
    docker build -t "${SANDBOX_IMAGE}" -f "${REPO}/scripts/factory/sandbox.Dockerfile" "${REPO}/scripts/factory" >&2
  fi

  docker run --rm \
    --network "${FACTORY_SANDBOX_NET:-factory-sandbox-egress}" \
    -v "${WORKTREE}:/work" \
    -w /work \
    "${SANDBOX_IMAGE}" \
    bash -lc "${CMD}"
}

run_k8s() {
  local job_id="sf-job-$$"
  local ns="${FACTORY_NS:-workspace}"
  local job_file
  job_file=$(mktemp)

  sed -e "s|TEMPLATE_JOB_ID|${job_id}|g" \
      -e "s|TEMPLATE_NAMESPACE|${ns}|g" \
      -e "s|TEMPLATE_IMAGE|${SANDBOX_IMAGE}|g" \
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
  echo "sandbox-run: FACTORY_SANDBOX=off — running UNSANDBOXED on host" >&2
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.sandbox.off 1 mode=off || true
  exec bash -c "cd '${WORKTREE}' && ${CMD}"
}

MODE="$(resolve_mode)"
case "$MODE" in
  docker) run_docker ;;
  k8s)    run_k8s ;;
  off)    run_off ;;
esac
