---
title: "RustDesk-Server im Workspace-Stack — Implementation Plan"
ticket_id: "T001372"
domains: [infra, security]
status: plan_staged
---

# rustdesk-server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a self-hosted RustDesk relay (hbbs + hbbr, open-source edition) as a shared, publicly reachable remote-desktop rendezvous/relay service for both brands, following the existing coturn/Janus `hostNetwork` + node-pin pattern.

**Architecture:** A new privileged namespace `rustdesk` holds two `hostNetwork` Deployments (`hbbs`, `hbbr`) pinned to `${TURN_NODE}` (the same public Fleet node as coturn/Janus, currently `pk-hetzner-4`). Traefik cannot route raw TCP/UDP, so the pods bind host ports directly. The ed25519 signing keypair is pre-generated and stored in a namespace-scoped SealedSecret `rustdesk-secrets` (no PVC), keeping client IDs stable across pod restarts. Firewall rules are added to `prod/cloud-init.yaml` and both Hetzner node-join templates; the live node and DNS record are handled as explicit manual runbook steps.

**Tech Stack:** Kubernetes Deployments, Kustomize, `kubeseal`/SealedSecrets, `envsubst`, `ufw` cloud-init, BATS (kustomize-render assertions).

## Global Constraints

- **Image (digest-pinned):** `rustdesk/rustdesk-server:1.1.15@sha256:10818ec05b179039c6660f4d8e74b303f0db2858bbad2b18e24992ea22d54cd6` (multi-arch manifest-list digest, tag `1.1.15` == `latest` as of 2026-01-13; verified via Docker Hub tag API). Same image serves `hbbs`, `hbbr`, and the `rustdesk-utils` key generator.
- **Node pin:** `nodeSelector: kubernetes.io/hostname: ${TURN_NODE}` on both Deployments. `${TURN_NODE}` and `${TURN_PUBLIC_IP}` (`204.168.244.104`) are reused verbatim from `environments/mentolder.yaml` — no new `RUSTDESK_NODE`/`RUSTDESK_PUBLIC_IP` variables.
- **Ports (native clients only):** `hbbs` 21115/tcp, 21116/tcp, 21116/udp; `hbbr` 21117/tcp. The web-client ports 21118/21119 are never opened (no `containerPort`, no `hostPort`, no firewall rule).
- **Namespace:** `rustdesk` with `pod-security.kubernetes.io/enforce: privileged` (+`warn: privileged`), required for `hostNetwork`/`hostPort`.
- **Secret:** SealedSecret `rustdesk-secrets` in namespace `rustdesk`, data keys `id_ed25519` (private) + `id_ed25519.pub` (public). Sealed via the schema-driven `extra_namespaces` mechanism (exactly the `coturn-secrets` pattern).
- **Deploy path:** `task fleet:shared-services` (one deploy serves both brands). No entry in `prod-fleet/mentolder/` or `prod-fleet/korczewski/`.
- **Explicitly excluded:** no Traefik `IngressRoute`, no `configmap-domains.yaml` entry, no PVC, no in-cluster `Service` (clients reach the host IP directly over the internet), no automated key rotation.
- **S1 LOC-Ratchet does not gate this change.** Every touched file is `.yaml`/`.yml`/`.tmpl`/`.bats`, all ungated extensions (`scripts/plan-lint.sh` `_ext_limit()` returns `0`, `intel.json` `s1_limit=0` for every impact file). There is therefore no line budget to defend — the S1 gate is a no-op here by extension, not by exemption.
- **S3 (no hardcoded brand domains):** hbbs/hbbr have no "domain" config, so no `k3d/*.yaml` codeblock contains `rustdesk.mentolder.de`. The hostname appears only in the DNS runbook step (Task 6) as prose.
- **Execution timeline:** Tasks 1–5 (artifacts) and Task 7 (branch CI gates) run on the `feature/rustdesk-server` branch, before the PR merges. Task 6 (live `ufw` on `pk-hetzner-4`, DNS A-record, fleet deploy, connection test) is the **post-merge operational rollout** and runs only after Task 7 is green and the PR has merged. Task 7 is listed last to satisfy the mandatory-gates-in-final-task convention, even though its steps run before Task 6's rollout in wall-clock time.

