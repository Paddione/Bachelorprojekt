#!/usr/bin/env bash
# install-dev-tools.sh — Provision a k3d-friendly dev toolchain on the
# `gekko-hetzner-2` mentolder control-plane so Gekko can iterate on a
# local k3d cluster directly on the box.
#
# Idempotent: safe to re-run; only installs what is missing.
# Hostname-guarded: no-op on every node except gekko-hetzner-2 unless
# FORCE=1 is exported.
#
# Run as root:
#     sudo bash scripts/install-dev-tools.sh
#
# Tools installed: build-essential, Docker CE, k3d, kubectl, task, Go,
# pnpm (via corepack). Node.js, npm, git, helm are expected to be
# present already (cloud-init / k3s ships them on the gekko nodes).
set -euo pipefail

HOST=$(hostname)
FORCE=${FORCE:-0}
TARGET_HOST="${TARGET_HOST:-gekko-hetzner-2}"
DEV_USER="${DEV_USER:-gekko}"
GO_VERSION="${GO_VERSION:-1.23.4}"
K3D_VERSION="${K3D_VERSION:-v5.7.4}"
NODE_MAJOR="${NODE_MAJOR:-22}"

log() { printf '[install-dev-tools] %s\n' "$*"; }

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

log "host=$HOST dev_user=$DEV_USER go=$GO_VERSION k3d=$K3D_VERSION"

log "step 1/6 — apt baseline (build-essential, ca-certs, gnupg)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential ca-certificates curl gnupg lsb-release

log "step 2/6 — docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  ARCH=$(dpkg --print-architecture)
  CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
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

log "step 3/6 — k3d ${K3D_VERSION}"
if ! command -v k3d >/dev/null; then
  # k3d's installer drops the binary into /usr/local/bin by default and
  # rejects unknown flags such as -b — pass version via TAG only.
  curl -fsSL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \
    | TAG="$K3D_VERSION" USE_SUDO=false bash
else
  log "  k3d present: $(k3d version | head -1)"
fi

log "step 4/6 — kubectl"
if ! command -v kubectl >/dev/null; then
  KUBE_VERSION=$(curl -fsSL https://dl.k8s.io/release/stable.txt)
  curl -fsSL "https://dl.k8s.io/release/${KUBE_VERSION}/bin/linux/amd64/kubectl" \
    -o /usr/local/bin/kubectl
  chmod +x /usr/local/bin/kubectl
else
  log "  kubectl present: $(kubectl version --client=true 2>/dev/null | head -1)"
fi

log "step 5/6 — task (go-task)"
if ! command -v task >/dev/null; then
  sh -c "$(curl -fsSL https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
else
  log "  task present: $(task --version)"
fi

log "step 6/7 — Node.js ${NODE_MAJOR}.x (NodeSource)"
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

log "step 7/7 — Go ${GO_VERSION} + pnpm (corepack)"
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

# Ubuntu's apt nodejs package strips corepack, so fall back to npm i -g.
if command -v corepack >/dev/null; then
  corepack enable
  su - "$DEV_USER" -c 'corepack prepare pnpm@latest --activate' || true
elif command -v npm >/dev/null && ! command -v pnpm >/dev/null; then
  npm install -g pnpm@latest
fi

log "verify"
PATH="/usr/local/go/bin:$PATH"
for t in docker k3d kubectl task node npm git make; do
  printf '  %-10s ' "$t"
  if command -v "$t" >/dev/null; then "$t" --version 2>/dev/null | head -1 || echo "(installed)"; else echo "MISSING"; fi
done
# go uses `go version`, not `--version`
printf '  %-10s ' "go"; command -v go >/dev/null && go version || echo "MISSING"
printf '  %-10s ' "pnpm"; command -v pnpm >/dev/null && pnpm --version || echo "MISSING (or pending re-login)"

log "done — $DEV_USER must log out and back in for the docker group to apply"
