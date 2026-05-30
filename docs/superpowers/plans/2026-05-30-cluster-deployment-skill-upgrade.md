# Cluster Deployment Skill Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime version discovery + pinning for all Kubernetes components and Hetzner node automation (cloud-init/snapshot) to the cluster-deployment skill.

**Architecture:** A `environments/versions.yaml` manifest is the single source of truth for pinned component versions, populated by `scripts/discover-versions.sh`. Hetzner node setup is automated via `scripts/hetzner/cloud-init.yaml.tmpl` + `scripts/hetzner/render-cloud-init.sh`. The cluster-deployment skill is restructured into 4 phases that source these artifacts.

**Tech Stack:** Bash, BATS (bats-core + bats-support + bats-assert), envsubst, Helm CLI, GitHub releases API (curl + jq), cloud-init YAML

---

## File Map

| Action | Path |
|--------|------|
| Create | `environments/versions.yaml` |
| Create | `scripts/discover-versions.sh` |
| Create | `tests/unit/discover-versions.bats` |
| Create | `scripts/hetzner/cloud-init.yaml.tmpl` |
| Create | `scripts/hetzner/render-cloud-init.sh` |
| Create | `scripts/hetzner/snapshot-guide.md` |
| Create | `tests/unit/render-cloud-init.bats` |
| Modify | `Taskfile.yml` (add `test:unit:discover-versions`, `test:unit:render-cloud-init` tasks) |
| Modify | `.claude/skills/cluster-deployment/SKILL.md` |

---

## Task 1: Write failing BATS tests for discover-versions.sh

**Files:**
- Create: `tests/unit/discover-versions.bats`

- [ ] **Step 1.1: Create the test file**

```bash
cat > tests/unit/discover-versions.bats << 'BATS'
#!/usr/bin/env bats
# discover-versions.bats — unit tests for scripts/discover-versions.sh

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/discover-versions.sh"

setup() {
  TMPDIR=$(mktemp -d)
  VERSIONS_FILE="${TMPDIR}/versions.yaml"
}

teardown() {
  rm -rf "$TMPDIR"
}

# Mock curl to return fixture GitHub API responses without network calls
_mock_curl() {
  curl() {
    local args="$*"
    if [[ "$args" == *"k3s-io/k3s"* ]]; then
      echo '{"tag_name":"v1.99.0+k3s1"}'
    elif [[ "$args" == *"fluxcd/flux2"* ]]; then
      echo '{"tag_name":"v9.0.0"}'
    else
      echo '{}'
    fi
  }
  export -f curl
}

# Mock helm to return fixture search results without real repos
_mock_helm() {
  helm() {
    case "${1:-}" in
      repo) return 0 ;;
      search)
        case "${3:-}" in
          sealed-secrets/sealed-secrets) echo '[{"version":"9.1.0"}]' ;;
          jetstack/cert-manager)         echo '[{"version":"v9.2.0"}]' ;;
          longhorn/longhorn)             echo '[{"version":"9.3.0"}]' ;;
          *)                             echo '[]' ;;
        esac
        ;;
    esac
  }
  export -f helm
}

@test "dry run prints all discovered versions" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT"
  assert_success
  assert_output --partial "k3s: v1.99.0+k3s1"
  assert_output --partial "flux: v9.0.0"
  assert_output --partial "sealed_secrets_chart: 9.1.0"
  assert_output --partial "cert_manager: v9.2.0"
  assert_output --partial "longhorn_chart: 9.3.0"
}

@test "dry run does not write a file" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT"
  assert_success
  [ ! -f "$VERSIONS_FILE" ]
}

@test "--update writes versions.yaml with all required keys" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  assert_success
  assert [ -f "$VERSIONS_FILE" ]
  run grep "^k3s:" "$VERSIONS_FILE";               assert_success
  run grep "^flux:" "$VERSIONS_FILE";              assert_success
  run grep "^sealed_secrets_chart:" "$VERSIONS_FILE"; assert_success
  run grep "^cert_manager:" "$VERSIONS_FILE";      assert_success
  run grep "^longhorn_chart:" "$VERSIONS_FILE";    assert_success
}

@test "--update writes correct discovered values" {
  _mock_curl
  _mock_helm
  bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  run grep "^k3s:" "$VERSIONS_FILE"
  assert_output "k3s: v1.99.0+k3s1"
  run grep "^flux:" "$VERSIONS_FILE"
  assert_output "flux: v9.0.0"
  run grep "^longhorn_chart:" "$VERSIONS_FILE"
  assert_output "longhorn_chart: 9.3.0"
}

@test "versions.yaml has managed-by comment on first line" {
  _mock_curl
  _mock_helm
  bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  run head -1 "$VERSIONS_FILE"
  assert_output --partial "discover-versions.sh"
}

@test "exits non-zero when curl returns empty tag_name" {
  curl() { echo '{"tag_name":""}'; }
  export -f curl
  helm() { case "${1:-}" in repo) return 0;; search) echo '[{"version":"1.0.0"}]';; esac; }
  export -f helm
  run bash "$SCRIPT"
  assert_failure
  assert_output --partial "ERROR"
}
BATS
```

