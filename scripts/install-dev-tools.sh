#!/usr/bin/env bash
# install-dev-tools.sh — Provision a dev toolchain for the invoking user.
#
# Two target profiles:
#   * gekko-hetzner-2 (default TARGET_HOST): k3d-friendly toolchain (k3d + Go
#     included); prod/cloud-init.yaml ruft es als root mit DEV_USER=gekko.
#   * WSL-Dev-Maschine (FORCE=1 SKIP_K3D_GO=1, aufgerufen von
#     scripts/devmesh/onboard-machine.sh): Docker + kubectl + task + node/pnpm +
#     gh + git-crypt, ohne k3d/Go (T900119).
#
# Idempotent: safe to re-run; only installs what is missing.
# Hostname-guarded: no-op on every node except TARGET_HOST unless FORCE=1.
#
# Run as root via sudo — docker group and pnpm go to SUDO_USER:
#     sudo bash scripts/install-dev-tools.sh
#     bash scripts/install-dev-tools.sh --print-dev-user   # nur Ziel-Benutzer ausgeben
#
# Tools installed: build-essential, Docker CE, k3d (nur SKIP_K3D_GO=0),
# kubectl, task, Go (nur SKIP_K3D_GO=0), gh (gepinntes Release-Binary),
# git-crypt (apt), pnpm (via corepack fuer DEV_USER), Node.js 22 (NodeSource,
# falls aelter oder fehlend). openspec-Tooling laeuft ueber den Repo-Wrapper
# scripts/openspec.sh — es wird KEIN separates openspec-Binary installiert.
set -euo pipefail

HOST=$(hostname)
FORCE=${FORCE:-0}
TARGET_HOST="${TARGET_HOST:-gekko-hetzner-2}"
# Ziel fuer docker-Gruppe und pnpm: der aufrufende Benutzer (unter sudo SUDO_USER,
# sonst der ausfuehrende Benutzer). DEV_USER ueberschreibt; prod/cloud-init.yaml
# laeuft als root ohne SUDO_USER und setzt DEV_USER=gekko.
DEV_USER="${DEV_USER:-${SUDO_USER:-$(id -un)}}"
SKIP_K3D_GO="${SKIP_K3D_GO:-0}"          # 1 = k3d/Go ueberspringen (WSL-Dev-Maschine)
GO_VERSION="${GO_VERSION:-1.23.4}"
K3D_VERSION="${K3D_VERSION:-v5.7.4}"
GH_VERSION="${GH_VERSION:-2.63.2}"       # pinned gh release (apt hat gh nicht in bookworm main)
NODE_MAJOR="${NODE_MAJOR:-22}"

log() { printf '[install-dev-tools] %s\n' "$*"; }

if [[ -n "${DEV_USERS:-}" ]]; then
  log "DEV_USERS wird nicht mehr unterstuetzt (T900119): ein Clone pro Maschine, Ziel ist der aufrufende Benutzer"
  exit 2
fi

if [[ "${1:-}" == "--print-dev-user" ]]; then
  printf '%s\n' "$DEV_USER"
  exit 0
fi

if [[ "$HOST" != "$TARGET_HOST" && "$FORCE" != "1" ]]; then
  log "host is $HOST (expected $TARGET_HOST) — skipping. Pass FORCE=1 to override."
  exit 0
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  log "must run as root (use sudo)"
  exit 1
fi

if ! id "$DEV_USER" >/dev/null 2>&1; then
  log "user '$DEV_USER' does not exist — aborting"
  exit 1
fi

log "host=$HOST dev_user=$DEV_USER go=$GO_VERSION k3d=$K3D_VERSION skip_k3d_go=$SKIP_K3D_GO"

log "step 1/8 — apt baseline (build-essential, ca-certs, gnupg, git-crypt)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential ca-certificates curl gnupg lsb-release git-crypt

log "step 2/8 — docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  # Use the matching Docker repo for the actual distro (debian vs ubuntu).
  # The gekko nodes and most WSL distros are Ubuntu; Debian distros must resolve too.
  DISTRO_ID=$(. /etc/os-release && echo "$ID")
  case "$DISTRO_ID" in
    debian) DOCKER_REPO="debian" ;;
    *)      DOCKER_REPO="ubuntu" ;;
  esac
  curl -fsSL "https://download.docker.com/linux/${DOCKER_REPO}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  ARCH=$(dpkg --print-architecture)
  CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-}")
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_REPO} ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "  docker present: $(docker --version)"
fi
if ! id -nG "$DEV_USER" | grep -qw docker; then
  usermod -aG docker "$DEV_USER"
  log "  added $DEV_USER to docker group (re-login required to take effect)"
