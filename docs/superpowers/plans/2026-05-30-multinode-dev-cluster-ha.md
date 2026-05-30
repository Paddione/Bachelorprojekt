---
title: Multi-node HA Dev Cluster Implementation Plan
ticket_id: null
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Multi-node HA Dev Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `dev.mentolder.de` stack off single-VM k3d onto a real 3-node k3s HA cluster (embedded etcd + kube-vip + Longhorn) spanning the Proxmox hosts `pve`/`pve2`/`pve3`, and consolidate the brainstorm sish broker onto it.

**Architecture:** Three VMs (`devc-1/2/3`), one per Proxmox host, all k3s servers with embedded etcd (quorum 2/3). A kube-vip floating VIP (`10.0.0.20`) serves both the API and ingress. Longhorn (3 replicas) on dedicated SSD data disks gives PVC data mobility. Resilience lives at the k8s layer; Proxmox storage stays local (no shared storage, no VM HA). The public/TLS/OIDC path is unchanged — only `oauth2-proxy-dev`'s upstream is repointed from the old k3d port to the VIP.

**Tech Stack:** Proxmox VE (`qm`, `pvesm`, LVM-thin), cloud-init, k3s (v1.31.x), kube-vip + kube-vip-cloud-provider, Longhorn, Traefik (k3s built-in), Kustomize, go-task.

**Spec:** `docs/superpowers/specs/2026-05-30-multinode-dev-cluster-ha-design.md`

**Branch:** `feature/multinode-dev-cluster-ha`

---

## Fixed identifiers (used throughout)

| Thing | Value |
|-------|-------|
| API + ingress VIP | `10.0.0.20` |
| LAN / gateway | `10.0.0.0/24` / `10.0.0.1` (CONFIRM gw in Step 0.1) |
| k3s version | `v1.31.5+k3s1` |
| Template VMID | `9000` (`debian12-cloud`) |
| `devc-1` | VMID `9011`, host `pve`,  IP `10.0.0.21`, 8 GB / 4 vCPU, data 900 GB |
| `devc-2` | VMID `9012`, host `pve2`, IP `10.0.0.22`, 10 GB / 4 vCPU, data 470 GB |
| `devc-3` | VMID `9013`, host `pve3`, IP `10.0.0.23`, 10 GB / 4 vCPU, data 230 GB |
| Proxmox SSD storage ID | `local-data` (lvmthin, vg `vg-data`/thinpool `data-thin`) |
| New kubeconfig context | `devc` |
| Old k3d cluster | `k3d-mentolder-dev` (VM `k3s-1`, VMID 9001 on `pve`) |
| Proxmox SSH | `ssh -i /tmp/pve_key root@10.0.0.7` then `ssh <node>` (key only on `pve` — see Step 0.2) |

> **Build order:** `devc-2` + `devc-3` are built first (Phases 2–5). `devc-1` is added last (Phase 7), after k3d is decommissioned and `k3s-1` shrunk, because `pve` cannot host both the 12 GB `k3s-1` and an 8 GB `devc-1` at once.

---

## Phase 0 — Preflight & SSH plumbing

### Task 0.1: Confirm LAN gateway, VIP freedom, node SSH

**Files:** none (verification only)

- [ ] **Step 1: Confirm the VIP is unused**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 "ping -c2 -W1 10.0.0.20; arping -c2 10.0.0.20 2>/dev/null || true"
```
Expected: 100% packet loss / no ARP reply (VIP is free). If anything answers, STOP and pick another VIP.

- [ ] **Step 2: Confirm the LAN gateway**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 "ip route | grep default"
```
Expected: `default via 10.0.0.1 ...` (record the gateway; update the table above if different).

### Task 0.2: Distribute the root key to pve2/pve3 for cross-node provisioning

The provided key authenticates only on `pve`. Provisioning needs root SSH from the operator to all three nodes.

**Files:** none

- [ ] **Step 1: Copy the public key to pve2 and pve3**

Run (from `pve`, which can already reach the others via the cluster):
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
PUB=$(ssh-keygen -y -f /root/.ssh/id_rsa 2>/dev/null || cat /root/.ssh/id_rsa.pub)
for n in pve2 pve3; do
  ssh-copy-id -o StrictHostKeyChecking=accept-new -i /root/.ssh/id_rsa.pub root@$n 2>&1 || \
  echo "$PUB" | ssh root@$n "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
done'
```
Expected: no error; keys appended.

- [ ] **Step 2: Verify root SSH pve→pve2 and pve→pve3**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'for n in pve2 pve3; do ssh -o BatchMode=yes $n hostname; done'
```
Expected: prints `pve2` and `pve3`.

---

## Phase 1 — Proxmox storage prep (the spare SSDs)

> Run on **all three** nodes. `sda` is the spare SSD on each (954/500/250 GB). This is destructive to `sda` only — confirm no data you need lives there.

### Task 1.1: Wipe and create the LVM-thin data pool on each node

**Files:** none (Proxmox host state)

- [ ] **Step 1: Verify `sda` is the spare SSD (not the OS disk) on each node**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'for n in pve pve2 pve3; do echo "== $n =="; ssh $n "lsblk -dno NAME,SIZE,MODEL /dev/sda; lsblk -no MOUNTPOINT /dev/sda | grep -q . && echo MOUNTED-ABORT || echo unmounted"; done'
```
Expected: each prints the spare-SSD model and `unmounted`. If any prints `MOUNTED-ABORT`, STOP.

- [ ] **Step 2: Wipe `sda` and create the thin pool on each node**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'for n in pve pve2 pve3; do echo "== $n =="; ssh $n "
  wipefs -a /dev/sda &&
  sgdisk --zap-all /dev/sda &&
  pvcreate -ff -y /dev/sda &&
  vgcreate vg-data /dev/sda &&
  lvcreate -l 100%FREE -T vg-data/data-thin"; done'
```
Expected: `Logical volume "data-thin" created.` on each node.