- [ ] **Step 1.2: Run test to confirm it fails (script not yet written)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/discover-versions.bats
```

Expected: all tests fail with `discover-versions.sh: No such file or directory` or similar.

- [ ] **Step 1.3: Add Taskfile task and wire into test:unit**

In `Taskfile.yml`, find the `test:unit:figure-pack` block (line ~258) and add after it:

```yaml
  test:unit:discover-versions:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/discover-versions.bats
```

Then update the `test:unit` task (line ~234) to include the new task:

```yaml
  test:unit:
    desc: Run BATS unit tests (assertion lib, scripts, configs)
    cmds:
      - '[ -f ./tests/unit/lib/bats-core/bin/bats ] || git submodule update --init --recursive'
      - task: test:unit:assert
      - task: test:unit:scripts
      - task: test:unit:agents
      - task: test:unit:figure-pack
      - task: test:unit:discover-versions
      - task: test:unit:render-cloud-init
```

(Leave `test:unit:render-cloud-init` for Task 4 — add both at once here to avoid editing Taskfile twice.)

Also add the render-cloud-init task entry after discover-versions:

```yaml
  test:unit:render-cloud-init:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/render-cloud-init.bats
```

- [ ] **Step 1.4: Commit tests and Taskfile changes**

```bash
git add tests/unit/discover-versions.bats Taskfile.yml
git commit -m "test: add failing BATS tests for discover-versions.sh"
```

---

## Task 2: Implement scripts/discover-versions.sh

**Files:**
- Create: `scripts/discover-versions.sh`

- [ ] **Step 2.1: Create the script**

```bash
cat > scripts/discover-versions.sh << 'SCRIPT'
#!/usr/bin/env bash
# scripts/discover-versions.sh
# Query upstream for latest stable component versions and optionally pin them
# in environments/versions.yaml.
#
# Usage:
#   bash scripts/discover-versions.sh                         # dry run
#   bash scripts/discover-versions.sh --update               # write versions.yaml
#   bash scripts/discover-versions.sh --update --commit      # write + git commit
#   bash scripts/discover-versions.sh --versions-file <path> # override output path
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSIONS_FILE="${SCRIPT_DIR}/../environments/versions.yaml"
UPDATE=false
COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)        UPDATE=true; shift ;;
    --commit)        UPDATE=true; COMMIT=true; shift ;;
    --versions-file) VERSIONS_FILE="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Ensure helm repos are registered (idempotent)
helm repo add longhorn       https://charts.longhorn.io                      2>/dev/null || true
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets   2>/dev/null || true
helm repo add jetstack       https://charts.jetstack.io                      2>/dev/null || true
helm repo update >/dev/null 2>&1 || true

# Discover versions from upstream
K3S=$(curl -sf "https://api.github.com/repos/k3s-io/k3s/releases/latest" | jq -r '.tag_name')
FLUX=$(curl -sf "https://api.github.com/repos/fluxcd/flux2/releases/latest" | jq -r '.tag_name')
SEALED_SECRETS=$(helm search repo sealed-secrets/sealed-secrets -o json | jq -r '.[0].version')
CERT_MANAGER=$(helm search repo jetstack/cert-manager -o json | jq -r '.[0].version')
LONGHORN=$(helm search repo longhorn/longhorn -o json | jq -r '.[0].version')

# Validate — fail fast if any lookup returned empty or "null"
for varname in K3S FLUX SEALED_SECRETS CERT_MANAGER LONGHORN; do
  val="${!varname}"
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "ERROR: Failed to discover version for $varname" >&2
    exit 1
  fi
done

echo "Discovered versions:"
echo "  k3s:                  $K3S"
echo "  flux:                 $FLUX"
echo "  sealed_secrets_chart: $SEALED_SECRETS"
echo "  cert_manager:         $CERT_MANAGER"
echo "  longhorn_chart:       $LONGHORN"

if [[ "$UPDATE" == "false" ]]; then
  echo ""
  echo "Dry run — pass --update to write to $VERSIONS_FILE"
  exit 0
fi

cat > "$VERSIONS_FILE" << EOF
# Managed by scripts/discover-versions.sh — do not edit manually
k3s: $K3S
flux: $FLUX
sealed_secrets_chart: $SEALED_SECRETS
cert_manager: $CERT_MANAGER
longhorn_chart: $LONGHORN
EOF

echo "Updated $VERSIONS_FILE"

if [[ "$COMMIT" == "false" ]]; then
  exit 0
fi