## File Structure

New files (all created under `k3d/rustdesk-stack/` unless noted):

- `k3d/rustdesk-stack/namespace.yaml` — `Namespace` `rustdesk` + privileged PSA labels (mirrors `k3d/coturn-stack/namespace.yaml`).
- `k3d/rustdesk-stack/secret.yaml` — dev-literal `rustdesk-secrets` `Secret` with `sealedsecrets.bitnami.com/managed: "true"` so the SealedSecret controller adopts it (mirrors `k3d/coturn-stack/secret.yaml`).
- `k3d/rustdesk-stack/hbbs.yaml` — `hbbs` Deployment (`hostNetwork`, node-pin, ports 21115/21116, mounts the keypair).
- `k3d/rustdesk-stack/hbbr.yaml` — `hbbr` Deployment (`hostNetwork`, node-pin, port 21117; no key mount).
- `k3d/rustdesk-stack/kustomization.yaml` — references the four files above (S4 orphan-guard).
- `tests/spec/rustdesk-server.bats` — kustomize-render assertions (failing-test-first).

Modified files:

- `environments/schema.yaml` — declare the two rustdesk secret keys with an `extra_namespaces` mapping onto `rustdesk/rustdesk-secrets` (analogous to the `SIGNALING_SECRET`/`TURN_SECRET` → `coturn-secrets` block).
- `environments/.secrets/mentolder.yaml` — add the two generated ed25519 key values (git-crypt-encrypted at rest; alongside the existing SSH private keys).
- `environments/sealed-secrets/mentolder.yaml` — regenerated by `task env:seal ENV=mentolder`; gains the `rustdesk-secrets` SealedSecret document. Never hand-edited (the seal script truncates and rewrites this file, so a manual append would be lost on the next seal).
- `Taskfile.yml` — extend `fleet:shared-services` to build + apply `k3d/rustdesk-stack`.
- `prod/cloud-init.yaml` — four `ufw allow` lines (21115/tcp, 21116/tcp, 21116/udp, 21117/tcp).
- `scripts/hetzner/cloud-init.yaml.tmpl` — same four rules (node-join template).
- `scripts/hetzner/cloud-init-server.yaml.tmpl` — same four rules (control-plane node-join template).

### S1 budget reference (from `intel.json`)

| File | intel `loc` | `s1_limit` | Gated |
|---|---|---|---|
| `Taskfile.yml` | 4468 | 0 | no |
| `prod/cloud-init.yaml` | 188 | 0 | no |
| `scripts/hetzner/cloud-init.yaml.tmpl` | 66 | 0 | no |
| `scripts/hetzner/cloud-init-server.yaml.tmpl` | 78 | 0 | no |
| `environments/sealed-secrets/mentolder.yaml` | 291 | 0 | no |
| `k3d/rustdesk-stack/namespace.yaml` | 0 | 0 | no |
| `k3d/rustdesk-stack/hbbs.yaml` | 0 | 0 | no |
| `k3d/rustdesk-stack/hbbr.yaml` | 0 | 0 | no |
| `k3d/rustdesk-stack/secret.yaml` | 0 | 0 | no |
| `k3d/rustdesk-stack/kustomization.yaml` | 0 | 0 | no |

`environments/schema.yaml`, `environments/.secrets/mentolder.yaml`, and `tests/spec/rustdesk-server.bats` are not in `intel.json`'s impact set (it captured the sealed output only), but they are equally ungated (`.yaml`/`.bats` → `s1_limit=0`).

### Spec coverage map

- **REQ-RUSTDESK-RELAY-001** (shared relay, both brands) → Task 3 (single stack) + Task 4 (`fleet:shared-services`) + Task 6 (DNS).
- **REQ-RUSTDESK-RELAY-002** (stable client IDs via persisted keypair) → Task 1 (SealedSecret) + Task 3 (keypair mount).
- **REQ-RUSTDESK-RELAY-003** (relay fallback via hbbr) → Task 3 (`hbbr` Deployment + 21117) + Task 6 (forced-relay connection test).
- **REQ-RUSTDESK-RELAY-004** (minimal port surface, no web client) → Task 3 (no 21118/21119) + Task 5 (firewall omits 21118/21119) + Task 2 (test asserts their absence).
- **REQ-RUSTDESK-RELAY-005** (firewall on pinned node + future nodes) → Task 5 (cloud-init templates) + Task 6 (live `ufw` on `pk-hetzner-4`).