fi

log "step 3/8 — k3d ${K3D_VERSION}"
if [[ "$SKIP_K3D_GO" == "1" ]]; then
  log "  SKIP_K3D_GO=1 — k3d uebersprungen (WSL-Dev-Maschine)"
elif ! command -v k3d >/dev/null; then
  # k3d's installer drops the binary into /usr/local/bin by default and
  # rejects unknown flags such as -b — pass version via TAG only.
  curl -fsSL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \
    | TAG="$K3D_VERSION" USE_SUDO=false bash
else
  log "  k3d present: $(k3d version | head -1)"
fi

log "step 4/8 — kubectl"
if ! command -v kubectl >/dev/null; then
  KUBE_VERSION=$(curl -fsSL https://dl.k8s.io/release/stable.txt)
  curl -fsSL "https://dl.k8s.io/release/${KUBE_VERSION}/bin/linux/amd64/kubectl" \
    -o /usr/local/bin/kubectl
  chmod +x /usr/local/bin/kubectl
else
  log "  kubectl present: $(kubectl version --client=true 2>/dev/null | head -1)"
fi

log "step 5/8 — task (go-task)"
if ! command -v task >/dev/null; then
  sh -c "$(curl -fsSL https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
else
  log "  task present: $(task --version)"
fi

log "step 6/8 — gh ${GH_VERSION} (pinned release binary)"
if ! command -v gh >/dev/null; then
  # gh ist NICHT in Debian bookworm main — gepinntes Release-Binary wie im
  # factory-runner-Image (docker/factory-runner/Dockerfile), kein fremdes apt-Repo.
  curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /tmp
  mv "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh
  rm -rf "/tmp/gh_${GH_VERSION}_linux_amd64"
else
  log "  gh present: $(gh --version | head -1)"
fi

log "step 7/8 — Node.js ${NODE_MAJOR}.x (NodeSource)"
NEED_NODE_INSTALL=1
if command -v node >/dev/null; then
  CURRENT_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [[ "$CURRENT_MAJOR" -ge "$NODE_MAJOR" ]]; then
    NEED_NODE_INSTALL=0
    log "  node present: $(node --version)"
  else
    log "  node $(node --version 2>/dev/null) < ${NODE_MAJOR}.x — upgrading"
  fi
fi
if [[ "$NEED_NODE_INSTALL" == "1" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi

log "step 8/8 — Go ${GO_VERSION} + pnpm (corepack)"
if [[ "$SKIP_K3D_GO" == "1" ]]; then
  log "  SKIP_K3D_GO=1 — Go uebersprungen (WSL-Dev-Maschine)"
else
  INSTALLED_GO=""
  if [[ -x /usr/local/go/bin/go ]]; then
    INSTALLED_GO=$(/usr/local/go/bin/go version | awk '{print $3}')
  fi
  if [[ "$INSTALLED_GO" != "go${GO_VERSION}" ]]; then
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm -f /tmp/go.tar.gz
    cat > /etc/profile.d/go.sh <<'PROFILE'
export PATH=$PATH:/usr/local/go/bin
PROFILE
    chmod +x /etc/profile.d/go.sh
  else
    log "  go present: $INSTALLED_GO"
  fi
fi

# Ubuntu's apt nodejs package strips corepack, so fall back to npm i -g.
if command -v corepack >/dev/null; then
  corepack enable
  su - "$DEV_USER" -c 'corepack prepare pnpm@latest --activate' || true
elif command -v npm >/dev/null && ! command -v pnpm >/dev/null; then
  npm install -g pnpm@latest
fi

log "verify"
PATH="/usr/local/go/bin:$PATH"
for t in docker kubectl task node npm git make gh; do
  printf '  %-10s ' "$t"
  if command -v "$t" >/dev/null; then "$t" --version 2>/dev/null | head -1 || echo "(installed)"; else echo "MISSING"; fi
done
if [[ "$SKIP_K3D_GO" != "1" ]]; then
  # go uses `go version`, not `--version`
  printf '  %-10s ' "k3d"; command -v k3d >/dev/null && k3d version | head -1 || echo "MISSING"
  printf '  %-10s ' "go"; command -v go >/dev/null && go version || echo "MISSING"
fi
printf '  %-10s ' "pnpm"; command -v pnpm >/dev/null && pnpm --version || echo "MISSING (or pending re-login)"

log "done — user $DEV_USER must log out and back in for the docker group to apply"