- [ ] **Step 3: Register the Proxmox storage `local-data` (cluster-wide config, one command)**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 "pvesm add lvmthin local-data --vgname vg-data --thinpool data-thin --content rootdir,images --nodes pve,pve2,pve3"
```
Expected: no output (success).

- [ ] **Step 4: Verify `local-data` is active on all three nodes**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'for n in pve pve2 pve3; do echo "== $n =="; ssh $n "pvesm status -storage local-data"; done'
```
Expected: each shows `local-data  lvmthin  active` with the node's SSD capacity.

---

## Phase 2 — Cloud-init VM template

### Task 2.1: Build the Debian 12 cloud-init template on `pve`

**Files:** none (Proxmox template VMID 9000)

- [ ] **Step 1: Download the Debian 12 generic cloud image onto `pve`**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
cd /var/lib/vz/template/iso &&
test -f debian-12-genericcloud-amd64.qcow2 ||
curl -fLO https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2'
```
Expected: file present (download completes or already exists).

- [ ] **Step 2: Install `qemu-guest-agent` into the image offline (so VMs report IPs)**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
apt-get install -y libguestfs-tools >/dev/null 2>&1 || true
virt-customize -a /var/lib/vz/template/iso/debian-12-genericcloud-amd64.qcow2 \
  --install qemu-guest-agent,open-iscsi,nfs-common \
  --run-command "systemctl enable qemu-guest-agent open-iscsi"'
```
Expected: `virt-customize` finishes with `Finishing off`.

> `open-iscsi` is **required** by Longhorn; `qemu-guest-agent` lets Proxmox read VM IPs.

- [ ] **Step 3: Create VM 9000, import the disk, attach cloud-init**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm create 9000 --name debian12-cloud --memory 2048 --cores 2 \
  --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-single --agent enabled=1 &&
qm importdisk 9000 /var/lib/vz/template/iso/debian-12-genericcloud-amd64.qcow2 local-lvm &&
qm set 9000 --scsi0 local-lvm:vm-9000-disk-0 &&
qm set 9000 --ide2 local-lvm:cloudinit &&
qm set 9000 --boot c --bootdisk scsi0 --serial0 socket --vga serial0'
```
Expected: each `qm` command returns 0; `importdisk` prints `Successfully imported disk`.

- [ ] **Step 4: Seed cloud-init user + SSH key, then convert to template**

Run (uses the operator's existing key so all devc VMs are reachable):
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm set 9000 --ciuser devops --cipassword "$(openssl rand -base64 12)" \
  --sshkeys /root/.ssh/authorized_keys --ciupgrade 1 &&
qm template 9000'
```
Expected: `qm list` shows 9000 as a template.

- [ ] **Step 5: Verify the template exists**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 "qm list | awk '\$1==9000'"
```
Expected: a row for 9000 with status `stopped` (templates show stopped).

---

## Phase 3 — Provision devc-2 and devc-3

### Task 3.1: Clone, size, and attach data disks for devc-2 (pve2) and devc-3 (pve3)

**Files:** none (VMs 9012, 9013)

- [ ] **Step 1: Clone both VMs to their target hosts**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm clone 9000 9012 --name devc-2 --full --target pve2 &&
qm clone 9000 9013 --name devc-3 --full --target pve3'
```
Expected: `create full clone of drive ...` then completes for both. (Clone to a remote target requires the template be on shared or migratable storage; if `qm clone --target` errors because 9000 is on node-local `local-lvm`, instead clone locally then `qm migrate 9012 pve2 --with-local-disks` — fallback in Step 1b.)

- [ ] **Step 1b (fallback only): if `--target` failed, clone local + migrate**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm clone 9000 9012 --name devc-2 --full && qm migrate 9012 pve2 --with-local-disks &&
qm clone 9000 9013 --name devc-3 --full && qm migrate 9013 pve3 --with-local-disks'
```
Expected: migrations finish `successfully`.

- [ ] **Step 2: Size CPU/RAM, grow root to 40 GB, set static IPs**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm set 9012 --memory 10240 --cores 4 --ipconfig0 ip=10.0.0.22/24,gw=10.0.0.1 &&
qm resize 9012 scsi0 40G &&
qm set 9013 --memory 10240 --cores 4 --ipconfig0 ip=10.0.0.23/24,gw=10.0.0.1 &&
qm resize 9013 scsi0 40G'
```
Expected: `qm resize` prints new size; others return 0.

- [ ] **Step 3: Attach the dedicated Longhorn data disk from each node's `local-data`**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm set 9012 --scsi1 local-data:470 &&
qm set 9013 --scsi1 local-data:230'
```
Expected: `update VM 9012: -scsi1 local-data:470` etc.

- [ ] **Step 4: Start both VMs and confirm they boot with the expected IPs**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'qm start 9012; qm start 9013; sleep 45;
for v in 9012 9013; do echo "== $v =="; qm guest cmd $v network-get-interfaces 2>/dev/null | grep -o "10\.0\.0\.[0-9]*" | head -1; done'
```
Expected: prints `10.0.0.22` and `10.0.0.23`.

- [ ] **Step 5: Verify operator SSH into both and that the data disk is present**

Run:
```bash
for ip in 10.0.0.22 10.0.0.23; do echo "== $ip =="; ssh -o StrictHostKeyChecking=accept-new devops@$ip 'lsblk -dno NAME,SIZE /dev/sdb; echo ok'; done
```
Expected: each prints `sdb <470G|230G>` and `ok`. (Cloud images expose the 2nd virtio-scsi disk as `sdb`.)

### Task 3.2: Format and mount the Longhorn data disk on devc-2 and devc-3

**Files:** none (VM filesystem state)

- [ ] **Step 1: Make the ext4 filesystem and persistent mount on each VM**

Run:
```bash
for ip in 10.0.0.22 10.0.0.23; do echo "== $ip =="; ssh devops@$ip '
  sudo mkfs.ext4 -F -L longhorn /dev/sdb &&
  sudo mkdir -p /var/lib/longhorn &&
  echo "LABEL=longhorn /var/lib/longhorn ext4 defaults 0 2" | sudo tee -a /etc/fstab &&
  sudo mount -a'; done
```
Expected: `mke2fs` output, then no error from `mount -a`.

- [ ] **Step 2: Verify the mount**