DATE=$(date +%Y-%m-%d)
git add "$VERSIONS_FILE"
git commit -m "chore: bump component versions to $DATE"
echo "Committed."
SCRIPT
chmod +x scripts/discover-versions.sh
```

- [ ] **Step 2.2: Run the BATS tests — confirm they pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/discover-versions.bats
```

Expected output: all 6 tests pass (PASSED in green).

- [ ] **Step 2.3: Commit**

```bash
git add scripts/discover-versions.sh
git commit -m "feat: add discover-versions.sh for runtime component version lookup"
```

---

## Task 3: Generate environments/versions.yaml

**Files:**
- Create: `environments/versions.yaml`

> **Note:** This step requires internet access, `helm` CLI, and `jq`. Run from your workstation, not CI.

- [ ] **Step 3.1: Run discover-versions with --update**

```bash
bash scripts/discover-versions.sh --update
```

Expected: script prints discovered versions and writes `environments/versions.yaml`. Example output:
```
Discovered versions:
  k3s:                  v1.33.1+k3s1
  flux:                 v2.6.0
  sealed_secrets_chart: 2.17.4
  cert_manager:         v1.17.3
  longhorn_chart:       1.9.0
Updated environments/versions.yaml
```

- [ ] **Step 3.2: Verify the file contents**

```bash
cat environments/versions.yaml
```

Expected: YAML file with 5 keys and a managed-by comment on line 1. No empty values.

- [ ] **Step 3.3: Verify it is valid YAML (requires python3 or yq)**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('environments/versions.yaml'))" && echo "Valid YAML"
```

Expected: `Valid YAML`

- [ ] **Step 3.4: Commit**

```bash
git add environments/versions.yaml
git commit -m "chore: pin component versions via discover-versions.sh"
```

---

## Task 4: Write failing BATS tests for render-cloud-init.sh

**Files:**
- Create: `tests/unit/render-cloud-init.bats`

> `test:unit:render-cloud-init` task was already added to Taskfile.yml in Task 1, Step 1.3.

- [ ] **Step 4.1: Create the test file**

```bash
cat > tests/unit/render-cloud-init.bats << 'BATS'
#!/usr/bin/env bats
# render-cloud-init.bats — unit tests for scripts/hetzner/render-cloud-init.sh

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/hetzner/render-cloud-init.sh"

setup() {
  TMPDIR=$(mktemp -d)

  # Minimal versions.yaml fixture
  cat > "${TMPDIR}/versions.yaml" << 'EOF'
k3s: v9.99.0+k3s1
flux: v9.0.0
sealed_secrets_chart: 9.1.0
cert_manager: v9.2.0
longhorn_chart: 9.3.0
EOF

  # Minimal cloud-init template that exercises substitution
  cat > "${TMPDIR}/tpl.yaml" << 'EOF'
#cloud-config
# rendered: NODE_IP=${NODE_IP} K3S_VERSION=${K3S_VERSION} K3S_URL=${K3S_URL}
ssh_authorized_keys:
  - ${SSH_PUBLIC_KEY}
EOF
}

teardown() {
  rm -rf "$TMPDIR"
}

_base_args() {
  echo --versions-file "${TMPDIR}/versions.yaml" \
       --template "${TMPDIR}/tpl.yaml" \
       --node-ip 1.2.3.4 \
       --k3s-url "https://192.168.100.1:6443" \
       --k3s-token "testtoken" \
       --ssh-key "ssh-ed25519 AAAA testkey"
}

@test "substitutes NODE_IP" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "NODE_IP=1.2.3.4"
}

@test "substitutes K3S_VERSION from versions.yaml" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "K3S_VERSION=v9.99.0+k3s1"
}

@test "substitutes K3S_URL" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "K3S_URL=https://192.168.100.1:6443"
}

@test "substitutes SSH_PUBLIC_KEY" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "ssh-ed25519 AAAA testkey"
}

@test "output starts with #cloud-config" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "#cloud-config"
}

@test "fails when --node-ip is missing" {
  run bash "$SCRIPT" \
    --versions-file "${TMPDIR}/versions.yaml" \
    --template "${TMPDIR}/tpl.yaml" \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "node-ip"
}

@test "fails when versions file does not exist" {
  run bash "$SCRIPT" \
    --versions-file "/nonexistent/versions.yaml" \
    --template "${TMPDIR}/tpl.yaml" \
    --node-ip 1.2.3.4 \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "versions file"
}

@test "fails when template does not exist" {
  run bash "$SCRIPT" \
    --versions-file "${TMPDIR}/versions.yaml" \
    --template "/nonexistent/tpl.yaml" \
    --node-ip 1.2.3.4 \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "template"
}
BATS
```

- [ ] **Step 4.2: Run tests to confirm they fail (script not yet written)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/render-cloud-init.bats
```

Expected: all tests fail with script not found or similar.

- [ ] **Step 4.3: Commit**

```bash
git add tests/unit/render-cloud-init.bats
git commit -m "test: add failing BATS tests for render-cloud-init.sh"
```