---

### Task 1: Pre-generate the ed25519 keypair and seal `rustdesk-secrets`

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/.secrets/mentolder.yaml`
- Regenerate (do not hand-edit): `environments/sealed-secrets/mentolder.yaml`

**Interfaces:**
- Consumes: the digest-pinned image (for `rustdesk-utils`), the mentolder sealing cert `environments/certs/fleet-mentolder.pem` (used by `task env:seal`).
- Produces: a SealedSecret `rustdesk-secrets` in namespace `rustdesk` with keys `id_ed25519` and `id_ed25519.pub`. Task 3's `hbbs` Deployment mounts these two keys by exactly those names.

- [ ] **Step 1: Generate the keypair with `rustdesk-utils genkeypair`**

`hbbs` reads its signing key from `id_ed25519` / `id_ed25519.pub` in its working directory and, if absent, generates them on first boot. Pre-generating pins the server's public key so client IDs stay valid across pod restarts. `rustdesk-utils genkeypair` emits a keypair in the exact format hbbs expects (and retries internally so the public key never contains `/` or `:`).

```bash
IMG='rustdesk/rustdesk-server:1.1.15@sha256:10818ec05b179039c6660f4d8e74b303f0db2858bbad2b18e24992ea22d54cd6'
OUT="$(docker run --rm --entrypoint rustdesk-utils "$IMG" genkeypair)"
echo "$OUT"
RUSTDESK_PUB="$(sed -n 's/^Public Key:[[:space:]]*//p' <<<"$OUT")"
RUSTDESK_SEC="$(sed -n 's/^Secret Key:[[:space:]]*//p' <<<"$OUT")"
# Sanity: both must be non-empty base64 strings.
[ -n "$RUSTDESK_PUB" ] && [ -n "$RUSTDESK_SEC" ] && echo "keypair OK"
```

Expected: prints `Public Key: …` / `Secret Key: …` and `keypair OK`.

- [ ] **Step 2: Declare the two secret keys in `environments/schema.yaml`**

Add these two entries to the `secrets:` list (place them next to the `SIGNALING_SECRET`/`TURN_SECRET` block for locality). They are declared exactly like the coturn keys but with `dest_key` set so the SealedSecret lands with the file-names hbbs expects. No `generate: true` — the values are supplied by hand (they must form a valid keypair, not a random string).

```yaml
  - name: RUSTDESK_ID_ED25519
    required: true
    extra_namespaces:
      - namespace: rustdesk
        secret: rustdesk-secrets
        dest_key: id_ed25519

  - name: RUSTDESK_ID_ED25519_PUB
    required: true
    extra_namespaces:
      - namespace: rustdesk
        secret: rustdesk-secrets
        dest_key: id_ed25519.pub
