# infra-ops Runbooks — §1 Cluster Deployment · §2 Workspace Deploy · §3 Host Node Networking

Ausformulierte Phasen zu den Sektionen 1–3 von [`../SKILL.md`](../SKILL.md). Die verbindlichen
Reihenfolge-Guards stehen dort im Body, nicht hier — diese Datei enthält die Befehlsfolgen.

---

## §1 — Cluster Deployment

### Phase 0 — Version Discovery & Pinning

```bash
bash scripts/discover-versions.sh
# Bei Bedarf updaten:
bash scripts/discover-versions.sh --update --commit
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
export K3S_VERSION="${k3s}"
```

### Phase 1 — Environment Initialization

**Step 1.0: Hetzner Nodes** — Vollständige Befehle in
[`hetzner-provisioning-cluster.md`](hetzner-provisioning-cluster.md).
**Step 1.0b: Proxmox Nodes** — [`proxmox-provisioning.md`](proxmox-provisioning.md).

```bash
# Step 1.1: Environment-Config anlegen
task env:init ENV=<env>
$EDITOR environments/<env>.yaml
task env:validate ENV=<env>

# Step 1.2: Sealed Secrets + Certs
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system --version "${sealed_secrets_chart}"
task sealed-secrets:status ENV=<env>
task env:fetch-cert ENV=<env>

# Step 1.3: Secrets generieren & versiegeln
task env:generate ENV=<env>
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml && git commit -m "chore: sealed secrets for <env>"

# Step 1.4: cert-manager
helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --version "${cert_manager}" --set crds.enabled=true
task cert:secret -- <ipv64-api-key> ENV=<env>

# Step 1.4b: Longhorn
helm install longhorn longhorn/longhorn -n longhorn-system --create-namespace --version "${longhorn_chart}"
kubectl patch storageclass longhorn -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# Step 1.5: Full-Service Deploy
task workspace:setup ENV=<env>
task workspace:coturn:deploy ENV=<env>
task website:deploy ENV=<env>
task workspace:admin-users-setup ENV=<env>
task workspace:vaultwarden:seed ENV=<env>
task workspace:check-connectivity ENV=<env>
```

### Phase 2 — Cluster Diagnosis (Existing Cluster)

```bash
# Prerequisites
for tool in docker kubectl task k3d git kubeseal helm; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done

# Version drift
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
helm list -A -o json | jq -r '.[] | select(.name | test("sealed-secrets|cert-manager|longhorn")) | "  \(.name): \(.chart)"'

# Namespace & Pod Status
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get deploy
task workspace:check-connectivity ENV=<env>
```

### Phase 5 — Cross-Brand Fleet Operations

```bash
task feature:deploy        # workspace:deploy + post-setup BOTH brands
task feature:website       # Rebuild + rollout BOTH brands
task workspace:verify:all-prods
task clusters:status

# Per-brand deploy
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Merged PR nicht live | Push-based, kein GitOps: `task workspace:deploy ENV=<env>` |
| SealedSecret: adoption refused | `kubectl delete secret <name> -n <ns>` |
| Longhorn PVC Pending | `kubectl get storageclass longhorn`; iscsid auf allen Nodes? |
| `office.` 404 | `task workspace:office:deploy ENV=<env>` |

---

## §2 — Workspace Deploy

### Phase 1 — Umbrella: `workspace:setup`

```bash
task workspace:setup ENV=<env>
# Ruft auf: workspace:deploy → office:deploy → mcp:deploy →
#           post-setup → talk-setup → recording-setup → transcriber-setup

# Prod-only stacks danach:
task workspace:coturn:deploy ENV=<env>
task website:deploy ENV=<env>

# Optional one-time:
task workspace:admin-users-setup ENV=<env>
task workspace:vaultwarden:seed ENV=<env>
```

### Phase 2 — `workspace:post-setup`

Aktiviert Nextcloud-Apps, OIDC-Provider, Talk-HPB-Settings, Gruppen-Folder.

```bash
task workspace:post-setup ENV=<env>
```

| Symptom | Fix |
|---------|-----|
| `user_oidc` not configured | `task workspace:post-setup ENV=<env>` nochmal |
| OIDC login loop | Seed-Job neu ausführen (§4 Phase 3), dann post-setup |

### Phase 3 — `workspace:talk-setup`

Konfiguriert Talk-HPB-Signaling und CoTURN-Credentials.

```bash
task workspace:talk-setup ENV=<env>
```

### Phase 4 — `workspace:recording-setup`

```bash
task workspace:recording-setup ENV=<env>
```

### Phase 5 — `workspace:transcriber-setup`

```bash
task workspace:transcriber-setup ENV=<env>
```

### Phase 6 — Optional Provisioning

```bash
task workspace:admin-users-setup ENV=<env>    # ⚠️ T002171: Skript nutzt noch KC_*-Variablen (Keycloak) — kann so nicht funktionieren
task workspace:vaultwarden:seed ENV=<env>      # Secret-Templates
task workspace:vaultwarden:seed-logs ENV=<env> # Logs prüfen
```

### Service Inventory

| Service | Ingress | Deployed by |
|---------|---------|-------------|
| Pocket ID | `auth.<domain>` | `workspace:deploy` |
| Nextcloud | `files.<domain>` | `workspace:deploy` |
| Vaultwarden | `vault.<domain>` | `workspace:deploy` |
| DocuSeal | `sign.<domain>` | `workspace:deploy` |
| Collabora | `office.<domain>` | `workspace:office:deploy` |
| CoTURN | UDP TURN/STUN | `workspace:coturn:deploy` (prod only) |
| Website | `web.<domain>` | `website:deploy` |

---

## §3 — Host Node Networking

### Network Architecture

```
[ Fleet Cluster: pk-hetzner-4/6/8 (CP) + gekko-hetzner-2/3/4 (Worker) ]
                      │  WireGuard overlay (wg-fleet)
                      ▼
[ WSL Host / OpenClaw ] ◄──► [ GPU Worker — 10.10.0.3 ]
```

Hetzner-Provisioning-Details: [`hetzner-provisioning-network.md`](hetzner-provisioning-network.md)
OpenClaw-Setup: [`wsl-openclaw.md`](wsl-openclaw.md)

### Phase 2 — UFW Firewall Ports

| Protocol | Ports | Purpose |
|----------|-------|---------|
| TCP | 22 | SSH |
| TCP | 80/443 | Ingress |
| TCP | 6443 | k8s API |
| UDP | 51820 | WireGuard |
| TCP/UDP | 3478, 5349 | CoTURN |
| UDP | 49152-49252 | CoTURN relay |

LiveKit-Ports (7880/7881/50000-60000/30000-40000) wurden mit T002184 entfernt.

```bash
ssh patrick@<node-ip> "sudo ufw allow <port>/<proto> && sudo ufw reload"
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| WireGuard Handshake fehlt | Public-Key-Mismatch — `echo <PRIV_KEY> \| wg pubkey` |
| Pod-to-Pod fails trotz Node Ready | UFW blockiert Flannel — UDP 8472 + 51820 freigeben |
| OpenClaw 503 | Ollama auf `10.10.0.3` prüfen; WireGuard-Tunnel aktiv? |