---

## Task 5: Create cloud-init.yaml.tmpl

**Files:**
- Create: `scripts/hetzner/cloud-init.yaml.tmpl`

> Variables used by this template (all provided by `render-cloud-init.sh`):
> `${SSH_PUBLIC_KEY}`, `${WG_CONF_B64}`, `${K3S_VERSION}`, `${K3S_URL}`, `${K3S_TOKEN}`, `${NODE_IP}`

- [ ] **Step 5.1: Create the hetzner directory and template**

```bash
mkdir -p scripts/hetzner
cat > scripts/hetzner/cloud-init.yaml.tmpl << 'TMPL'
#cloud-config
# Hetzner worker node bootstrap — rendered by scripts/hetzner/render-cloud-init.sh
# Variables: NODE_IP, K3S_VERSION, K3S_URL, K3S_TOKEN, SSH_PUBLIC_KEY, WG_CONF_B64

package_update: true
package_upgrade: false
package_reboot_if_required: false

packages:
  - open-iscsi
  - wireguard
  - ufw
  - curl
  - jq
  - apt-transport-https

ssh_authorized_keys:
  - ${SSH_PUBLIC_KEY}

write_files:
  # WireGuard config (base64-encoded to survive YAML embedding)
  - path: /etc/wireguard/wg0.conf
    encoding: b64
    permissions: "0600"
    content: ${WG_CONF_B64}

  # k3s agent config — sets node IP and WireGuard interface for Flannel
  - path: /etc/rancher/k3s/config.yaml
    content: |
      node-ip: "${NODE_IP}"
      flannel-iface: "wg0"
      node-label:
        - "node-role.kubernetes.io/worker=true"

runcmd:
  # iscsid — required by Longhorn for iSCSI volume attach
  - systemctl enable iscsid
  - systemctl start iscsid

  # Firewall — default deny; allow management + cluster + LiveKit ports
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp comment 'SSH'
  - ufw allow 80/tcp comment 'HTTP'
  - ufw allow 443/tcp comment 'HTTPS'
  - ufw allow 6443/tcp comment 'k3s API'
  - ufw allow 10250/tcp comment 'kubelet'
  - ufw allow 51821/udp comment 'WireGuard mesh'
  - ufw allow 8472/udp comment 'Flannel VXLAN'
  - ufw allow 50000:60000/udp comment 'LiveKit ICE'
  - ufw allow 30000:40000/udp comment 'LiveKit TURN'
  - ufw --force enable

  # WireGuard — bring up mesh interface
  - systemctl enable wg-quick@wg0
  - systemctl start wg-quick@wg0

  # k3s agent install — pinned version, joins cluster via WireGuard
  - >-
    INSTALL_K3S_VERSION="${K3S_VERSION}"
    K3S_URL="${K3S_URL}"
    K3S_TOKEN="${K3S_TOKEN}"
    curl -sfL https://get.k3s.io | sh -

final_message: |
  Worker node ${NODE_IP} bootstrapped. k3s agent registered against ${K3S_URL}.
TMPL
```

- [ ] **Step 5.2: Validate the template is syntactically valid YAML when rendered with dummy values**

```bash
NODE_IP=1.2.3.4 K3S_VERSION=v1.33.1+k3s1 K3S_URL=https://192.168.100.1:6443 \
  K3S_TOKEN=tok SSH_PUBLIC_KEY="ssh-ed25519 AAAA x" WG_CONF_B64=dGVzdA== \
  envsubst < scripts/hetzner/cloud-init.yaml.tmpl | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)" && echo "Valid YAML"
```

Expected: `Valid YAML`

- [ ] **Step 5.3: Commit**

```bash
git add scripts/hetzner/cloud-init.yaml.tmpl
git commit -m "feat: add Hetzner worker node cloud-init template"
```

---

## Task 6: Implement scripts/hetzner/render-cloud-init.sh

**Files:**
- Create: `scripts/hetzner/render-cloud-init.sh`

- [ ] **Step 6.1: Create the render script**