```

- [ ] **Step 3: Add the plaintext values to `environments/.secrets/mentolder.yaml`**

Append the two lines (this file is git-crypt-encrypted at rest and already holds other private keys). Substitute the actual `$RUSTDESK_SEC` / `$RUSTDESK_PUB` values captured in Step 1:

```yaml
RUSTDESK_ID_ED25519: "<value of RUSTDESK_SEC from Step 1>"
RUSTDESK_ID_ED25519_PUB: "<value of RUSTDESK_PUB from Step 1>"
```

- [ ] **Step 4: Validate the env registry accepts the new keys**

```bash
task env:validate ENV=mentolder
```

Expected: PASS — no "unknown key" error for `RUSTDESK_ID_ED25519*` (they are now schema-declared).

- [ ] **Step 5: Re-seal, producing the `rustdesk-secrets` SealedSecret**

`scripts/env-seal.sh` truncates `environments/sealed-secrets/mentolder.yaml` and rewrites it (workspace-secrets first, then one SealedSecret per `extra_namespaces` pair), so this step is the only supported way to add `rustdesk-secrets` — a hand-appended block would be wiped on the next seal.

```bash
task env:seal ENV=mentolder
grep -n 'name: rustdesk-secrets' environments/sealed-secrets/mentolder.yaml
```

Expected: `grep` finds the `rustdesk-secrets` SealedSecret document (namespace `rustdesk`).

- [ ] **Step 6: Commit**

```bash
git add environments/schema.yaml environments/.secrets/mentolder.yaml environments/sealed-secrets/mentolder.yaml
git commit -m "feat(rustdesk): seal pre-generated ed25519 keypair as rustdesk-secrets"
```

---

### Task 2: Write the failing kustomize-render test (RED)

**Files:**
- Create: `tests/spec/rustdesk-server.bats`

**Interfaces:**
- Consumes: nothing yet — the stack directory does not exist, which is what makes this test red.
- Produces: the render contract Task 3 must satisfy (namespace PSA, hostNetwork, node-pin, exact ports, digest pin, absence of 21118/21119).

- [ ] **Step 1: Create `tests/spec/rustdesk-server.bats`**

One BATS file per SSOT spec (`openspec/specs/rustdesk-server.md` after archive). Each test renders `k3d/rustdesk-stack` with kustomize and asserts on the output; `${TURN_NODE}` stays literal in the render (envsubst runs at deploy time), so the assertions are offline and cluster-free.

```bash
#!/usr/bin/env bats
# tests/spec/rustdesk-server.bats
# SSOT: openspec/specs/rustdesk-server.md (post-archive)
# Renders k3d/rustdesk-stack offline and asserts the hbbs/hbbr contract.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  STACK="${REPO_ROOT}/k3d/rustdesk-stack"
}

@test "rustdesk: kustomize build k3d/rustdesk-stack succeeds (no broken refs)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  run kustomize build "$STACK"
  [ "$status" -eq 0 ]
}

@test "rustdesk: namespace enforces privileged PSA" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'kind:[[:space:]]+Namespace'
  echo "$out" | grep -qE 'pod-security.kubernetes.io/enforce:[[:space:]]*privileged'
}

@test "rustdesk: hbbs + hbbr run on hostNetwork, pinned to \${TURN_NODE}" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  # two Deployments
  [ "$(echo "$out" | grep -cE '^kind:[[:space:]]+Deployment')" -eq 2 ]
  echo "$out" | grep -qE 'hostNetwork:[[:space:]]*true'
  echo "$out" | grep -qE 'kubernetes.io/hostname:[[:space:]]*\$\{TURN_NODE\}'
}

@test "rustdesk: hbbs exposes 21115/tcp and 21116 tcp+udp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21115'
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21116'
  # 21116 must appear for both TCP and UDP
  [ "$(echo "$out" | grep -cE 'containerPort:[[:space:]]*21116')" -ge 2 ]
}

@test "rustdesk: hbbr exposes 21117/tcp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21117'
}

@test "rustdesk: web-client ports 21118/21119 are absent" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  ! echo "$out" | grep -qE '2111[89]'
}

@test "rustdesk: image is digest-pinned" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'image:[[:space:]]*rustdesk/rustdesk-server:[^@]+@sha256:[0-9a-f]{64}'
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats`
Expected: FAIL — `k3d/rustdesk-stack` does not exist yet, so `kustomize build` returns non-zero and every non-skipped assertion is red.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/spec/rustdesk-server.bats
git commit -m "test(rustdesk): add failing kustomize-render contract for hbbs/hbbr"
```

---

### Task 3: Create the `k3d/rustdesk-stack/` manifests (GREEN)

**Files:**
- Create: `k3d/rustdesk-stack/namespace.yaml`
- Create: `k3d/rustdesk-stack/secret.yaml`
- Create: `k3d/rustdesk-stack/hbbs.yaml`
- Create: `k3d/rustdesk-stack/hbbr.yaml`
- Create: `k3d/rustdesk-stack/kustomization.yaml`

**Interfaces:**
- Consumes: `rustdesk-secrets` keys `id_ed25519` / `id_ed25519.pub` (Task 1); `${TURN_NODE}` envsubst variable (supplied by `scripts/env-resolve.sh` inside `fleet:shared-services`, Task 4).
- Produces: two Deployments `hbbs`/`hbbr` in namespace `rustdesk`. Task 4 rolls them out; Task 2's BATS contract turns green.

