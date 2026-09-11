# Hetzner Node Provisioning — Detail

Aus `host-node-networking` Phase 1 extrahiert (Chore T001007). Diese Schritte werden nur bei
**frischem Cluster-Setup** oder **Node-Replacement** ausgeführt — im Normalbetrieb übersprungen.

## Schritt 1.0: hcloud CLI authentifizieren

Der Hetzner-API-Token liegt per-env in `environments/.secrets/<env>.yaml` als `HETZNER_API_KEY`.

```bash
HETZNER_API_KEY=$(grep '^HETZNER_API_KEY' environments/.secrets/<env>.yaml | awk '{print $2}' | tr -d '"')
hcloud context create <env>   # prompts for token — paste $HETZNER_API_KEY
# — or update an existing context:
hcloud context use <env>
```

Verify:
```bash
hcloud context active   # should show <env>
hcloud server list      # should list the env's nodes
```

> **Tip:** `mentolder` und `fleet` als Context-Namen — `hcloud context use <env>` switcht sauber zwischen Clustern. (Der `korczewski` hcloud-Context managt jetzt die Fleet-Cluster-Hosts pk-hetzner-4/6/8.)

## Schritt 1.1: Input Collection

```
Mode?
  [1] New server    — paste cloud-config as User Data when creating in Hetzner
  [2] Reset         — existing server via Rescue Mode reinstall

Role?
  [1] Control-Plane INIT    → prod/cloud-init.yaml
  [2] Control-Plane JOIN    → prod/cloud-init-join-cp.yaml
  [3] Worker / Agent        → prod/cloud-init-worker.yaml

Target env?       mentolder / fleet
Node name?        e.g. gekko-hetzner-5
Node public IP?   e.g. 178.104.x.x
```

Für JOIN und WORKER zusätzlich:
```
Existing CP IP (for server URL):
K3S token (from live CP):
```

K3S-Token vom aktiven Cluster:
```bash
ssh patrick@<CP_IP> "sudo cat /var/lib/rancher/k3s/server/node-token"
```

## Schritt 1.2: WireGuard Mesh Key Management

In `environments/.secrets/<env>.yaml` nach existierendem Private-Key suchen:
```bash
grep "WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY" environments/.secrets/<env>.yaml 2>/dev/null
```

- **Recovery:** Key reuse → Public-Key ableiten zum Verify: `echo "<PRIVATE_KEY>" | wg pubkey`
- **First-time:** Neuen Keypair generieren:
  ```bash
  # Preferred (needs wireguard-tools):
  WG_PRIVATE=$(wg genkey)
  WG_PUBLIC=$(echo "$WG_PRIVATE" | wg pubkey)
  ```
  In `.secrets/<env>.yaml` speichern und re-sealen via `task env:seal ENV=<env>`. Public-Key und Mesh-IP in `wireguard/wg-mesh-nodes.yaml` eintragen.

## Schritt 1.3: Config / Setup Script generieren

WireGuard-Peer-Block für jeden anderen Mesh-Node bauen:
```
[Peer]
# <node_name>
PublicKey = <public_key>
Endpoint = <endpoint>          # omit line if endpoint is ""
AllowedIPs = <wg_ip>/32
PersistentKeepalive = 25
```

- **New Server:** Peer-Blöcke + Key-Replacements in `prod/cloud-init.yaml` Templates einsetzen (6-space indent). Nach `/tmp/cloud-init-ready.yaml` speichern.
- **Rescue Mode Reset:** Bash-Setup-Script vorbereiten mit System-Tuning, Firewall-Rules und WireGuard-wg-mesh-Config. Nach `/tmp/setup-<nodename>.sh` speichern.

## Schritt 1.4: Deployment

- **New Server:**
  ```bash
  hcloud server create --context <env> --name <hostname> --type cx32 --image ubuntu-24.04 \
    --user-data-from-file /tmp/cloud-init-ready.yaml
  ```
- **Rescue Mode Reset:**
  ```bash
  hcloud server enable-rescue --context <env> --type linux64 <server-id> && \
  hcloud server reset --context <env> <server-id>
  # SSH into rescue, partition, install base image:
  /root/.oldroot/nfs/install/installimage -a -c /tmp/installimage.conf
  reboot
  ```
  Nach Reboot: Setup-Script ausführen:
  ```bash
  ssh root@<NODE_IP> bash -s < /tmp/setup-<nodename>.sh
  ```

## Schritt 1.5: Peer & k3s Verification

Public-Key des neuen Nodes zu existierenden Peers hinzufügen:
```bash
sudo wg set wg-mesh peer <PUBLIC_KEY> allowed-ips <WG_IP>/32 endpoint <ENDPOINT>
```
Verify Node-Status und label:
```bash
kubectl get nodes --context <env> -o wide
# Label appropriately: node-role.kubernetes.io/control-plane="" OR node-role.kubernetes.io/worker=""
```
