#!/usr/bin/env bash
# provision-gh-runner.sh — Bringt einen self-hosted GitHub-Actions-Runner auf den
# Werkzeugstand, den .github/workflows/ci.yml voraussetzt.
#
# Hintergrund [T012414]: Es sind zwei Runner mit identischen Labels
# (self-hosted, linux, x64) registriert — `wsl-gpu-host` und `gekko-hetzner-3`.
# GitHub verteilt Jobs frei zwischen beiden. Sind sie unterschiedlich
# ausgestattet, schlaegt derselbe Job je nach Zuteilung fehl oder nicht — der
# Lauf wird zufallsabhaengig. Dieses Skript stellt die Gleichheit her und ist die
# einzige Stelle, an der der erwartete Werkzeugsatz steht.
#
# Nicht enthalten sind Node, pnpm, Go und Trivy: die liefern die Workflows selbst
# ueber actions/setup-node, pnpm/action-setup, actions/setup-go und
# aquasecurity/setup-trivy in den Tool-Cache des Runners.
#
# Idempotent: installiert nur, was fehlt oder in der falschen Version vorliegt.
#
# Aufruf auf dem Runner-Host:
#     sudo bash scripts/ci/provision-gh-runner.sh
#     bash scripts/ci/provision-gh-runner.sh --check   # nur pruefen, nichts aendern
set -euo pipefail

GH_VERSION="${GH_VERSION:-2.63.2}"
YQ_VERSION="${YQ_VERSION:-v4.53.3}"
KUSTOMIZE_VERSION="${KUSTOMIZE_VERSION:-v5.8.1}"
KUBECONFORM_VERSION="${KUBECONFORM_VERSION:-v0.8.0}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.18.2}"
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.31.0}"
TASK_VERSION="${TASK_VERSION:-v3.52.0}"

BIN_DIR="${BIN_DIR:-/usr/local/bin}"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

log() { printf '[provision-gh-runner] %s\n' "$*"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

need_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log "FEHLER: Installation braucht root (sudo bash $0)"
    exit 1
  fi
}

missing=0

# report <tool> <ist-version> <soll-version>
report() {
  local tool="$1" have="$2" want="$3"
  if [[ -n "$have" && "$have" == "$want" ]]; then
    log "ok         $tool $have"
    return 0
  fi
  if [[ -n "$have" ]]; then
    log "abweichend $tool: ist '$have', soll '$want'"
  else
    log "fehlt      $tool (soll '$want')"
  fi
  missing=$((missing + 1))
  return 1
}

# gh wird nur auf Anwesenheit geprueft: die Workflows nutzen stabile
# Unterkommandos, und ein Pin wuerde einen Host mit neuerer Version
# herunterstufen. GH_VERSION bestimmt nur, was bei Abwesenheit geholt wird.
ver_gh()          { command -v gh          >/dev/null 2>&1 && echo "present"; }
ver_yq()          { command -v yq          >/dev/null 2>&1 && yq --version 2>/dev/null | awk '{print $NF}'; }
ver_kustomize()   { command -v kustomize   >/dev/null 2>&1 && kustomize version 2>/dev/null | head -1; }
ver_kubeconform() { command -v kubeconform >/dev/null 2>&1 && kubeconform -v 2>/dev/null | head -1; }
ver_gitleaks()    { command -v gitleaks    >/dev/null 2>&1 && gitleaks version 2>/dev/null | head -1; }
ver_kubectl()     { command -v kubectl     >/dev/null 2>&1 && echo "present"; }
ver_task()        { command -v task        >/dev/null 2>&1 && echo "present"; }
ver_jq()          { command -v jq          >/dev/null 2>&1 && echo "present"; }
ver_python3()     { command -v python3     >/dev/null 2>&1 && echo "present"; }
ver_git()         { command -v git         >/dev/null 2>&1 && echo "present"; }
ver_helm()        { command -v helm        >/dev/null 2>&1 && echo "present"; }
ver_curl()        { command -v curl        >/dev/null 2>&1 && echo "present"; }

install_gh() {
  curl -sSfL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C "$TMP"
  install -m 0755 "$TMP/gh_${GH_VERSION}_linux_amd64/bin/gh" "$BIN_DIR/gh"
}

install_yq() {
  curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o "$TMP/yq"
  install -m 0755 "$TMP/yq" "$BIN_DIR/yq"
}

install_kustomize() {
  curl -sSfL "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2F${KUSTOMIZE_VERSION}/kustomize_${KUSTOMIZE_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C "$TMP" kustomize
  install -m 0755 "$TMP/kustomize" "$BIN_DIR/kustomize"
}

install_kubeconform() {
  curl -sSfL "https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}/kubeconform-linux-amd64.tar.gz" \
    | tar -xz -C "$TMP" kubeconform
  install -m 0755 "$TMP/kubeconform" "$BIN_DIR/kubeconform"
}

install_gitleaks() {
  curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    | tar -xz -C "$TMP" gitleaks
  install -m 0755 "$TMP/gitleaks" "$BIN_DIR/gitleaks"
}

install_kubectl() {
  curl --fail -sSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -o "$TMP/kubectl"
  install -m 0755 "$TMP/kubectl" "$BIN_DIR/kubectl"
}

install_task() {
  curl -sSfL "https://github.com/go-task/task/releases/download/${TASK_VERSION}/task_linux_amd64.tar.gz" \
    | tar -xz -C "$TMP" task
  install -m 0755 "$TMP/task" "$BIN_DIR/task"
}

# Werkzeuge aus der Distribution: nur melden, nicht installieren. Fehlen sie,
# ist der Host grundsaetzlich falsch aufgesetzt und das gehoert gesehen, nicht
# stillschweigend geheilt.
for t in git curl jq python3 helm; do
  report "$t" "$("ver_$t" || true)" "present" || true
done

declare -a PLAN=()
check_and_plan() {
  local tool="$1" want="$2"
  if ! report "$tool" "$("ver_$tool" || true)" "$want"; then
    PLAN+=("$tool")
  fi
}

check_and_plan gh          "present"
check_and_plan yq          "$YQ_VERSION"
check_and_plan kustomize   "$KUSTOMIZE_VERSION"
check_and_plan kubeconform "$KUBECONFORM_VERSION"
check_and_plan gitleaks    "$GITLEAKS_VERSION"
check_and_plan kubectl     "present"
check_and_plan task        "present"

if [[ "$missing" -eq 0 ]]; then
  log "Runner ist vollstaendig ausgestattet."
  exit 0
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "--check: $missing Abweichung(en) offen"
  exit 1
fi

if [[ ${#PLAN[@]} -eq 0 ]]; then
  log "Nur Distributions-Werkzeuge fehlen — das loest dieses Skript nicht."
  exit 1
fi

need_root
for tool in "${PLAN[@]}"; do
  log "installiere $tool"
  "install_$tool"
done

log "fertig — Nachpruefung:"
exec bash "$0" --check