- [ ] **Step 1: `k3d/rustdesk-stack/namespace.yaml`**

```yaml
# ═══════════════════════════════════════════════════════════════════
# rustdesk namespace — privileged PSA for hostNetwork relay pods
# ═══════════════════════════════════════════════════════════════════
# hbbs + hbbr need hostNetwork + hostPort (raw TCP/UDP that Traefik
# cannot route), which the baseline PSA on the workspace namespace
# forbids. A dedicated privileged namespace keeps the escalation
# surface minimal — same pattern as k3d/coturn-stack/namespace.yaml.
apiVersion: v1
kind: Namespace
metadata:
  name: rustdesk
  labels:
    app.kubernetes.io/part-of: workspace-mvp
    pod-security.kubernetes.io/enforce: privileged
    pod-security.kubernetes.io/warn: privileged
```

- [ ] **Step 2: `k3d/rustdesk-stack/secret.yaml`**

Dev-literal placeholders only. The `managed: "true"` annotation lets the SealedSecret controller adopt this Secret and overwrite it with the real keys from `rustdesk-secrets` (Task 1). The k3d/dev cluster never applies this stack, so the placeholder values are never used by a running hbbs.

```yaml
# ═══════════════════════════════════════════════════════════════════
# rustdesk-secrets — hbbs ed25519 signing keypair (rustdesk ns)
# ═══════════════════════════════════════════════════════════════════
# rustdesk lives in its own privileged namespace and cannot read
# workspace/workspace-secrets. Real values are supplied by the
# SealedSecret environments/sealed-secrets/mentolder.yaml. These dev
# literals let kustomize build offline and let the SealedSecret
# controller adopt the Secret (managed=true) instead of erroring with
# "already exists and is not managed by SealedSecret".
apiVersion: v1
kind: Secret
metadata:
  name: rustdesk-secrets
  namespace: rustdesk
  annotations:
    sealedsecrets.bitnami.com/managed: "true"
type: Opaque
stringData:
  id_ed25519: "dev-placeholder-ed25519-secret-key-not-valid"
  id_ed25519.pub: "dev-placeholder-ed25519-public-key-not-valid"
```

- [ ] **Step 3: `k3d/rustdesk-stack/hbbs.yaml`**

`hbbs` is the ID/rendezvous server. `workingDir: /root` guarantees hbbs reads its key files there; the two keys are mounted read-only via `subPath` so the rest of `/root` (the ephemeral `db_v2.sqlite3` peer cache) stays writable on the container layer. Losing that cache on restart is harmless — peers re-register on their next heartbeat, and the identity-critical state (the keypair) is persisted in the Secret. `strategy: Recreate` avoids two pods contending for the same `hostPort` during a rollout.

```yaml
# ═══════════════════════════════════════════════════════════════════
# hbbs — RustDesk ID / rendezvous server
# ═══════════════════════════════════════════════════════════════════
# hostNetwork on a single public node so native clients reach it
# directly. ${TURN_NODE} == the coturn/Janus node (no port collision
# with 3478/5349/49152-49252/20000-20200). Signing keypair mounted
# from rustdesk-secrets so client IDs survive restarts.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hbbs
  namespace: rustdesk
  labels:
    app: hbbs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hbbs
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: hbbs
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        kubernetes.io/hostname: ${TURN_NODE}
      containers:
        - name: hbbs
          image: rustdesk/rustdesk-server:1.1.15@sha256:10818ec05b179039c6660f4d8e74b303f0db2858bbad2b18e24992ea22d54cd6
          imagePullPolicy: IfNotPresent
          command: ["hbbs"]
          workingDir: /root
          ports:
            - containerPort: 21115
              hostPort: 21115
              protocol: TCP
            - containerPort: 21116
              hostPort: 21116
              protocol: TCP
            - containerPort: 21116
              hostPort: 21116
              protocol: UDP
          volumeMounts:
            - name: keys
              mountPath: /root/id_ed25519
              subPath: id_ed25519
              readOnly: true
            - name: keys
              mountPath: /root/id_ed25519.pub
              subPath: id_ed25519.pub
              readOnly: true
          resources:
            requests:
              memory: 32Mi
              cpu: "50m"
            limits:
              memory: 128Mi
              cpu: "200m"
      volumes:
        - name: keys
          secret:
            secretName: rustdesk-secrets
```

