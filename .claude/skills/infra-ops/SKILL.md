---
name: infra-ops
description: Explicit-invoke-only infrastructure runbook. DO NOT auto-trigger. Use when the user asks about: cluster setup or reset, workspace deploy, host node networking (Hetzner/WireGuard/UFW/LiveKit), Keycloak/SSO/OIDC realm sync, LLM pipeline and GPU host, secret/SealedSecret rotation, or database migrations and backup/restore.
agent: bachelorprojekt-infra
---

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

# infra-ops — Unified Infrastructure Runbook

Sieben frühere Einzel-Skills sind hier konsolidiert. Nur bei explizitem Bedarf aufrufen — kein Auto-Trigger.

## Schnell-Routing

| Ziel | Abschnitt |
|------|-----------|
| Neuen Cluster aufsetzen / Environment deployen | [§1 Cluster Deployment](#1--cluster-deployment) |
| Workspace-Platform deployen (alle Services) | [§2 Workspace Deploy](#2--workspace-deploy) |
| Host-Netzwerk, WireGuard, UFW, LiveKit, OpenClaw | [§3 Host Node Networking](#3--host-node-networking) |
| Keycloak / SSO / OIDC Realm konfigurieren | [§4 Keycloak Realm Sync](#4--keycloak-realm-sync) |
| LLM-Pipeline / GPU-Host / Embeddings | [§5 LLM Ops](#5--llm-ops) |
| Secrets rotieren / SealedSecrets | [§6 Secret Rotation](#6--secret-rotation) |
| DB-Migrationen / Backup / Restore | [§7 Database Ops](#7--database-ops) |

---

## §1 — Cluster Deployment

Neues Environment aufsetzen, Fresh-Cluster-Bringup, Gap-Analyse, Cross-Brand-Fleet-Operationen.

### ⚠️ Mandatory Ordering for Fresh Clusters

0. **Phase 0: Version Discovery** — vor jedem Install-Schritt.
1. Hetzner-Nodes provisionen (Step 1.0) oder Proxmox (Step 1.0b).
2. **Sealed Secrets controller** muss vor jedem SealedSecret existieren.
3. **Sealing Certificate** (`env:fetch-cert`) — nach Cluster-Reset.
4. **Seal secrets** (`env:seal`) — nach Cert-Fetch.
5. **cert-manager** (`cert:install`) — vor `workspace:deploy`.
6. **DNS API Secret** (`cert:secret`) — in beiden Namespaces vor dem Deploy.
7. **Longhorn** — vor `workspace:deploy`.
8. **CoreDNS scale** — nach Longhorn, vor `workspace:deploy`. ⚠️ k3s re-applies on restart — nach jedem k3s-Upgrade `task coredns:scale` neu ausführen.
9. **Alle Services deployen** — `workspace:deploy` deckt nur die Base-Kustomization; Collabora, CoTURN, Website, Arena brauchen eigene Deploy-Tasks.
10. **Ingress Accessibility Verification** — `task workspace:check-connectivity ENV=<env>`.

### Phase 0 — Version Discovery & Pinning

```bash
bash scripts/discover-versions.sh
# Bei Bedarf updaten:
bash scripts/discover-versions.sh --update --commit
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
export K3S_VERSION="${k3s}"
```

### Phase 1 — Environment Initialization

**Step 1.0: Hetzner Nodes** — Vollständige Befehle in [`references/hetzner-provisioning-cluster.md`](references/hetzner-provisioning-cluster.md).

**Step 1.0b: Proxmox Nodes** — [`references/proxmox-provisioning.md`](references/proxmox-provisioning.md).

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
| LiveKit ICE fails ~66% | `task livekit:dns-pin ENV=<env> APPLY=true` |

---

## §2 — Workspace Deploy

Detaillierter Sub-Step-Guide für `workspace:setup` und optionale Provisioning-Tasks.

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
| OIDC login loop | `task keycloak:sync ENV=<env>` dann post-setup |

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
task workspace:admin-users-setup ENV=<env>    # SSO-Admin-User in Keycloak
task workspace:vaultwarden:seed ENV=<env>      # Secret-Templates
task workspace:vaultwarden:seed-logs ENV=<env> # Logs prüfen
```

### Service Inventory

| Service | Ingress | Deployed by |
|---------|---------|-------------|
| Keycloak | `auth.<domain>` | `workspace:deploy` |
| Nextcloud | `files.<domain>` | `workspace:deploy` |
| Vaultwarden | `vault.<domain>` | `workspace:deploy` |
| DocuSeal | `sign.<domain>` | `workspace:deploy` |
| LiveKit | `livekit.`, `stream.<domain>` | `workspace:deploy` |
| Collabora | `office.<domain>` | `workspace:office:deploy` |
| CoTURN | UDP TURN/STUN | `workspace:coturn:deploy` (prod only) |
| Website | `web.<domain>` | `website:deploy` |

---

## §3 — Host Node Networking

Hetzner-Provisioning, WireGuard-Mesh, UFW-Firewall, LiveKit-WebRTC, OpenClaw.

### Network Architecture

```
[ Fleet Cluster: pk-hetzner-4/6/8 (CP) + gekko-hetzner-2/3/4 (Worker) ]
                      │  WireGuard overlay (wg-fleet)
                      ▼
[ WSL Host / OpenClaw ] ◄──► [ GPU Worker — 10.10.0.3 ]
```

Hetzner-Provisioning-Details: [`references/hetzner-provisioning-network.md`](references/hetzner-provisioning-network.md)
OpenClaw-Setup: [`references/wsl-openclaw.md`](references/wsl-openclaw.md)

### Phase 2 — UFW Firewall Ports

| Protocol | Ports | Purpose |
|----------|-------|---------|
| TCP | 22 | SSH |
| TCP | 80/443 | Ingress |
| TCP | 6443 | k8s API |
| UDP | 51820 | WireGuard |
| TCP/UDP | 3478, 5349 | CoTURN |
| UDP | 49152-49252 | CoTURN relay |
| TCP | 7880 | LiveKit signaling |
| TCP | 7881 | LiveKit RTC fallback |
| UDP | 50000-60000 | LiveKit RTC |
| UDP | 30000-40000 | LiveKit Ingress/Egress |

```bash
ssh patrick@<node-ip> "sudo ufw allow <port>/<proto> && sudo ufw reload"
```

### Phase 3 — LiveKit WebRTC

```bash
# Node-Pin prüfen
kubectl get nodes --context fleet --show-labels | grep pk-hetzner-4
# Pin-Label setzen falls fehlend:
kubectl label node pk-hetzner-4 livekit-pin-node=true --context fleet

# DNS-Pin prüfen
dig livekit.mentolder.de +short
# Falls falsch:
task livekit:dns-pin ENV=mentolder APPLY=true
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| WireGuard Handshake fehlt | Public-Key-Mismatch — `echo <PRIV_KEY> | wg pubkey` |
| Pod-to-Pod fails trotz Node Ready | UFW blockiert Flannel — UDP 8472 + 51820 freigeben |
| LiveKit ICE fails / Audio muted | DNS nicht auf pin-node; Chrome braucht User-Gesture |
| OpenClaw 503 | Ollama auf `10.10.0.3` prüfen; WireGuard-Tunnel aktiv? |

---

## §4 — Keycloak Realm Sync

Keycloak-Realm aus JSON reconcilen — OIDC-Clients, Gruppen, Mapper, SSO-Login-Fehler.

### Realm JSON Locations

| Env | File | Quelle |
|-----|------|--------|
| dev | `k3d/realm-workspace-dev.json` | ConfigMap `realm-template` |
| prod base | `prod/realm-workspace-prod.json` | **Live SoT** — Pocket-ID OIDC via `pocket-id-client-seed` Job |
| mentolder | `prod-mentolder/realm-workspace-mentolder.json` | `register-oidc-client.mjs` only |
| korczewski | `prod-korczewski/realm-workspace-korczewski.json` | `register-oidc-client.mjs` only |

> **Nie** Realm-State direkt im Keycloak-Admin-UI ändern ohne das JSON zu updaten — Sync überschreibt UI-Änderungen.

### Phases

> **Status-Reads MCP-first:** Pod-Status/Logs bevorzugt über `mcp__mcp-kubernetes__pods_list_in_namespace({ namespace: "workspace" })` / `mcp__mcp-kubernetes__pods_log({ namespace: "workspace", name: "<keycloak-pod>" })` (read-only); die `task workspace:status`/`logs`-Aufrufe unten sind der Fallback. Mutations (`task secrets:sync`, `register-oidc-client.mjs`, deploys) bleiben unverändert.

```bash
# Phase 1: Pre-sync check (Fallback — siehe MCP-first oben)
task workspace:status ENV=<env>  # keycloak pod: 1/1 Running?
task workspace:logs ENV=<env> -- keycloak

# Phase 2: Realm-JSON editieren (falls nötig)
# Dann validieren:
python3 -c "import json; json.load(open('prod/realm-workspace-prod.json'))" && echo "valid"

# Phase 3: OIDC-Client-Seed (Pocket-ID)
# Der pocket-id-client-seed Job wird beim workspace:deploy ausgeführt.
# Manuelles Neustarten bei Änderungen an den OIDC-Client-Konfigurationen:
kubectl --context fleet -n workspace delete job pocket-id-client-seed --ignore-not-found=true
kubectl --context fleet -n workspace-korczewski delete job pocket-id-client-seed --ignore-not-found=true

# Phase 4: OIDC Clients verifizieren (Pocket-ID Admin UI):
# id.<domain>/admin → Applications → redirect URIs prüfen

# Phase 5: SSO-Flow testen (Browser, Inkognito)
```

### Troubleshooting

| Error | Fix |
|-------|-----|
| `401 Unauthorized` | Admin-Credentials prüfen, Keycloak warten |
| `409 Conflict` | Client existiert bereits — Script auf update prüfen |
| Website login loop | `webOrigins` in `website`-Client prüfen |
| Nextcloud OIDC error | Client-Secret re-seal + redeploy; `secret-rotation` Skill |
| "Invalid client secret" | `secret-rotation` Skill — Secrets neu alignen |

---

## §5 — LLM Ops

LLM-Pipeline über alle drei GPU-Host-Kontexte.

| Kontext | GPU Host IP | Services | Task-Prefix |
|---------|-------------|----------|-------------|
| WSL local dev | `10.10.0.3` | Ollama, LM Studio | `task openclaw:*` |
| Dev k3d | `172.17.0.1` | TEI embed, LM Studio | `task llm:* ENV=dev` |
| Prod fleet | `192.168.100.10` | TEI embed, LM Studio, ComfyUI, Rigger | `task llm:* ENV=mentolder\|korczewski` |

> **Kein in-cluster LiteLLM-Router** (seit PR #895). Apps rufen Gateway-Services direkt:
> `llm-gateway-embed` → TEI bge-m3 (`:8081`); `llm-gateway-lmstudio` → LM Studio (`:1234`).

### Phase 1 — GPU Host Bootstrap

```bash
bash scripts/llm-host-setup.sh
task llm:pull-models HOST=<wg-mesh-ip>
```

### Phase 2 — Deploy

```bash
task llm:deploy ENV=<env>
```

Benötigt in `environments/<env>.yaml`: `LLM_HOST_IP`, `LLM_ENABLED=true`, `LLM_RERANK_ENABLED=false`.

### Phase 3 — Status

```bash
task llm:status ENV=<env>
kubectl --context fleet -n <ns> get endpoints llm-gateway-embed llm-gateway-lmstudio
```

### Phase 4 — Test

```bash
task llm:test ENV=<env>
```

### Phase 5 — Logs

```bash
ssh <GPU_HOST> "docker logs tei-embed --tail 200"
kubectl --context fleet -n <ns> get events --field-selector involvedObject.name=llm-gateway-embed
```

### Phase 6 — Model Management

```bash
task llm:pull-models HOST=<wg-mesh-ip>
ssh <GPU_HOST> "ollama list && ollama pull qwen2.5:14b-instruct-q4_K_M"
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Gateway Endpoints leer | `LLM_HOST_IP` in `environments/<env>.yaml` prüfen |
| `/v1/embeddings` 503 | `ssh <GPU_HOST> docker ps` — tei-embed running? `nvidia-smi` |
| `/v1/chat` 401/timeout | LM Studio UI prüfen; `LLM_ROUTER_API_KEY` in website-secrets |
| ComfyUI unreachable | `COMFY_PORT` darf NICHT 8188 sein (Janus-Konflikt) |
| GPU OOM | `nvidia-smi`; Modell verkleinern oder TEI neu starten |

---

## §6 — Secret Rotation

Sichere, geordnete Secret-Rotation auf beiden Brands.

### Scope — Typ wählen

| Typ | Wann |
|-----|------|
| **A. DB-Password-Drift** | Service kann nach Re-seal nicht mehr auf shared-db connecten |
| **B. Neu generieren + versiegeln** | Erste Einrichtung, periodische Rotation, veraltete `.secrets/` |
| **C. SealedSecrets-Keypair** | Nach Cluster-Reset — alte sealed files nicht mehr entschlüsselbar |
| **D. Claude Code Token** | Auth-Proxy oder Agent-Token cycling |
| **E. Einzelner Service** | Individual credential geändert |

### ⚠️ Critical Ordering

```
sealed-secrets:install → env:fetch-cert → env:generate → env:seal → workspace:deploy
```

**Nie `workspace:deploy` vor `env:seal`** — überschreibt Production-Credentials mit Dev-Placeholdern.

### Typ A — DB-Password-Drift

```bash
# Was ist im SealedSecret?
kubectl get secret workspace-secrets -n <NS> --context <CTX> \
  -o jsonpath='{.data.<KEY>}' | base64 -d
# DB-Rolle auf SealedSecret-Passwort bringen:
task workspace:sync-db-passwords ENV=mentolder
task workspace:sync-db-passwords ENV=korczewski
```

### Typ B — Neu generieren + versiegeln

```bash
task env:generate ENV=<env>
task env:seal ENV=<env>
task secrets:sync
task workspace:restart ENV=<env> -- <service>
git add environments/sealed-secrets/<env>.yaml
git commit -m "chore(secrets): rotate <env> secrets"
```

### Typ C — Keypair Refresh (nach Cluster-Reset)

```bash
task sealed-secrets:install ENV=<env>
task env:fetch-cert ENV=<env>
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml environments/certs/<env>.pem
git commit -m "chore(secrets): re-seal <env> after keypair reset"
task workspace:deploy ENV=<env>
```

### Typ D — Claude Code Token

```bash
task claude-code:rotate-tokens
task mcp:status
```

### Cross-Brand Checklist

```bash
task env:fetch-cert ENV=mentolder && task env:fetch-cert ENV=korczewski
task env:seal ENV=mentolder && task env:seal ENV=korczewski
task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski
```

### Verification

Status-Reads — **MCP-first** (`mcp-kubernetes`, read-only):

> `mcp__mcp-kubernetes__pods_list_in_namespace({ namespace: "workspace" })` — alle Pods 1/1 Running?
> `mcp__mcp-kubernetes__pods_log({ namespace: "workspace", name: "<keycloak|nextcloud|website>-pod" })`

Fallback (mcp-kubernetes nicht erreichbar):

```bash
task workspace:status ENV=<env>
task workspace:logs ENV=<env> -- keycloak
task workspace:logs ENV=<env> -- nextcloud
task workspace:logs ENV=<env> -- website
```

### Troubleshooting (`task secrets:sync`)

| Symptom | Fix |
|---------|-----|
| `secrets/xxx not found` | Controller-Logs prüfen; `kubectl get sealedsecret -n <ns>` |
| `adoption refused` | `kubectl delete secret <name> -n <ns>` |
| Decryption fails | `task env:fetch-cert ENV=<env>` → `task env:seal` → `secrets:sync` |

---

## §7 — Database Ops

Schema-Migrationen, Backup/Restore-Audits, Permissions auf beiden Brands.

### ⚠️ Zwei unabhängige shared-db Instanzen

`workspace` (mentolder) und `workspace-korczewski` (korczewski) — Migrations und Backup-Audits immer auf **beiden** ausführen.

### Phase 1 — Schema Migration

```bash
# Step 1.1: SQL in scripts/datamodel/ erstellen
# BEGIN; CREATE TABLE IF NOT EXISTS ...; COMMIT;

# Step 1.2: Dev-Test
task workspace:psql ENV=dev -- website < scripts/datamodel/<migration>.sql

# Step 1.3: Production (als postgres-Superuser bei DDL-Ownership-Konflikten)
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace --context fleet -- psql -U postgres -d website < migration.sql
# Dann beide Brands:
task workspace:psql ENV=mentolder -- website < scripts/datamodel/<migration>.sql
task workspace:psql ENV=korczewski -- website < scripts/datamodel/<migration>.sql

# Step 1.4: Permissions re-granieren
task workspace:fix-tickets-grants ENV=mentolder
task workspace:fix-tickets-grants ENV=korczewski

# Step 1.5: ER-Diagram + Commit
task db:diagram
git add scripts/datamodel/<migration>.sql docs/db-schema-diagram.md
git commit -m "chore(db): apply migration for <description>"
```

### Phase 2 — Backup/Restore Audit

```bash
# Backup-Config prüfen
kubectl get cronjob -n <ns> --context <ctx>
kubectl get pvc backup-pvc -n <ns> --context <ctx>
kubectl get secret workspace-secrets -n <ns> --context <ctx> \
  -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d | wc -c

# Live-Backup triggern
bash scripts/backup-restore.sh trigger --context fleet -n workspace
bash scripts/backup-restore.sh trigger --context fleet --namespace workspace-korczewski

# Backup-Liste
bash scripts/backup-restore.sh list --context fleet -n workspace
```

> **Filen 2FA-Invariante:** 2FA muss auf **beiden** Filen-Accounts deaktiviert bleiben.
> Der `filen-upload`-Sidecar sendet keinen TOTP-Code. Bei aktiviertem 2FA: permanenter Login-Fehler.
> Fehler prüfen: `kubectl get jobs -n <ns> --context <ctx> -l app=db-backup`

### Phase 3 — Browsable Recovery (Stage → Browse → Selective Restore)

```bash
# PVC vorbereiten (einmalig)
task recovery:prepare ENV=mentolder
task recovery:prepare ENV=korczewski

# Dump verifizieren (non-destructive)
task recovery:verify ENV=mentolder -- 20260530-020001 website

# DB oder Service-PVC stagen
task recovery:stage ENV=mentolder -- 20260530-020001 website

# Staged Daten browsen
task recovery:browse ENV=mentolder   # gibt URL aus

# Selektives Restore (mit expliziter Bestätigung -y)
task recovery:restore-file ENV=mentolder -- <ts> nextcloud-files admin/files/Doc.pdf -y
task recovery:restore-table ENV=mentolder -- <ts> website site_settings -y

# Staging cleanup
task recovery:unstage ENV=mentolder -- <ts> -y
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Migration fails: "must be owner" | Via `psql -U postgres` im shared-db-Pod direkt |
| Backup CronJob not found | `k3d/backup-cronjob.yaml` anwenden, altes `backup-postgres` CronJob löschen |
| `db-backup` Job Failed, lokale Dumps OK | Filen-Upload-Fehler — 2FA aus? Credentials korrekt? Logs: `filen-upload` Container |

---

## Post-Execution: Mishap Report

Nach Abschluss aller Schritte `mishap-tracker` mit dem akkumulierten `MISHAP_LOG` aufrufen.

## Archivierte Einzel-Skills

Diese Skills sind in `infra-ops` aufgegangen. Ihre Verzeichnisse und Referenz-Dateien bleiben erhalten:
- `.claude/skills/cluster-deployment/` — Hetzner + Proxmox provisioning references
- `.claude/skills/host-node-networking/` — WireGuard + OpenClaw references
- `.claude/skills/keycloak-realm-sync/`
- `.claude/skills/llm-ops/`
- `.claude/skills/secret-rotation/`
- `.claude/skills/workspace-deploy/`
- `.claude/skills/database-ops/`