```bash
cat > scripts/hetzner/render-cloud-init.sh << 'SCRIPT'
#!/usr/bin/env bash
# scripts/hetzner/render-cloud-init.sh
# Renders scripts/hetzner/cloud-init.yaml.tmpl with per-node env vars.
# Prints rendered YAML to stdout.
#
# Usage:
#   bash scripts/hetzner/render-cloud-init.sh \
#     [--versions-file <path>] [--template <path>] \
#     --node-ip <ip> --k3s-url <url> --k3s-token <token> --ssh-key "<pubkey>" \
#     [--wg-conf-b64 <base64>]
#
# To provision a node:
#   bash scripts/hetzner/render-cloud-init.sh ... > /tmp/ci.yaml
#   hcloud server create --user-data-from-file /tmp/ci.yaml --name <name> ...
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSIONS_FILE="${PROJECT_DIR}/environments/versions.yaml"
TEMPLATE="${SCRIPT_DIR}/cloud-init.yaml.tmpl"
NODE_IP=""
K3S_URL=""
K3S_TOKEN=""
SSH_PUBLIC_KEY=""
WG_CONF_B64=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --versions-file) VERSIONS_FILE="$2"; shift 2 ;;
    --template)      TEMPLATE="$2";       shift 2 ;;
    --node-ip)       NODE_IP="$2";        shift 2 ;;
    --k3s-url)       K3S_URL="$2";        shift 2 ;;
    --k3s-token)     K3S_TOKEN="$2";      shift 2 ;;
    --ssh-key)       SSH_PUBLIC_KEY="$2"; shift 2 ;;
    --wg-conf-b64)   WG_CONF_B64="$2";   shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Validate required arguments
missing=()
[[ -z "$NODE_IP"        ]] && missing+=("--node-ip")
[[ -z "$K3S_URL"        ]] && missing+=("--k3s-url")
[[ -z "$K3S_TOKEN"      ]] && missing+=("--k3s-token")
[[ -z "$SSH_PUBLIC_KEY" ]] && missing+=("--ssh-key")
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing required arguments: ${missing[*]}" >&2
  exit 1
fi

# Validate files exist
[[ ! -f "$VERSIONS_FILE" ]] && { echo "ERROR: versions file not found: $VERSIONS_FILE" >&2; exit 1; }
[[ ! -f "$TEMPLATE"      ]] && { echo "ERROR: template not found: $TEMPLATE" >&2; exit 1; }

# Source versions.yaml — each "key: value" line becomes an exported shell var
while IFS=': ' read -r key value rest; do
  [[ "${key:-}" =~ ^#  ]] && continue
  [[ -z "${key:-}"     ]] && continue
  export "${key}=${value}"
done < "$VERSIONS_FILE"

# Map lowercase "k3s" key → K3S_VERSION (matches ${K3S_VERSION} in template)
export K3S_VERSION="${k3s:-}"
if [[ -z "$K3S_VERSION" ]]; then
  echo "ERROR: 'k3s' key missing from versions.yaml" >&2
  exit 1
fi

# Export all template variables
export NODE_IP K3S_URL K3S_TOKEN SSH_PUBLIC_KEY WG_CONF_B64

# Render — only substitute known vars to avoid clobbering literal ${} in scripts
envsubst '${NODE_IP} ${K3S_VERSION} ${K3S_URL} ${K3S_TOKEN} ${SSH_PUBLIC_KEY} ${WG_CONF_B64}' \
  < "$TEMPLATE"
SCRIPT
chmod +x scripts/hetzner/render-cloud-init.sh
```

- [ ] **Step 6.2: Run the BATS tests — confirm they pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/render-cloud-init.bats
```

Expected: all 8 tests pass.

- [ ] **Step 6.3: Smoke-test with dummy values to confirm YAML output**

```bash
bash scripts/hetzner/render-cloud-init.sh \
  --node-ip 1.2.3.4 \
  --k3s-url "https://192.168.100.1:6443" \
  --k3s-token "testtoken" \
  --ssh-key "ssh-ed25519 AAAA testkey" \
  --wg-conf-b64 "dGVzdA==" \
  | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin); print('Valid YAML')"
```

Expected: `Valid YAML`

- [ ] **Step 6.4: Commit**

```bash
git add scripts/hetzner/render-cloud-init.sh
git commit -m "feat: add render-cloud-init.sh to generate Hetzner node cloud-init from template"
```

---

## Task 7: Create snapshot-guide.md

**Files:**
- Create: `scripts/hetzner/snapshot-guide.md`

- [ ] **Step 7.1: Create the guide**

```bash
cat > scripts/hetzner/snapshot-guide.md << 'MD'
# Hetzner Worker Node Snapshot Guide

Use snapshots for rapid node replacement or cluster scaling. A snapshot captures
a fully-bootstrapped worker (cloud-init applied, k3s agent running, WireGuard
connected) so new nodes skip the install steps.

## Creating a Snapshot

1. **Provision a base node** using cloud-init:
   ```bash
   bash scripts/hetzner/render-cloud-init.sh \
     --node-ip <PUBLIC_IP> \
     --k3s-url <K3S_URL> \
     --k3s-token <TOKEN> \
     --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
     --wg-conf-b64 <BASE64_WG_CONF> \
     > /tmp/ci.yaml
   hcloud server create \
     --name snapshot-base \
     --type cx22 \
     --image ubuntu-24.04 \
     --ssh-key <KEY_NAME> \
     --user-data-from-file /tmp/ci.yaml
   ```

2. **Wait for node to appear Ready** in the cluster:
   ```bash
   kubectl --context <CTX> get nodes -w
   ```