- [ ] **Step 4: `k3d/rustdesk-stack/hbbr.yaml`**

`hbbr` is the relay server. It signs nothing, so it needs no keypair mount — only the 21117/tcp relay port.

```yaml
# ═══════════════════════════════════════════════════════════════════
# hbbr — RustDesk relay server
# ═══════════════════════════════════════════════════════════════════
# Same host-network/node-pin as hbbs. Carries the actual session bytes
# only when direct P2P fails (e.g. symmetric NAT). No signing key.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hbbr
  namespace: rustdesk
  labels:
    app: hbbr
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hbbr
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: hbbr
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        kubernetes.io/hostname: ${TURN_NODE}
      containers:
        - name: hbbr
          image: rustdesk/rustdesk-server:1.1.15@sha256:10818ec05b179039c6660f4d8e74b303f0db2858bbad2b18e24992ea22d54cd6
          imagePullPolicy: IfNotPresent
          command: ["hbbr"]
          workingDir: /root
          ports:
            - containerPort: 21117
              hostPort: 21117
              protocol: TCP
          resources:
            requests:
              memory: 32Mi
              cpu: "50m"
            limits:
              memory: 128Mi
              cpu: "200m"
```

- [ ] **Step 5: `k3d/rustdesk-stack/kustomization.yaml`** (S4 orphan-guard — every manifest referenced)

```yaml
# ═══════════════════════════════════════════════════════════════════
# rustdesk-stack — hbbs/hbbr relay in a dedicated privileged ns
# ═══════════════════════════════════════════════════════════════════
# Applied by `task fleet:shared-services` (once, for both brands).
# Pinned to a single public node via the ${TURN_NODE} envsubst var.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - secret.yaml
  - hbbs.yaml
  - hbbr.yaml
```

- [ ] **Step 6: Run the test to verify it now passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats`
Expected: PASS — all seven tests green (the build succeeds and every assertion holds).

- [ ] **Step 7: Structural manifest validation**

```bash
kustomize build k3d/rustdesk-stack >/dev/null && echo "render OK"
```

Expected: `render OK` (no broken references; ports/hostNetwork present as asserted).

- [ ] **Step 8: Commit**

```bash
git add k3d/rustdesk-stack/
git commit -m "feat(rustdesk): add hbbs/hbbr hostNetwork stack in privileged ns"
```

---

### Task 4: Wire the stack into `fleet:shared-services`

**Files:**
- Modify: `Taskfile.yml` (task `fleet:shared-services`, immediately after the coturn/Janus rollout block)

**Interfaces:**
- Consumes: `TURN_NODE` (already `export`ed earlier in the task from `scripts/env-resolve.sh fleet-mentolder`); the manifests from Task 3.
- Produces: an idempotent apply of `k3d/rustdesk-stack` on context `fleet` plus a rollout wait for both Deployments.

- [ ] **Step 1: Append the RustDesk block after the Janus rollout line**

The existing coturn block ends with the two `rollout status` lines for `coturn` and `janus`. Add the block below directly after them. Only `${TURN_NODE}` needs substitution, so the `envsubst` allowlist is a single variable — nothing else in the manifests is touched (the image digest and secret literals contain no `${…}`).

```yaml
        kubectl --context fleet rollout status deploy/coturn -n coturn --timeout=180s
        kubectl --context fleet rollout status deploy/janus  -n coturn --timeout=180s
        # --- RustDesk relay (shared, dual-brand) ---
        # Same public node as coturn/Janus (${TURN_NODE}); raw TCP/UDP,
        # so it bypasses Traefik via hostNetwork. Only ${TURN_NODE} is
        # substituted — the image digest + secret literals have no vars.
        kustomize build k3d/rustdesk-stack \
          | envsubst '$TURN_NODE' \
          | kubectl --context fleet apply -f -
        kubectl --context fleet rollout status deploy/hbbs -n rustdesk --timeout=180s
        kubectl --context fleet rollout status deploy/hbbr -n rustdesk --timeout=180s