Run:
```bash
for ip in 10.0.0.22 10.0.0.23; do ssh devops@$ip 'df -h /var/lib/longhorn | tail -1'; done
```
Expected: each shows `/dev/sdb ... /var/lib/longhorn`.

---

## Phase 4 — k3s HA bring-up + kube-vip + Longhorn

### Task 4.1: Install the first k3s server on devc-2 with embedded etcd

**Files:** none (k3s on devc-2)

- [ ] **Step 1: Install k3s as the cluster-init server**

Run:
```bash
ssh devops@10.0.0.22 '
curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION=v1.31.5+k3s1 sh -s - server \
  --cluster-init \
  --tls-san=10.0.0.20 \
  --node-ip=10.0.0.22 \
  --disable=servicelb \
  --write-kubeconfig-mode=644'
```
Expected: installer ends `systemd: Starting k3s`.

- [ ] **Step 2: Verify the node is Ready and etcd has 1 member**

Run:
```bash
ssh devops@10.0.0.22 'sudo k3s kubectl get nodes; sudo k3s etcd-snapshot ls 2>/dev/null | head -1; echo "---"; sudo k3s kubectl get pods -A | grep -E "traefik|coredns"'
```
Expected: `devc-2 Ready control-plane,etcd,master`; traefik + coredns pods present (k3s Traefik retained).

### Task 4.2: Install kube-vip control-plane VIP via k3s auto-deploy manifests

**Files:**
- Create on devc-2: `/var/lib/rancher/k3s/server/manifests/kube-vip-rbac.yaml`
- Create on devc-2: `/var/lib/rancher/k3s/server/manifests/kube-vip-ds.yaml`

> k3s auto-applies anything in `…/server/manifests/`. kube-vip runs as a DaemonSet on control-plane nodes and advertises `10.0.0.20:6443` in ARP (L2) mode.

- [ ] **Step 1: Apply the kube-vip RBAC (upstream, pinned)**

Run:
```bash
ssh devops@10.0.0.22 'sudo curl -fL https://kube-vip.io/manifests/rbac.yaml -o /var/lib/rancher/k3s/server/manifests/kube-vip-rbac.yaml'
```
Expected: file written; no error.

- [ ] **Step 2: Generate the kube-vip DaemonSet manifest**