3. **Cordon and drain** so no workloads land on it during snapshotting:
   ```bash
   kubectl --context <CTX> cordon snapshot-base
   kubectl --context <CTX> drain snapshot-base --ignore-daemonsets --delete-emptydir-data
   ```

4. **Power off** the server:
   ```bash
   hcloud server poweroff snapshot-base
   ```

5. **Create the snapshot** (takes ~1–2 min):
   ```bash
   K3S_VERSION=$(grep "^k3s:" environments/versions.yaml | awk '{print $2}')
   DATE=$(date +%Y%m%d)
   hcloud server create-image snapshot-base \
     --type snapshot \
     --description "k3s-worker-${K3S_VERSION}-${DATE}"
   ```
   Note the snapshot ID printed in the output.

6. **Record the snapshot ID** in `environments/<env>.yaml`:
   ```yaml
   setup_vars:
     HETZNER_WORKER_SNAPSHOT_ID: "12345678"
   ```
   Commit this change.

7. **Delete or repurpose** the base server:
   ```bash
   hcloud server delete snapshot-base
   ```

## Scaling from Snapshot

```bash
SNAPSHOT_ID=$(grep HETZNER_WORKER_SNAPSHOT_ID environments/<env>.yaml | awk '{print $2}')
hcloud server create \
  --name <new-node-name> \
  --type cx22 \
  --image "$SNAPSHOT_ID" \
  --ssh-key <KEY_NAME>
```

k3s agent starts automatically on boot and rejoins the cluster.
No cloud-init needed.

## Snapshot Refresh Policy

Rebuild the snapshot whenever `environments/versions.yaml` bumps `k3s:`.
Stale snapshots join as old k3s versions and may behave unexpectedly.
The cluster-deployment skill Phase 4 prompts for a refresh after any k3s bump.
MD
```

- [ ] **Step 7.2: Commit**

```bash
git add scripts/hetzner/snapshot-guide.md
git commit -m "docs: add Hetzner worker node snapshot creation and scaling guide"
```

---

## Task 8: Update cluster-deployment SKILL.md

**Files:**
- Modify: `.claude/skills/cluster-deployment/SKILL.md`

- [ ] **Step 8.1: Replace SKILL.md with the updated 4-phase version**

Write the following content to `.claude/skills/cluster-deployment/SKILL.md`:

```markdown
---
name: cluster-deployment
description: Unified runbook for environment deployment, cluster creation, deployment assistance, gap analysis, and dev.mentolder.de stack operations.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# cluster-deployment

This runbook covers environment deployment, bootstrapping, diagnostic assistance, and operations for both the production and development Kubernetes clusters.

---

## ⚠️ Mandatory Ordering for Fresh Clusters

When setting up a new environment from scratch, execute in this order:

0. **Discover and pin component versions** (Phase 0) before any install step.
1. **Provision Hetzner nodes** (Phase 1, Step 1.0) — cloud-init for fresh nodes, snapshot for scaling.
2. **Sealed Secrets controller** (`sealed-secrets:install`) must exist *before* any SealedSecret resource is applied.
3. **Fetch cluster sealing certificate** (`env:fetch-cert`) must run *after* a cluster reset to update the sealing keys.
4. **Seal secrets** (`env:seal`) must occur *after* fetching the certificate, using the correct keypair.
5. **Install cert-manager** (`cert:install`) must be done to provision CRDs *before* `workspace:deploy` is called.
6. **DNS API Secret** (`cert:secret -- <key>`) must be stored in both namespaces *before* deploying to avoid ACME challenge failures.
7. **Install Longhorn storage provisioner** — must exist *before* `workspace:deploy`. The `prod-mentolder/` overlay declares `storageClassName: longhorn` for `livekit-recordings-pvc`, `nextcloud-data-pvc`, `vaultwarden-data-pvc`, and `docuseal-data-pvc`. On a fresh cluster these PVCs stay **Pending forever** unless the `longhorn` StorageClass and host-level `iscsid` are present first.
8. **Deploy workspace** (`workspace:deploy`) applies SealedSecrets and all other base manifests.

---

## Phase 0 — Version Discovery & Pinning (New Cluster or Upgrade)

Run at the start of any fresh cluster operation or before any component upgrade.

```bash
# Check what's available upstream (dry run — no changes)
bash scripts/discover-versions.sh

# If versions.yaml is older than 7 days or you want to upgrade:
bash scripts/discover-versions.sh --update --commit

# Source pinned versions for all subsequent commands in this session
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
export K3S_VERSION="${k3s}"
```

After sourcing, the following shell variables are available:
- `$k3s` / `$K3S_VERSION` — k3s version for node install
- `$flux` — Flux version
- `$sealed_secrets_chart` — Helm chart version
- `$cert_manager` — Helm chart version
- `$longhorn_chart` — Helm chart version

> **Skip heuristic:** If `environments/versions.yaml` was modified within the last 7 days and you are not intentionally upgrading, you may skip the `--update` call and go straight to sourcing.