```

- [ ] **Step 2: Dry-run the Taskfile to catch syntax errors**

```bash
task --dry fleet:shared-services >/dev/null && echo "taskfile parses"
```

Expected: `taskfile parses` (no YAML/template error).

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(rustdesk): deploy rustdesk-stack from fleet:shared-services"
```

---

### Task 5: Add firewall rules to the cloud-init sources

**Files:**
- Modify: `prod/cloud-init.yaml`
- Modify: `scripts/hetzner/cloud-init.yaml.tmpl`
- Modify: `scripts/hetzner/cloud-init-server.yaml.tmpl`

**Interfaces:**
- Consumes: nothing (static port rules).
- Produces: RustDesk `ufw allow` rules that future node bootstraps inherit automatically (Task 6 covers the already-running node, which cloud-init does not re-touch).

- [ ] **Step 1: `prod/cloud-init.yaml` — add after the Janus line (trailing-`#` comment style)**

Insert directly after `- ufw allow 20000:20200/udp  # Janus SFU RTP media …`:

```yaml
  - ufw allow 21115/tcp     # RustDesk hbbs NAT-type test
  - ufw allow 21116/tcp     # RustDesk hbbs ID registration / TCP hole punching
  - ufw allow 21116/udp     # RustDesk hbbs ID registration / heartbeat (UDP)
  - ufw allow 21117/tcp     # RustDesk hbbr relay
```

- [ ] **Step 2: `scripts/hetzner/cloud-init.yaml.tmpl` — add before `- ufw --force enable` (`comment '…'` style)**

```yaml
  - ufw allow 21115/tcp comment 'RustDesk hbbs NAT test'
  - ufw allow 21116/tcp comment 'RustDesk hbbs ID/punch (TCP)'
  - ufw allow 21116/udp comment 'RustDesk hbbs ID/heartbeat (UDP)'
  - ufw allow 21117/tcp comment 'RustDesk hbbr relay'
```

- [ ] **Step 3: `scripts/hetzner/cloud-init-server.yaml.tmpl` — add the same four `comment`-style lines before `- ufw --force enable`**

```yaml
  - ufw allow 21115/tcp comment 'RustDesk hbbs NAT test'
  - ufw allow 21116/tcp comment 'RustDesk hbbs ID/punch (TCP)'
  - ufw allow 21116/udp comment 'RustDesk hbbs ID/heartbeat (UDP)'
  - ufw allow 21117/tcp comment 'RustDesk hbbr relay'
```

- [ ] **Step 4: Verify all three files parse as YAML and carry the four ports**

```bash
for f in prod/cloud-init.yaml scripts/hetzner/cloud-init.yaml.tmpl scripts/hetzner/cloud-init-server.yaml.tmpl; do
  python3 -c "import yaml,sys; yaml.safe_load(open('$f'))" && \
  n=$(grep -cE '2111[567]' "$f"); echo "$f: yaml OK, $n rustdesk rules"
done
```

Expected: each file prints `yaml OK` with `4 rustdesk rules`. (The `.tmpl` files contain `${WG_LISTEN_PORT}` which `yaml.safe_load` accepts as a plain string, so parsing succeeds.)

- [ ] **Step 5: Commit**

```bash
git add prod/cloud-init.yaml scripts/hetzner/cloud-init.yaml.tmpl scripts/hetzner/cloud-init-server.yaml.tmpl
git commit -m "feat(rustdesk): open hbbs/hbbr ports in cloud-init firewall templates"
```

---

### Task 6: Operational rollout — MANUAL runbook (post-merge)

Run this task only **after** the PR has merged and Task 7's gates were green. Two of its steps are **not automatable** (no kustomize/kubectl/Taskfile artifact) and must be performed by the operator; they are called out explicitly below.

**Files:** none (operational).

**Interfaces:**
- Consumes: the merged sealed secret + manifests + `fleet:shared-services` wiring; `${TURN_PUBLIC_IP}` = `204.168.244.104`.
- Produces: a live, reachable relay verified end-to-end.

- [ ] **Step 1: Apply the sealed secret to the fleet cluster**

The `rustdesk` namespace must exist before its namespace-scoped SealedSecret can apply. Create the namespace first, then apply the regenerated sealed file (the controller decrypts `rustdesk-secrets` into the namespace).