Run (pins kube-vip v0.8.7, ARP mode, interface auto-detected as the VM's primary NIC `ens18`):
```bash
ssh devops@10.0.0.22 '
KVVERSION=v0.8.7
sudo k3s kubectl run --rm -i kvgen --image=ghcr.io/kube-vip/kube-vip:$KVVERSION --restart=Never -- \
  manifest daemonset --interface ens18 --address 10.0.0.20 --inCluster --taint --controlplane --arp --leaderElection \
  | sudo tee /var/lib/rancher/k3s/server/manifests/kube-vip-ds.yaml >/dev/null'
```
Expected: manifest written. (If the NIC is not `ens18`, get it via `ssh devops@10.0.0.22 'ip -br link | grep -v lo'` and substitute.)

- [ ] **Step 3: Verify kube-vip is running and the VIP answers on :6443**

Run:
```bash
ssh devops@10.0.0.22 'sudo k3s kubectl -n kube-system get pods -l app.kubernetes.io/name=kube-vip-ds -o wide'
curl -sk --max-time 5 https://10.0.0.20:6443/livez && echo " VIP-OK"
```
Expected: kube-vip pod `Running`; curl prints `ok VIP-OK`.

### Task 4.3: Join devc-3 as the second server

**Files:** none (k3s on devc-3)

- [ ] **Step 1: Fetch the node token from devc-2**

Run:
```bash
TOKEN=$(ssh devops@10.0.0.22 'sudo cat /var/lib/rancher/k3s/server/node-token'); echo "${TOKEN:0:12}…"
```
Expected: prints a truncated token (non-empty).

- [ ] **Step 2: Install k3s server on devc-3 joining via the VIP**

Run:
```bash
ssh devops@10.0.0.23 "
curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION=v1.31.5+k3s1 K3S_TOKEN='$TOKEN' sh -s - server \
  --server https://10.0.0.20:6443 \
  --tls-san=10.0.0.20 \
  --node-ip=10.0.0.23 \
  --disable=servicelb \
  --write-kubeconfig-mode=644"
```
Expected: installer completes.

- [ ] **Step 3: Verify 2 Ready nodes and 2 etcd members**

Run:
```bash
ssh devops@10.0.0.22 'sudo k3s kubectl get nodes -o wide'
```
Expected: `devc-2` and `devc-3` both `Ready`, roles include `etcd`.

> **Note:** 2-member etcd has quorum 2 — losing either node halts the control plane. This is the expected transient state until `devc-1` joins in Phase 7. Functional, not yet HA.

### Task 4.4: Export the `devc` kubeconfig context to the operator machine

**Files:**
- Modify (operator): `~/.kube/config` (merge a `devc` context)

- [ ] **Step 1: Pull the kubeconfig and rewrite the server to the VIP**

Run:
```bash
ssh devops@10.0.0.22 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's#https://127.0.0.1:6443#https://10.0.0.20:6443#' \
  | sed 's#: default#: devc#g; s#name: default#name: devc#' > /tmp/devc.yaml
KUBECONFIG=~/.kube/config:/tmp/devc.yaml kubectl config view --flatten > /tmp/merged && mv /tmp/merged ~/.kube/config && rm -f /tmp/devc.yaml
```
Expected: no error.

- [ ] **Step 2: Verify the context works from the operator machine**

Run:
```bash
kubectl --context devc get nodes
```
Expected: `devc-2`, `devc-3` both `Ready`.

### Task 4.5: Install kube-vip-cloud-provider so Service `LoadBalancer` gets the VIP

**Files:**
- Create: `k3d/dev-cluster/kube-vip-cloud-provider.yaml` (reference to upstream + IP pool ConfigMap)

> The dev stack's ingress is the k3s **Traefik** Service; we give it the VIP via a LoadBalancer IP pool of exactly `10.0.0.20`.

- [ ] **Step 1: Create the repo manifest for the cloud-provider + IP pool**

Create `k3d/dev-cluster/kube-vip-cloud-provider.yaml`:
```yaml
# kube-vip-cloud-provider: hands out LoadBalancer IPs from a fixed pool.
# Upstream controller is applied separately (see Step 2); this file pins the pool.
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubevip
  namespace: kube-system
data:
  # Single-address pool: every LoadBalancer Service gets the VIP.
  cidr-global: 10.0.0.20/32
```

- [ ] **Step 2: Apply the upstream controller (pinned) and the pool**

Run:
```bash
kubectl --context devc apply -f https://raw.githubusercontent.com/kube-vip/kube-vip-cloud-provider/v0.0.11/manifest/kube-vip-cloud-controller.yaml
kubectl --context devc apply -f k3d/dev-cluster/kube-vip-cloud-provider.yaml
```
Expected: deployment `kube-vip-cloud-provider` created in `kube-system`; configmap `kubevip` created.

- [ ] **Step 3: Point the k3s Traefik Service at the VIP**

Create `k3d/dev-cluster/traefik-lb-vip.yaml` (HelmChartConfig patches k3s Traefik):
```yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    service:
      spec:
        type: LoadBalancer
        loadBalancerIP: 10.0.0.20
```

Run:
```bash
kubectl --context devc apply -f k3d/dev-cluster/traefik-lb-vip.yaml
```
Expected: `helmchartconfig.helm.cattle.io/traefik created`.

- [ ] **Step 4: Verify Traefik gets the VIP as its external IP**

Run:
```bash
sleep 20; kubectl --context devc -n kube-system get svc traefik
```
Expected: `traefik LoadBalancer ... EXTERNAL-IP 10.0.0.20`.

- [ ] **Step 5: Commit the cluster infra manifests**

```bash
git add k3d/dev-cluster/kube-vip-cloud-provider.yaml k3d/dev-cluster/traefik-lb-vip.yaml
git commit -m "feat(dev-cluster): kube-vip LB + Traefik VIP for the HA dev cluster"
```

### Task 4.6: Install Longhorn

**Files:**
- Create: `k3d/dev-cluster/longhorn-values.yaml`

- [ ] **Step 1: Pin the default replica count and data path in a values file**

Create `k3d/dev-cluster/longhorn-values.yaml`:
```yaml
# Longhorn defaults for the dev cluster. 3 replicas = one per node once devc-1
# joins; until then volumes run degraded (2/3) but data-safe.
defaultSettings:
  defaultDataPath: /var/lib/longhorn
  defaultReplicaCount: 3
  storageMinimalAvailablePercentage: 10
persistence:
  defaultClass: true
  defaultClassReplicaCount: 3
```

- [ ] **Step 2: Install Longhorn via the k3s-bundled Helm controller**

Create `k3d/dev-cluster/longhorn-helmchart.yaml`:
```yaml
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: longhorn
  namespace: kube-system
spec:
  repo: https://charts.longhorn.io
  chart: longhorn
  version: 1.7.2
  targetNamespace: longhorn-system
  createNamespace: true
  valuesContent: |-
    defaultSettings:
      defaultDataPath: /var/lib/longhorn
      defaultReplicaCount: 3
    persistence:
      defaultClass: true
      defaultClassReplicaCount: 3
```

Run:
```bash
kubectl --context devc apply -f k3d/dev-cluster/longhorn-helmchart.yaml
```
Expected: `helmchart.helm.cattle.io/longhorn created`.

- [ ] **Step 3: Verify Longhorn comes up and is the default StorageClass**

Run:
```bash
kubectl --context devc -n longhorn-system rollout status deploy/longhorn-driver-deployer --timeout=300s
kubectl --context devc get storageclass
```
Expected: deployer rolled out; `longhorn (default)` present.

- [ ] **Step 4: Smoke-test a Longhorn PVC**

Run:
```bash
kubectl --context devc apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: lh-smoke, namespace: default}
spec: {accessModes: [ReadWriteOnce], storageClassName: longhorn, resources: {requests: {storage: 1Gi}}}
EOF
sleep 10; kubectl --context devc get pvc lh-smoke
kubectl --context devc delete pvc lh-smoke
```
Expected: `lh-smoke` reaches `Bound`, then deletes cleanly.

- [ ] **Step 5: Commit the Longhorn manifests**

```bash
git add k3d/dev-cluster/longhorn-values.yaml k3d/dev-cluster/longhorn-helmchart.yaml
git commit -m "feat(dev-cluster): install Longhorn (3 replicas, default StorageClass)"
```

---

## Phase 5 — Deploy the dev-stack to the new cluster (internal smoke)

### Task 5.1: Switch the dev-stack PVC storage class to Longhorn

**Files:**
- Modify: `k3d/dev-stack/shared-db-dev.yaml` (the `storageClassName`)

- [ ] **Step 1: Find the current storageClassName**

Run:
```bash
grep -n "storageClassName" k3d/dev-stack/shared-db-dev.yaml
```
Expected: a line `storageClassName: local-path`.

- [ ] **Step 2: Change it to `longhorn`**

Edit `k3d/dev-stack/shared-db-dev.yaml`: replace `storageClassName: local-path` with `storageClassName: longhorn`.

- [ ] **Step 3: Verify no other `local-path` references remain in dev-stack**

Run:
```bash
grep -rn "local-path" k3d/dev-stack/ || echo "none"
```
Expected: `none`.

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/shared-db-dev.yaml
git commit -m "feat(dev-stack): use longhorn storageClass for shared-db-dev"
```

### Task 5.2: Add a `devcluster:*` Taskfile to provision/deploy against the new context

**Files:**
- Create: `Taskfile.devcluster.yml`
- Modify: `Taskfile.yml` (include the new taskfile)

> The existing `dev:apply` / `dev:_materialise-secrets` logic is reused, but targeting context `devc` and namespace `workspace-dev`. This task adds a thin wrapper rather than duplicating logic.

- [ ] **Step 1: Confirm how Taskfiles are included**

Run:
```bash
grep -n "includes:" -A12 Taskfile.yml | head -25
```
Expected: an `includes:` block listing `dev-stack`, `brainstorm`, etc.

- [ ] **Step 2: Create `Taskfile.devcluster.yml`**

Create `Taskfile.devcluster.yml`:
```yaml
# Taskfile.devcluster.yml
# Deploy/operate the dev.mentolder.de stack on the 3-node HA k3s cluster
# (context "devc", VIP 10.0.0.20). Reuses dev-stack manifests + secret logic.
version: "3"

vars:
  CTX: devc
  NS: workspace-dev
  VIP: 10.0.0.20

tasks:
  deploy:
    desc: "[devcluster] Materialise secrets + apply dev-stack to the HA cluster"
    cmds:
      - task: dev:_materialise-secrets
        vars: {CTX_DEV: "{{.CTX}}", NS_DEV: "{{.NS}}"}
      - task: dev:apply
        vars: {CTX_DEV: "{{.CTX}}", NS_DEV: "{{.NS}}"}

  status:
    desc: "[devcluster] Pod + ingress status on the HA cluster"
    cmds:
      - kubectl --context {{.CTX}} -n {{.NS}} get pods,svc,ingress -o wide
      - 'curl -sSI --max-time 5 -H "Host: web.dev.mentolder.de" http://{{.VIP}}/ || true'
```

- [ ] **Step 3: Add the include to `Taskfile.yml`**

Edit `Taskfile.yml` `includes:` block, add:
```yaml
  devcluster:
    taskfile: ./Taskfile.devcluster.yml
```

- [ ] **Step 4: Verify task discovery**

Run:
```bash
task --list 2>/dev/null | grep devcluster
```
Expected: `devcluster:deploy` and `devcluster:status` listed.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.devcluster.yml Taskfile.yml
git commit -m "feat(devcluster): task wrapper to deploy dev-stack to the HA cluster"
```

### Task 5.3: Deploy the dev-stack and seed the database

**Files:** none (live cluster state)

- [ ] **Step 1: Deploy**

Run:
```bash
ENV=mentolder task devcluster:deploy
```
Expected: secrets created, manifests applied (namespace `workspace-dev`, deployments for website/brett/mcp/shared-db).

- [ ] **Step 2: Verify all pods reach Ready**

Run:
```bash
kubectl --context devc -n workspace-dev get pods
```
Expected: `shared-db-dev-0`, website, brett, mcp-monolith, mcp-auth-proxy all `Running`/`Ready`. (shared-db PVC is `Bound` on Longhorn.)

- [ ] **Step 3: Seed dev DB once from prod (manual refresh path)**

Run:
```bash
ENV=mentolder task dev:db:refresh
```
Expected: `pg_restore` completes for the `website` database (the only DB present on prod source).

- [ ] **Step 4: Internal smoke via the VIP (bypassing the public chain)**

Run:
```bash
for h in web.dev.mentolder.de brett.dev.mentolder.de; do
  echo "== $h =="; curl -sS -o /dev/null -w "%{http_code}\n" -H "Host: $h" http://10.0.0.20/
done
```
Expected: `200` (or a normal app redirect `30x`) for each — proves Traefik on the VIP routes to the apps.

---

## Phase 6 — Cutover (flip the public path)

> Each step in this phase is independently revertible: keep the old `--upstream`/`PGHOST` values noted so you can roll back in one apply.

### Task 6.1: Repoint `oauth2-proxy-dev` upstream to the VIP

**Files:**
- Modify: `prod-mentolder/oauth2-proxy-dev.yaml` (the `--upstream` arg)

- [ ] **Step 1: Locate the upstream arg**

Run:
```bash
grep -n "upstream" prod-mentolder/oauth2-proxy-dev.yaml
```
Expected: `--upstream=http://127.0.0.1:18080`.

- [ ] **Step 2: Change it to the VIP**

Edit `prod-mentolder/oauth2-proxy-dev.yaml`: replace `--upstream=http://127.0.0.1:18080` with `--upstream=http://10.0.0.20:80`.

- [ ] **Step 3: Apply to the prod mentolder cluster**

Run:
```bash
ENV=mentolder task workspace:deploy   # or the targeted apply the repo uses for prod-mentolder
kubectl --context mentolder -n workspace rollout status deploy/oauth2-proxy-dev --timeout=120s
```
Expected: rollout completes.

- [ ] **Step 4: Verify oauth2-proxy can reach the VIP**

Run:
```bash
kubectl --context mentolder -n workspace exec deploy/oauth2-proxy-dev -- wget -qO- --timeout=5 http://10.0.0.20:80 >/dev/null && echo REACHABLE
```
Expected: `REACHABLE`. (If not, the `k3s-1`→VIP LAN route is missing — see spec 3a; confirm k3s-1 has a `vmbr0` leg.)

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/oauth2-proxy-dev.yaml
git commit -m "feat(dev): repoint oauth2-proxy-dev upstream to the HA dev-cluster VIP"
```

### Task 6.2: Repoint the `dev-db-refresh` CronJob write target

**Files:**
- Modify: `prod-mentolder/dev-db-refresh-cron.yaml` (the `PGHOST`/`PGPORT` env)

- [ ] **Step 1: Add a NodePort for dev Postgres reachable on the VIP**

Create `k3d/dev-stack/shared-db-dev-nodeport.yaml` (or confirm the existing NodePort 30000 carries over) — expose Postgres on the VIP at `:15432` via a `LoadBalancer` Service:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: shared-db-dev-lb
  namespace: workspace-dev
spec:
  type: LoadBalancer
  loadBalancerIP: 10.0.0.20
  selector: {app: shared-db-dev}
  ports: [{name: pg, port: 15432, targetPort: 5432}]
```
> kube-vip-cloud-provider already owns `10.0.0.20`; a second LB Service on the same IP but a distinct port (`15432` vs Traefik's `80/443`) is fine.

Run:
```bash
kubectl --context devc apply -f k3d/dev-stack/shared-db-dev-nodeport.yaml
sleep 10; kubectl --context devc -n workspace-dev get svc shared-db-dev-lb
```
Expected: `EXTERNAL-IP 10.0.0.20`, port `15432`.

- [ ] **Step 2: Change the CronJob's write target**

Edit `prod-mentolder/dev-db-refresh-cron.yaml`: change `PGHOST` from `127.0.0.1` to `10.0.0.20` and `PGPORT` to `15432` (record old values for rollback).

- [ ] **Step 3: Apply and trigger a manual run**

Run:
```bash
ENV=mentolder task workspace:deploy
kubectl --context mentolder -n workspace create job --from=cronjob/dev-db-refresh dev-db-refresh-manual
kubectl --context mentolder -n workspace wait --for=condition=complete job/dev-db-refresh-manual --timeout=300s
```
Expected: job completes.

- [ ] **Step 4: Verify dev DB got the refresh**

Run:
```bash
kubectl --context devc -n workspace-dev exec shared-db-dev-0 -- psql -U postgres -d website -c "select count(*) from site_settings;" 2>/dev/null
```
Expected: a row count (non-error) — data arrived from prod.

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/dev-db-refresh-cron.yaml k3d/dev-stack/shared-db-dev-nodeport.yaml
git commit -m "feat(dev): repoint dev-db-refresh write target to the HA dev-cluster VIP"
```

### Task 6.3: End-to-end public verification

**Files:** none

- [ ] **Step 1: Hit the public URL through the full chain**

Run (must be authenticated as a `/dev-access` member; expect the OIDC redirect if not):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://web.dev.mentolder.de/
```
Expected: `200` when authenticated, or `302` to Keycloak when not — both prove prod Traefik → oauth2-proxy-dev → VIP works.

- [ ] **Step 2: Confirm the old k3d port is no longer in the path**

Run:
```bash
kubectl --context mentolder -n workspace get deploy oauth2-proxy-dev -o jsonpath='{.spec.template.spec.containers[0].args}' | tr ',' '\n' | grep upstream
```
Expected: `--upstream=http://10.0.0.20:80` (not `127.0.0.1:18080`).

---

## Phase 7 — Decommission k3d, shrink k3s-1, add devc-1 → full HA

### Task 7.1: Decommission the old k3d dev cluster

**Files:** none (VM state)

- [ ] **Step 1: Confirm nothing still depends on the old k3d (public path already flipped)**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://web.dev.mentolder.de/
```
Expected: `200`/`302` (still served — via the new cluster, not k3d).

- [ ] **Step 2: Delete the k3d cluster on k3s-1**

Run:
```bash
ssh -i ~/.ssh/gekko_id_ed25519 gekko@k3s-1 'k3d cluster delete mentolder-dev'
```
Expected: `Successfully deleted cluster mentolder-dev`.

### Task 7.2: Shrink the k3s-1 VM to free RAM on `pve`

**Files:** none (VM 9001)

- [ ] **Step 1: Lower k3s-1 memory and reboot**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'qm set 9001 --memory 3072 && qm reboot 9001'
```
Expected: `update VM 9001: -memory 3072`.

- [ ] **Step 2: Verify k3s-1's mentolder-agent role is still healthy after reboot**

Run:
```bash
kubectl --context mentolder get node k3s-1
```
Expected: `k3s-1 Ready` (the mentolder-agent role survives; only RAM shrank).

- [ ] **Step 3: Verify `pve` now has headroom for devc-1**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 "free -g | awk '/Mem/{print \$7\" GiB available\"}'"
```
Expected: ≥ 9 GiB available (room for the 8 GB devc-1).

### Task 7.3: Provision devc-1 on `pve` and join as the 3rd server

**Files:** none (VM 9011)

- [ ] **Step 1: Clone, size, attach 900 GB data disk, start**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 '
qm clone 9000 9011 --name devc-1 --full --target pve &&
qm set 9011 --memory 8192 --cores 4 --ipconfig0 ip=10.0.0.21/24,gw=10.0.0.1 &&
qm resize 9011 scsi0 40G &&
qm set 9011 --scsi1 local-data:900 &&
qm start 9011 && sleep 45 &&
qm guest cmd 9011 network-get-interfaces | grep -o "10\.0\.0\.21"'
```
Expected: prints `10.0.0.21`.

- [ ] **Step 2: Format + mount the data disk**

Run:
```bash
ssh -o StrictHostKeyChecking=accept-new devops@10.0.0.21 '
  sudo mkfs.ext4 -F -L longhorn /dev/sdb &&
  sudo mkdir -p /var/lib/longhorn &&
  echo "LABEL=longhorn /var/lib/longhorn ext4 defaults 0 2" | sudo tee -a /etc/fstab &&
  sudo mount -a && df -h /var/lib/longhorn | tail -1'
```
Expected: shows `/dev/sdb ... /var/lib/longhorn`.

- [ ] **Step 3: Join devc-1 as a server**

Run:
```bash
TOKEN=$(ssh devops@10.0.0.22 'sudo cat /var/lib/rancher/k3s/server/node-token')
ssh devops@10.0.0.21 "
curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION=v1.31.5+k3s1 K3S_TOKEN='$TOKEN' sh -s - server \
  --server https://10.0.0.20:6443 --tls-san=10.0.0.20 --node-ip=10.0.0.21 \
  --disable=servicelb --write-kubeconfig-mode=644"
```
Expected: installer completes.

- [ ] **Step 4: Verify full 3-node HA**

Run:
```bash
kubectl --context devc get nodes -o wide
kubectl --context devc -n longhorn-system get nodes.longhorn.io
```
Expected: 3 nodes `Ready`; Longhorn shows 3 schedulable nodes.

- [ ] **Step 5: Verify Longhorn volumes heal to 3 replicas**

Run:
```bash
kubectl --context devc -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,ROBUSTNESS:.status.robustness,REPLICAS:.spec.numberOfReplicas
```
Expected: the shared-db volume `robustness: healthy`, `3` replicas.

### Task 7.4: Resilience verification (the actual goal)

**Files:** none

- [ ] **Step 1: Drain+power off one node and confirm the stack stays up**

Run:
```bash
kubectl --context devc cordon devc-3
kubectl --context devc drain devc-3 --ignore-daemonsets --delete-emptydir-data --timeout=120s
ssh -i /tmp/pve_key root@10.0.0.7 'ssh pve3 "qm stop 9013"'
sleep 30
kubectl --context devc get nodes
curl -sS -o /dev/null -w "%{http_code}\n" -H "Host: web.dev.mentolder.de" http://10.0.0.20/
```
Expected: `devc-3 NotReady`, etcd still quorate (2/3), VIP still answers, app returns `200`/`30x`.

- [ ] **Step 2: Restore the node**

Run:
```bash
ssh -i /tmp/pve_key root@10.0.0.7 'ssh pve3 "qm start 9013"'; sleep 60
kubectl --context devc uncordon devc-3
kubectl --context devc get nodes
```
Expected: `devc-3 Ready` again; Longhorn rebuilds its replica.

---

## Phase 8 — brainstorm consolidation + security hardening + cleanup

### Task 8.1: Deploy a consolidated sish broker + brainstorm ingress on the dev cluster

**Files:**
- Modify: `k3d/dev-stack/sish.yaml` (ensure it serves both `*.dev` and `brainstorm`)
- Create: `k3d/dev-stack/brainstorm-ingress.yaml`
- Modify: `prod-mentolder/cert-dev-wildcard.yaml` (add `brainstorm.mentolder.de` SAN)

- [ ] **Step 1: Add `brainstorm.mentolder.de` as a SAN on the dev wildcard cert**

Run:
```bash
grep -n "dnsNames" -A4 prod-mentolder/cert-dev-wildcard.yaml
```
Expected: lists `dev.mentolder.de`, `*.dev.mentolder.de`. Edit to add `- brainstorm.mentolder.de`.

- [ ] **Step 2: Create the brainstorm ingress routing to the sish broker**

Create `k3d/dev-stack/brainstorm-ingress.yaml`:
```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: brainstorm
  namespace: workspace-dev
spec:
  entryPoints: [websecure]
  routes:
    - match: Host(`brainstorm.mentolder.de`)
      kind: Rule
      services:
        - name: sish
          port: 80
  tls:
    secretName: workspace-dev-wildcard-tls
```

- [ ] **Step 3: Apply cert + ingress and verify the cert picks up the new SAN**

Run:
```bash
ENV=mentolder task workspace:deploy           # re-applies the cert on prod mentolder
kubectl --context devc apply -f k3d/dev-stack/brainstorm-ingress.yaml
kubectl --context mentolder -n workspace get certificate workspace-dev-wildcard-tls -o jsonpath='{.spec.dnsNames}'
```
Expected: dnsNames includes `brainstorm.mentolder.de`.

- [ ] **Step 4: Commit**

```bash
git add prod-mentolder/cert-dev-wildcard.yaml k3d/dev-stack/brainstorm-ingress.yaml k3d/dev-stack/sish.yaml
git commit -m "feat(brainstorm): serve brainstorm.mentolder.de via consolidated dev-cluster sish"
```

### Task 8.2: Repoint `Taskfile.brainstorm.yml` at the dev-cluster VIP and retire the prod broker

**Files:**
- Modify: `Taskfile.brainstorm.yml` (NODE/SSH target → VIP)
- Delete: `k3d/brainstorm-sish.yaml`
- Modify: `k3d/kustomization.yaml` (remove the `brainstorm-sish.yaml` entry if present)

- [ ] **Step 1: Repoint the publish target**

Edit `Taskfile.brainstorm.yml`: change `NODE: gekko-hetzner-2` and the SSH `TARGET` logic to use the dev-cluster sish entry (VIP `10.0.0.20`, the sish NodePort). Update `CTX_PROD`/`NS_PROD` to `devc`/`workspace-dev` and the `status` probe host to `brainstorm.mentolder.de`.

- [ ] **Step 2: Remove the standalone prod broker from the cluster and repo**

Run:
```bash
kubectl --context mentolder -n workspace delete -f k3d/brainstorm-sish.yaml --ignore-not-found
grep -rn "brainstorm-sish" k3d/kustomization.yaml && sed -i '/brainstorm-sish.yaml/d' k3d/kustomization.yaml || true
git rm k3d/brainstorm-sish.yaml
```
Expected: resource deleted; file removed from git.

- [ ] **Step 3: Verify kustomize still builds**

Run:
```bash
task workspace:validate
```
Expected: validation passes (no dangling reference to `brainstorm-sish.yaml`).

- [ ] **Step 4: Verify a brainstorm tunnel end-to-end**

Run (start a throwaway local server, publish, probe):
```bash
( python3 -m http.server 8099 & echo $! > /tmp/bs.pid )
ENV=mentolder task brainstorm:publish -- 8099 &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" https://brainstorm.mentolder.de/
kill "$(cat /tmp/bs.pid)"; pkill -f "brainstorm:publish" || true
```
Expected: `200` — the tunnel through the dev cluster works.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.brainstorm.yml k3d/kustomization.yaml
git commit -m "feat(brainstorm): repoint publish to dev-cluster VIP; retire prod brainstorm-sish"
```

### Task 8.3: Harden `mcp-auth-proxy-dev` (the flagged finding)

**Files:**
- Modify: `k3d/dev-stack/mcp-auth-proxy-dev.yaml` (log format + Referrer-Policy)
- Modify: `k3d/dev-stack/mcp-ingress-dev.yaml` (response-header middleware)

- [ ] **Step 1: Strip the `token` query arg from the nginx access-log format**

Edit `k3d/dev-stack/mcp-auth-proxy-dev.yaml`: in the nginx `http {}` block, define a `log_format` that logs `$uri` (path only) instead of `$request`/`$request_uri`, so `?token=` is never written. Apply it on the `access_log` directive.

- [ ] **Step 2: Add `Referrer-Policy: no-referrer` on auth-proxy + MCP responses**

Edit `k3d/dev-stack/mcp-ingress-dev.yaml`: add a Traefik `Middleware` of kind `headers` setting `Referrer-Policy: no-referrer` and reference it in the `mcp-dev-chain` middleware list.

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata: {name: mcp-no-referrer, namespace: workspace-dev}
spec:
  headers:
    customResponseHeaders:
      Referrer-Policy: "no-referrer"
```

- [ ] **Step 3: Apply and verify the header is present**

Run:
```bash
kubectl --context devc apply -k k3d/dev-stack/
curl -sSI -H "Host: mcp.dev.mentolder.de" http://10.0.0.20/kubernetes | grep -i referrer-policy
```
Expected: `Referrer-Policy: no-referrer`.

- [ ] **Step 4: Verify `token` no longer appears in access logs**

Run:
```bash
curl -sS -H "Host: mcp.dev.mentolder.de" "http://10.0.0.20/kubernetes?token=LEAKTEST" >/dev/null
kubectl --context devc -n workspace-dev logs deploy/mcp-auth-proxy-dev --tail=20 | grep -c LEAKTEST
```
Expected: `0` (token not logged).

- [ ] **Step 5: Document `CLUSTER_TOKEN` rotation**

Add to `docs/dev-stack/README.md` a "Token rotation" note: rotate `DEV_MCP_TOKEN` in `environments/.secrets/mentolder.yaml`, re-run `task devcluster:deploy`, on a quarterly cadence. (Dropping the `?token=` fallback entirely is deferred until claude.ai web header-only auth is confirmed — track as a follow-up.)

- [ ] **Step 6: Commit**

```bash
git add k3d/dev-stack/mcp-auth-proxy-dev.yaml k3d/dev-stack/mcp-ingress-dev.yaml docs/dev-stack/README.md
git commit -m "fix(mcp-dev): strip token from logs, add Referrer-Policy, document rotation"
```

### Task 8.4: Replace the old k3d `dev:cluster:create` flow + update env vars/docs

**Files:**
- Modify: `Taskfile.dev-stack.yml` (deprecate `dev:cluster:create`; point operators at `devcluster:*`)
- Modify: `environments/mentolder.yaml` (add `DEVC_VIP`, `DEVC_NODE_IPS`)
- Modify: `CLAUDE.md` (update the "dev.mentolder.de stack" gotchas section)

- [ ] **Step 1: Add new env vars**

Edit `environments/mentolder.yaml`: add `DEVC_VIP: 10.0.0.20` and a comment block documenting `devc-1/2/3` IPs and the kube context `devc`. Add the same keys to `environments/schema.yaml` so `env:validate` passes.

- [ ] **Step 2: Deprecate the k3d create task**

Edit `Taskfile.dev-stack.yml`: make `dev:cluster:create` print a deprecation notice pointing to `Taskfile.devcluster.yml` + this plan, and exit non-zero, so nobody silently recreates the dead k3d cluster.

- [ ] **Step 3: Update CLAUDE.md gotchas**

Edit `CLAUDE.md` "dev.mentolder.de stack" section: replace the "single k3d on k3s-1 / port mappings 18080/2222/15432" description with the new model (3-node k3s HA on Proxmox, VIP 10.0.0.20, context `devc`, Longhorn storage, oauth2-proxy-dev upstream → VIP).

- [ ] **Step 4: Validate env + manifests**

Run:
```bash
ENV=mentolder task env:validate
task workspace:validate
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add environments/mentolder.yaml environments/schema.yaml Taskfile.dev-stack.yml CLAUDE.md
git commit -m "chore(dev): retire k3d dev:cluster:create; document HA dev-cluster model"
```

---

## Phase 9 — Tests & final verification

### Task 9.1: Add a BATS smoke test for the HA dev cluster

**Files:**
- Create: `tests/local/NFA-XX-devcluster-ha.bats` (use the next free NFA id — check `website/src/data/test-inventory.json`)
- Modify: `website/src/data/test-inventory.json` (regenerate)

- [ ] **Step 1: Find the next free NFA id**

Run:
```bash
grep -o "NFA-[0-9]*" -r tests/ | sort -u | tail -5
```
Expected: lists existing NFA ids; pick the next.

- [ ] **Step 2: Write the test**

Create `tests/local/NFA-XX-devcluster-ha.bats`:
```bash
#!/usr/bin/env bats
# NFA-XX: the HA dev cluster has 3 etcd members and a healthy shared-db volume.

@test "devc cluster has 3 Ready nodes" {
  run kubectl --context devc get nodes --no-headers
  [ "$status" -eq 0 ]
  ready=$(echo "$output" | grep -c " Ready ")
  [ "$ready" -eq 3 ]
}

@test "shared-db-dev Longhorn volume is healthy with 3 replicas" {
  run kubectl --context devc -n longhorn-system get volumes.longhorn.io -o jsonpath='{.items[*].status.robustness}'
  [ "$status" -eq 0 ]
  [[ "$output" == *"healthy"* ]]
}

@test "VIP serves the website host" {
  run curl -sS -o /dev/null -w "%{http_code}" -H "Host: web.dev.mentolder.de" http://10.0.0.20/
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^(200|301|302)$ ]]
}
```

- [ ] **Step 3: Run the test**

Run:
```bash
./tests/runner.sh local NFA-XX
```
Expected: 3 tests pass.

- [ ] **Step 4: Regenerate the test inventory (CI gate)**

Run:
```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```
Expected: inventory updated to include `NFA-XX`.

- [ ] **Step 5: Commit**

```bash
git add tests/local/NFA-XX-devcluster-ha.bats website/src/data/test-inventory.json
git commit -m "test(devcluster): NFA-XX smoke test for HA dev cluster"
```

### Task 9.2: Run offline test suite and open the PR

**Files:** none

- [ ] **Step 1: Run the offline suite**

Run:
```bash
task test:all
```
Expected: all green (BATS unit, kustomize structure, Taskfile dry-run, inventory check).

- [ ] **Step 2: Push and open the PR**

Run:
```bash
git push -u origin feature/multinode-dev-cluster-ha
gh pr create --fill --base main
```
Expected: PR created; CI runs.

---

## Rollback notes

- **Phase 6 is the only externally-visible flip.** To roll back, revert `oauth2-proxy-dev --upstream` to `http://127.0.0.1:18080` and `dev-db-refresh` `PGHOST` to `127.0.0.1:15432`, re-apply to `mentolder` — but this only works while the old k3d cluster still exists (i.e. before Phase 7.1). After k3d is deleted, rollback means re-creating the k3d cluster.
- **Before Phase 7.1**, the new cluster runs in parallel with the live k3d; aborting just means not flipping.
- The Proxmox storage prep (Phase 1) and template (Phase 2) are additive and safe to leave in place even if the project is paused.