---

## Phase 1 — Environment Initialization & Deployment (New Cluster)

### Step 1.0: Provision Hetzner Worker Nodes

Fork based on context:

**Fresh node (cloud-init):**
```bash
# Generate WireGuard config for this node (base64-encoded)
# See wireguard/wg-mesh-nodes.yaml and wireguard/wg0-hetzner.conf.tpl
WG_CONF_B64=$(NODE_NAME=<name> NODE_PRIVATE_KEY=<key> NODE_WG_IP=<wg-ip> \
  NODE_IP=<public-ip> WS_PUBLIC_KEY=<ws-pubkey> \
  envsubst < wireguard/wg0-hetzner.conf.tpl | base64 -w0)

# Render cloud-init
bash scripts/hetzner/render-cloud-init.sh \
  --node-ip <PUBLIC_IP> \
  --k3s-url <K3S_URL> \
  --k3s-token <TOKEN> \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --wg-conf-b64 "$WG_CONF_B64" \
  > /tmp/ci-<name>.yaml

# Create server
hcloud server create \
  --name <name> --type cx22 \
  --image ubuntu-24.04 \
  --ssh-key <KEY_NAME> \
  --user-data-from-file /tmp/ci-<name>.yaml

# Wait for Ready
kubectl --context <ctx> get nodes -w
```

**Scaling/replacement (snapshot):**
```bash
# Load snapshot ID recorded during last snapshot creation
source <(bash scripts/env-resolve.sh <env> 2>/dev/null) || true
hcloud server create \
  --name <name> --type cx22 \
  --image "${HETZNER_WORKER_SNAPSHOT_ID}" \
  --ssh-key <KEY_NAME>
# k3s agent starts automatically — no cloud-init needed
kubectl --context <ctx> get nodes -w
```

### Step 1.1: Scaffold Environment Config
If the environment YAML does not exist:
```bash
task env:init ENV=<env>
$EDITOR environments/<env>.yaml
task env:validate ENV=<env>
```

### Step 1.2: Install Sealed Secrets & Certs
```bash
# Phase 0 must have been run first — $sealed_secrets_chart must be set
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets && helm repo update
helm install sealed-secrets sealed-secrets/sealed-secrets \
  -n kube-system \
  --version "${sealed_secrets_chart}"
task sealed-secrets:status ENV=<env>
task env:fetch-cert ENV=<env>
```

### Step 1.3: Generate & Seal Credentials
```bash
task env:generate ENV=<env>
# Review environments/.secrets/<env>.yaml and replace MANAGED_EXTERNALLY placeholders.
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml && git commit -m "chore: sealed secrets for <env>"
```

### Step 1.4: Install Cert-Manager (pinned version)
```bash
# Phase 0 must have been run first — $cert_manager must be set
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --version "${cert_manager}" \
  --set crds.enabled=true

task cert:secret -- <ipv64-api-key> ENV=<env>
```

### Step 1.4b: Install Longhorn (pinned version)
```bash
# Phase 0 must have been run first — $longhorn_chart must be set
helm repo add longhorn https://charts.longhorn.io && helm repo update
helm install longhorn longhorn/longhorn \
  -n longhorn-system --create-namespace \
  --version "${longhorn_chart}"
kubectl patch storageclass longhorn \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# iscsid must be enabled on EVERY node (handled by cloud-init — verify):
# kubectl --context <ctx> get nodes -o wide
kubectl --context <ctx> get storageclass longhorn
```

### Step 1.5: Workspace Deploy & Flux Bootstrap
```bash
task workspace:deploy ENV=<env>
kubectl apply -f flux/clusters/<env>/ --context <ctx>
flux reconcile source git flux-system --context <ctx>
flux reconcile kustomization workspace --context <ctx>
```

---

## Phase 2 — Deployment Assistance & Cluster Diagnosis

For existing clusters that may be degraded, follow this phased assessment flow:

### Step 2.1: Prerequisite Checks
```bash
for tool in docker kubectl task k3d git flux kubeseal helm; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done
```

### Step 2.2: Version Drift Check
Compare deployed component versions against pinned versions:
```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
echo "Pinned versions:"
echo "  sealed-secrets: $sealed_secrets_chart"
echo "  cert-manager:   $cert_manager"
echo "  longhorn:       $longhorn_chart"
echo ""
echo "Deployed versions:"
helm list -A -o json | jq -r \
  '.[] | select(.name | test("sealed-secrets|cert-manager|longhorn")) | "  \(.name): \(.chart)"'
```
Flag any component that is behind the pinned version and schedule an upgrade.

### Step 2.3: Config & Secret Validation
```bash
task env:validate ENV=<env>
# Verify presence of environments/sealed-secrets/<env>.yaml and environments/certs/<env>.pem
```