```bash
kubectl --context fleet apply -f k3d/rustdesk-stack/namespace.yaml
task secrets:sync   # applies environments/sealed-secrets/{mentolder,korczewski}.yaml to fleet
kubectl --context fleet get secret rustdesk-secrets -n rustdesk -o jsonpath='{.data.id_ed25519\.pub}' | head -c 12; echo
```

Expected: the base64 head of the real public key prints (not the dev placeholder).

- [ ] **Step 2: Deploy the workloads**

```bash
task fleet:shared-services
kubectl --context fleet get pods -n rustdesk -o wide
```

Expected: `hbbs` and `hbbr` pods `Running` on `pk-hetzner-4`.

- [ ] **Step 3: MANUAL — not automatable — open the ports on the running node**

`cloud-init` only runs at first bootstrap and is never re-applied to a live node, so the four rules from Task 5 must be added by hand over SSH to `pk-hetzner-4`. This is a real operator action with no repo artifact.

```bash
ssh root@204.168.244.104 '
  ufw allow 21115/tcp comment "RustDesk hbbs NAT test" &&
  ufw allow 21116/tcp comment "RustDesk hbbs ID/punch (TCP)" &&
  ufw allow 21116/udp comment "RustDesk hbbs ID/heartbeat (UDP)" &&
  ufw allow 21117/tcp comment "RustDesk hbbr relay" &&
  ufw reload && ufw status | grep -E "2111[567]"
'
```

Expected: `ufw status` lists all four RustDesk rules as `ALLOW`.

- [ ] **Step 4: MANUAL — not automatable — create the DNS A-record**

No DDNS updater runs for this stack (all Fleet IPs are static), so the record is created by hand at the DNS provider. Create an `A` record `rustdesk.mentolder.de` → `204.168.244.104` (the `${TURN_PUBLIC_IP}` of `pk-hetzner-4`). One canonical host under the mentolder domain serves both brands.

```bash
# Verify after the record has propagated:
dig +short rustdesk.mentolder.de
```

Expected: `204.168.244.104`.

- [ ] **Step 5: End-to-end connection verification**

Using the native RustDesk client on Patrick's and gekko's devices, set the ID server to `rustdesk.mentolder.de` and the key to the public key from Task 1, then:

- Confirm a direct P2P session establishes between two devices (validates hbbs rendezvous).
- Force a relay fallback (e.g. put one device behind symmetric NAT such as a mobile hotspot) and confirm the session still connects via hbbr (validates the 21117 relay path).

```bash
kubectl --context fleet logs -n rustdesk deploy/hbbs --tail=20
kubectl --context fleet logs -n rustdesk deploy/hbbr --tail=20
```

Expected: hbbs logs show ID registrations; hbbr logs show a relayed session during the forced-relay test.

---

### Task 7: Branch verification — mandatory CI gates (FINAL)

Run these **before opening the PR** (on the `feature/rustdesk-server` branch). This is the last task by convention because it carries the required gate commands; temporally it precedes Task 6's post-merge rollout.

**Files:** none (verification + regenerated artifacts).

- [ ] **Step 1: Re-run the RustDesk contract test explicitly**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
```

Expected: PASS — all seven tests green.

- [ ] **Step 2: Run the mandatory gate commands**

```bash
task test:changed          # vitest --changed + domain BATS (k8s manifests, scripts) + quality gate
task freshness:regenerate  # refresh generated artifacts (openspec-status.json, test-inventory, repo-index)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Expected: all three exit `0`. `freshness:check` confirms S4 (the four `k3d/rustdesk-stack/*.yaml` are all referenced by `kustomization.yaml`) and that the S1 baseline key-count did not grow.

- [ ] **Step 3: Validate the OpenSpec change tree**

```bash
task test:openspec
```

Expected: PASS — the `openspec/changes/rustdesk-server/` artifacts (this `tasks.md`, `proposal.md`, `design.md`, `specs/rustdesk-server.md`) are format-conformant.

- [ ] **Step 4: Commit any regenerated artifacts**

```bash
git add -A
git commit -m "chore(rustdesk): regenerate freshness artifacts" || echo "nothing to regenerate"
```
