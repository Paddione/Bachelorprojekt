#!/usr/bin/env bats
# tests/spec/work-vm-shared-dev/work-vm-guards.bats
# SSOT: openspec/changes/work-vm-shared-dev/specs/work-vm-shared-dev.md
# T900104: Script-Fact-Guards fuer die Work-VM (Proxmox dev, 10.0.0.27) —
# cloud-init-Firewall, provision-Defaults, Toolchain-Install, Shared-Repo-Setup.
#
# Pruefmodus: Quelltext-Fakten (grep) — die Zusicherungen manifestieren sich
# ausschliesslich im Quelltext der Skripte/Manifeste (kein VM-Provisioning,
# Repo-Guard-Muster T002416).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  CLOUD_INIT="${REPO_ROOT}/prod/cloud-init-dev-vm.yaml"
  PROVISION="${REPO_ROOT}/scripts/provision-dev-vm.sh"
  INSTALL_TOOLS="${REPO_ROOT}/scripts/install-dev-tools.sh"
  SETUP_SHARED="${REPO_ROOT}/scripts/setup-shared-dev-repo.sh"
}

@test "T900104: cloud-init ufw exponiert nur 22/tcp + 51821/udp (keine k3d/Postgres-Ports)" {
  [ -f "$CLOUD_INIT" ] || { echo "MISSING: $CLOUD_INIT"; return 1; }
  # Positiv-Anker (T002356-M1): SSH + WireGuard bleiben offen
  grep -q 'ufw allow 22/tcp' "$CLOUD_INIT" \
    || { echo "FAIL: ufw-Regel 22/tcp fehlt"; return 1; }
  grep -q 'ufw allow 51821/udp' "$CLOUD_INIT" \
    || { echo "FAIL: ufw-Regel 51821/udp fehlt"; return 1; }
  # Negativ: k3d-Traefik (18080/18443) + Postgres (15432) duerfen NICHT offen sein
  if grep -qE 'ufw allow (18080|18443|15432)' "$CLOUD_INIT"; then
    echo "FAIL: cloud-init oeffnet noch k3d/Postgres-Ports (18080/18443/15432)"; return 1
  fi
}

@test "T900104: cloud-init enrolled patrick + gekko mit ssh_authorized_keys" {
  [ -f "$CLOUD_INIT" ] || { echo "MISSING: $CLOUD_INIT"; return 1; }
  grep -q 'name: patrick' "$CLOUD_INIT" \
    || { echo "FAIL: User patrick fehlt in cloud-init"; return 1; }
  grep -q 'name: gekko' "$CLOUD_INIT" \
    || { echo "FAIL: User gekko fehlt in cloud-init"; return 1; }
  grep -q 'ssh_authorized_keys' "$CLOUD_INIT" \
    || { echo "FAIL: ssh_authorized_keys fehlt in cloud-init"; return 1; }
}

@test "T900104: provision-dev-vm.sh Defaults VMID 9003 / 10.0.0.27 / 192.168.100.24" {
  [ -f "$PROVISION" ] || { echo "MISSING: $PROVISION"; return 1; }
  grep -q 'VMID="${VMID:-9003}"' "$PROVISION" \
    || { echo "FAIL: Default VMID != 9003"; return 1; }
  grep -q 'VM_IP="${VM_IP:-10.0.0.27}"' "$PROVISION" \
    || { echo "FAIL: Default VM_IP != 10.0.0.27"; return 1; }
  grep -q 'WG_IP="${WG_IP:-192.168.100.24}"' "$PROVISION" \
    || { echo "FAIL: Default WG_IP != 192.168.100.24"; return 1; }
}

@test "T900104: install-dev-tools.sh installiert gh + git-crypt, DEV_USERS-Liste, SKIP_K3D_GO" {
  [ -f "$INSTALL_TOOLS" ] || { echo "MISSING: $INSTALL_TOOLS"; return 1; }
  grep -q 'GH_VERSION' "$INSTALL_TOOLS" \
    || { echo "FAIL: gh-Install (GH_VERSION) fehlt"; return 1; }
  grep -q 'git-crypt' "$INSTALL_TOOLS" \
    || { echo "FAIL: git-crypt-Install fehlt"; return 1; }
  grep -q 'DEV_USERS' "$INSTALL_TOOLS" \
    || { echo "FAIL: DEV_USERS-Liste fehlt"; return 1; }
  grep -q 'SKIP_K3D_GO' "$INSTALL_TOOLS" \
    || { echo "FAIL: SKIP_K3D_GO-Flag fehlt"; return 1; }
}

@test "T900104: setup-shared-dev-repo.sh existiert mit group/ACL/ff-only-Timer/flock" {
  [ -f "$SETUP_SHARED" ] || { echo "MISSING: $SETUP_SHARED"; return 1; }
  grep -q 'groupadd' "$SETUP_SHARED" \
    || { echo "FAIL: groupadd (Gruppe dev) fehlt"; return 1; }
  grep -q 'core.sharedRepository' "$SETUP_SHARED" \
    || { echo "FAIL: core.sharedRepository=group fehlt"; return 1; }
  grep -qE 'setfacl|setgid|g\+s' "$SETUP_SHARED" \
    || { echo "FAIL: setfacl/setgid fehlt"; return 1; }
  grep -q 'ff-only' "$SETUP_SHARED" \
    || { echo "FAIL: ff-only-Timer fehlt"; return 1; }
  grep -q 'flock' "$SETUP_SHARED" \
    || { echo "FAIL: flock-Wrapper fehlt"; return 1; }
}