### Step 2.4: Namespace & Pod Status
```bash
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods
flux get kustomizations --context <ctx>
flux describe kustomization workspace --context <ctx>
```

### Step 2.5: Execute Post-Deploy Setup Sequences
```bash
task workspace:office:deploy ENV=<env>
task workspace:post-setup ENV=<env>
task workspace:talk-setup ENV=<env>
task workspace:recording-setup ENV=<env>
task workspace:admin-users-setup ENV=<env>
task workspace:vaultwarden:seed ENV=<env>
```

---

## Phase 3 — dev.mentolder.de Stack Operations

The development stack runs inside a k3d cluster hosted on the LAN node `k3s-1`.

### Step 3.1: Cluster Lifecycle
```bash
# Create cluster (MUST run from k3s-1 machine via task wrapper)
task dev:cluster:create

# Deploy dev resources (website + workspace manifests)
task dev:deploy
```

Note: the k3d image tag should match the pinned k3s version. If `dev:cluster:create`
supports a `K3S_VERSION` env var, source `environments/versions.yaml` first:
```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
K3S_VERSION="${k3s}" task dev:cluster:create
```

### Step 3.2: Development Tasks
```bash
# Expose dev sish tunnels
task dev:firewall:open

# Force DB refresh from prod snapshot
task dev:db:refresh

# Materialise secrets into dev cluster (no SealedSecrets controller in k3d)
task dev:_materialise-secrets
```

---

## Phase 4 — Snapshot Maintenance

After any `k3s` version bump in `environments/versions.yaml`, rebuild the Hetzner worker snapshot so scaling nodes stay in sync with fresh nodes.

```bash
# 1. Confirm the bump
grep "^k3s:" environments/versions.yaml

# 2. Follow scripts/hetzner/snapshot-guide.md to:
#    - provision a fresh base node with cloud-init
#    - wait for Ready, cordon/drain, power off
#    - hcloud server create-image → note new snapshot ID
#    - update environments/<env>.yaml HETZNER_WORKER_SNAPSHOT_ID
#    - commit

# 3. Verify the ID is recorded
grep HETZNER_WORKER_SNAPSHOT_ID environments/<env>.yaml
```

---

## Troubleshooting & Common Blockers

| Component | Symptom | Fix |
|---|---|---|
| **Flux** | Old revision reconciled | Reconcile GitRepository source first: `flux reconcile source git flux-system --context <ctx>` |
| **Sealed Secrets** | Adoption refused by controller | Delete the plain secret first: `kubectl delete secret knowledge-secrets -n <ns>` |
| **Dev Access** | 403 authorization loop | Add user to Keycloak `/dev-access` group in the admin panel |
| **Dev DB** | Data disappearing | Dev DB is wiped and overwritten nightly — do not rely on it for persistent data |
| **Longhorn PVC** | PVC stuck Pending | Verify `kubectl get storageclass longhorn` exists; check `iscsid` is running on all nodes |
| **Version drift** | Helm chart mismatch | Run Phase 0 version discovery + upgrade the drifted component via `helm upgrade` with pinned version |
| **Snapshot stale** | New node joins with old k3s | Rebuild snapshot per Phase 4 after any k3s bump in versions.yaml |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
```

- [ ] **Step 8.2: Verify the file was written correctly — check Phase 0 exists**

```bash
grep -n "Phase 0\|Phase 1\|Phase 2\|Phase 3\|Phase 4" .claude/skills/cluster-deployment/SKILL.md
```

Expected: lines for all 5 phase headers.

- [ ] **Step 8.3: Run existing BATS suite to confirm nothing is broken**

```bash
task test:unit
```

Expected: all tests pass (the syntax check in scripts.bats now also validates the two new scripts).

- [ ] **Step 8.4: Commit**

```bash
git add .claude/skills/cluster-deployment/SKILL.md
git commit -m "feat: restructure cluster-deployment skill with version pinning and Hetzner node automation"
```

---

## Final Verification

- [ ] **Run full test:unit suite**

```bash
task test:unit
```

Expected: all tasks pass including `test:unit:discover-versions` and `test:unit:render-cloud-init`.

- [ ] **Dry-run the discovery script**

```bash
bash scripts/discover-versions.sh
```

Expected: prints 5 version lines, ends with `Dry run — pass --update to write`.

- [ ] **Smoke-test render-cloud-init**

```bash
bash scripts/hetzner/render-cloud-init.sh \
  --node-ip 10.0.0.1 \
  --k3s-url https://192.168.100.1:6443 \
  --k3s-token tok \
  --ssh-key "ssh-ed25519 AAAA test" \
  --wg-conf-b64 dGVzdA== \
  | head -5
```

Expected: output starts with `#cloud-config`.

- [ ] **Verify versions.yaml is committed and valid**

```bash
cat environments/versions.yaml
python3 -c "import yaml; yaml.safe_load(open('environments/versions.yaml'))" && echo "Valid"
```
