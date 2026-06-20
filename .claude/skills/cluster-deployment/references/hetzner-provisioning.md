# Hetzner Node Provisioning — Detail

Aus `cluster-deployment` Step 1.0 extrahiert (Chore T001007). Diese Schritte werden nur
bei einem **frischen Cluster-Setup** oder **Node-Replacement** ausgeführt — im Normalbetrieb
übersprungen. Daher aus dem Haupt-Skill ausgelagert.

## Voraussetzungen

- `hcloud` CLI authentifiziert (Step 1.0 im Haupt-Skill)
- WireGuard-Mesh-Keys in `environments/.secrets/<env>.yaml` (Schema-Key pro Node)
- SSH-Public-Key in `~/.ssh/id_ed25519.pub`

## Node-Layout (Fleet-Cluster, Stand 2026-05-31)

- 3 Control-Plane: `pk-hetzner-4/6/8`
- 3 Worker: `gekko-hetzner-2/3/4`
- Mentolder brand: namespace `workspace`, domain `mentolder.de`
- Korczewski brand: namespace `workspace-korczewski`, domain `korczewski.de`
- Alte Kontexte `mentolder`/`korczewski` sind DEAD — `--context fleet` für alles.

## Control-Plane INIT (erster CP)

```bash
WG_KEY=$(grep WG_MESH_PK4_PRIVATE_KEY environments/.secrets/korczewski.yaml | awk '{print $2}')
WG_CONF_B64=$(bash scripts/hetzner/generate-wg-conf.sh \
  --env korczewski --node-name pk-hetzner-4 --private-key "$WG_KEY" | base64 -w0)

bash scripts/hetzner/render-cloud-init.sh \
  --template scripts/hetzner/cloud-init-server.yaml.tmpl \
  --node-ip 204.168.244.104 --node-wg-ip 10.13.14.1 --wg-listen-port 51820 \
  --k3s-url "" --k3s-token <TOKEN> \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --wg-conf-b64 "$WG_CONF_B64" \
  > /tmp/ci-pk4.yaml

hcloud server create \
  --name pk-hetzner-4 --type cx22 \
  --image ubuntu-24.04 \
  --ssh-key <KEY_NAME> \
  --user-data-from-file /tmp/ci-pk4.yaml
kubectl --context fleet get nodes -w
```

## Worker (JOIN)

```bash
K3S_TOKEN=$(ssh patrick@204.168.244.104 "sudo cat /var/lib/rancher/k3s/server/node-token")

WG_KEY=$(grep WG_MESH_PK6_PRIVATE_KEY environments/.secrets/korczewski.yaml | awk '{print $2}')
WG_CONF_B64=$(bash scripts/hetzner/generate-wg-conf.sh \
  --env korczewski --node-name pk-hetzner-6 --private-key "$WG_KEY" | base64 -w0)

bash scripts/hetzner/render-cloud-init.sh \
  --node-ip 37.27.251.38 --node-wg-ip 10.13.14.2 --wg-listen-port 51820 \
  --k3s-url https://10.13.14.1:6443 --k3s-token "$K3S_TOKEN" \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --wg-conf-b64 "$WG_CONF_B64" \
  > /tmp/ci-pk6.yaml

hcloud server create \
  --name pk-hetzner-6 --type cx22 \
  --image ubuntu-24.04 \
  --ssh-key <KEY_NAME> \
  --user-data-from-file /tmp/ci-pk6.yaml
kubectl --context fleet get nodes -w
```

> Node data (IPs, WG IPs, schema keys) ist Single Source of Truth in `wireguard/wg-mesh-nodes.yaml`.
> Ein neuer Eintrag dort erscheint automatisch in der Peer-Liste aller anderen Nodes.

## Scaling / Replacement (Snapshot)

```bash
source <(bash scripts/env-resolve.sh <env> 2>/dev/null) || true
hcloud server create \
  --name <name> --type cx22 \
  --image "${HETZNER_WORKER_SNAPSHOT_ID}" \
  --ssh-key <KEY_NAME>
# k3s agent startet automatisch — kein cloud-init nötig
kubectl --context <ctx> get nodes -w
```

## Manual Re-Bootstrap Footguns (T000333, T000334, T000336)

Wenn ein existierender Host **manuell** neu gebootet wird (z.B. Re-Key auf neues Mesh), läuft cloud-init NICHT. Drei Schritte die das Template implizit macht, müssen explizit ausgeführt werden — in dieser Reihenfolge:

1. **Altes Mesh vor dem neuen stoppen (T000333).** Ein laufender `wg-quick@wg-mesh` belegt UDP/51820 → `wg-fleet` startet mit `RTNETLINK: Address already in use`. Erst: `sudo systemctl stop wg-quick@wg-mesh && sudo systemctl disable wg-quick@wg-mesh`, dann `systemctl start wg-quick@wg-fleet`.
2. **Kernel-Modul nach `apt install` laden (T000336).** Auf Ubuntu 24.04 (kernel 6.8.x) warnt `apt install wireguard-tools` vor Version-Mismatch und lädt das Modul nicht automatisch → `wg-quick` schlägt fehl mit `No such device`. Erst: `sudo modprobe wireguard`, dann WireGuard-Service starten.
3. **k3s-Install-Env-Vars im Install-Subshell exportieren, nicht nur bei `curl` (T000334).** `INSTALL_K3S_VERSION=x K3S_URL=y curl … | sh -s - server` wendet die Vars auf `curl` an, nicht auf `sh` — der Node reused einen gecachten Binary und formt einen Standalone-Cluster statt zu joinen. Wrap: `sudo bash -c "export INSTALL_K3S_VERSION=…; export K3S_URL=…; curl … | sh -s - server"`.
