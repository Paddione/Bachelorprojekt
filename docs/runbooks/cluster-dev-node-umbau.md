# Cluster-Dev-Node-Umbau (gekko-hetzner-2)

Operatives, einmaliges Vorgehen für den Umbau von `gekko-hetzner-2` vom Schatten-k3s
zur Dev-Node des fleet-Clusters — plus `tls-san`-Nachzug auf den Control-Plane-Nodes.
_Ticket: T002630._

> Die Schritte am Node sind bewusst **dokumentiert statt in ein Skript gegossen**: sie
> laufen einmalig und operativ, ein Skript wuerde nach einem Lauf verwaist. Was CI abdecken
> kann, deckt CI ab — das `fleet:membership`-Drift-Gate prueft die Node-Menge laufend.

## 0. Ausgangslage (geprueft am 2026-08-03)

- `gekko-hetzner-2` ist seit `2026-07-03 20:59 UTC` **nicht** Teil des fleet-Clusters
  (`kubectl --context fleet get nodes` kennt ihn nicht).
- Auf dem Node laeuft ein eigenstaendiger Single-Node-k3s **v1.32.13** (fleet: v1.36.1) mit
  69 Pods, eigenem `workspace`-Namespace, cert-manager, Collabora und LiveKit — bei null
  Traffic (alle Ingresses `*.localhost`, kein DNS-Record auf `178.104.169.206`).
- Ursache des damaligen Ausfalls: ein k3s-**Server**-Install hat den **Agent** ueberschrieben.

## 1. Sicherung zuerst (nicht verhandelbar)

1,7 GB Nutzdaten aus 8 PVCs unter `/var/lib/rancher/k3s/storage/` sichern, **bevor**
irgendetwas geloescht wird — und vom Node **herunterkopieren** (Sicherung nur auf dem
Node schuetzt nicht vor dem Wipe).

```bash
ssh root@178.104.169.206 \
  'tar czf /root/k3s-storage-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
     -C /var/lib/rancher/k3s/storage . && ls -lh /root/k3s-storage-backup-*.tar.gz'
# Dann lokal abholen:
scp root@178.104.169.206:/root/k3s-storage-backup-*.tar.gz ./
```

> Der Tarball ist eine **Sicherung, keine Wiederinbetriebnahme**: Die Workloads des
> Schatten-Stacks werden nicht migriert (Non-Goal T002630).

## 2. Schatten-k3s entfernen

```bash
ssh root@178.104.169.206 '/usr/local/bin/k3s-uninstall.sh'
```

## 3. Als Agent joinen (ausdruecklich Agent, nicht Server!)

Node-Token von einem Control-Plane-Node holen:

```bash
# Auf einem CP-Node (pk-hetzner-4/6/8):
sudo cat /var/lib/rancher/k3s/server/node-token
```

Dann auf gekko-hetzner-2 mit der **Agent**-Installation joinen:

```bash
ssh root@178.104.169.206 'curl -sfL https://get.k3s.io \
  | K3S_URL="https://<cp-node-ip>:6443" K3S_TOKEN="<node-token>" sh -'
```

> **Warum die Betonung auf Agent:** Der Vorfall vom 2026-07-03 entstand dadurch, dass ein
> Server-Install den Agent ueberschrieb und der Node damit still aus dem Cluster fiel. Die
> Installations-Variante bestimmt das Verhalten bei einem zweiten Lauf — Agent bleibt Agent.

## 4. Label und Taint setzen, wg-fleet verifizieren

Der Node soll ausschliesslich Dev-Workloads aufnehmen — Prod-Workloads duerfen dort nie
landen (Spec: „Dedicated Development Node Repels Production Workloads").

```bash
kubectl --context fleet label node gekko-hetzner-2 role=dev
kubectl --context fleet taint nodes gekko-hetzner-2 role=dev:NoSchedule
kubectl --context fleet get node gekko-hetzner-2 --show-labels
kubectl --context fleet get node gekko-hetzner-2 -o jsonpath='{.spec.taints}'
```

Danach den `wg-fleet`-Peer und das Pod-CIDR verifizieren — **Eingang für P2.3**:

```bash
# Pod-CIDR des Nodes (in wireguard/wg-mesh-nodes.yaml eintragen!):
kubectl --context fleet get node gekko-hetzner-2 -o jsonpath='{.spec.podCIDR}'
# wg-fleet-Handshake pruefen (auf einem CP-Node):
sudo wg show wg-fleet | grep -A6 '10.20.0.4'
```

Das Pod-CIDR ist zwingend in `wireguard/wg-mesh-nodes.yaml` nachzutragen (mentolder-Mesh,
Eintrag `gekko-hetzner-2`): ein falscher oder fehlender `pod_cidr` in `AllowedIPs` laesst
WireGuard die Pod-Pakete lautlos verwerfen (T002491). Danach `bash scripts/generate-wg-conf.sh`
fuer den GPU-Host neu ausfuehren.

## 5. tls-san auf pk-hetzner-6 und -8 nachziehen

Das API-Zertifikat fuehrte als oeffentliche SAN nur `204.168.244.104` (pk-hetzner-4). Trotz
drei Control-Plane-Nodes war die Kubernetes-API von aussen nur ueber einen einzigen Node
erreichbar. Fuer **jeden** CP-Node die jeweilige oeffentliche Adresse eintragen:

```bash
# pk-hetzner-6 (37.27.251.38):
ssh root@37.27.251.38 'grep -q tls-san /etc/rancher/k3s/config.yaml \
  || printf "tls-san:\n  - 37.27.251.38\n" >> /etc/rancher/k3s/config.yaml; cat /etc/rancher/k3s/config.yaml'
# pk-hetzner-8 (62.238.23.79):
ssh root@62.238.23.79 'grep -q tls-san /etc/rancher/k3s/config.yaml \
  || printf "tls-san:\n  - 62.238.23.79\n" >> /etc/rancher/k3s/config.yaml; cat /etc/rancher/k3s/config.yaml'
```

Alte Server-Zertifikate entfernen, damit k3s sie neu mit den neuen SANs ausstellt, dann k3s
neu starten:

```bash
ssh root@37.27.251.38 'rm -rf /var/lib/rancher/k3s/server/tls/dynamic-cert.json \
  && systemctl restart k3s && systemctl status k3s --no-pager'
ssh root@62.238.23.79 'rm -rf /var/lib/rancher/k3s/server/tls/dynamic-cert.json \
  && systemctl restart k3s && systemctl status k3s --no-pager'
```

Danach pruefen, dass ein `kubectl`-Aufruf gegen **jeden** CP-Node ohne x509-Fehler
durchlaeuft — das ist der eigentliche Verfuegbarkeitsgewinn dieses Vorgangs:

```bash
kubectl --context fleet --server https://204.168.244.104:6443 get nodes
kubectl --context fleet --server https://37.27.251.38:6443 get nodes
kubectl --context fleet --server https://62.238.23.79:6443 get nodes
```

## 6. DNS umstellen

`dev.mentolder.de` von der Heim-ISP-Adresse `153.92.37.9` auf die oeffentliche Adresse des
Dev-Nodes umstellen:

```bash
# 178.104.169.206 = gekko-hetzner-2
```

Anschliessend die ACME-Ausstellung abwarten und das Zertifikat pruefen:

```bash
kubectl --context fleet get certificate -A
# Zertifikat + Ingress fuer den Dev-Stack:
curl -I --resolve dev.mentolder.de:443:178.104.169.206 https://dev.mentolder.de
```

## 7. Abschluss-Verifikation

```bash
task fleet:membership   # muss jetzt OK melden (gekko-hetzner-2 ist wieder deklariert+anwesend)
kubectl --context fleet -n workspace-dev get pods -o wide   # Dev-Stacks auf gekko-hetzner-2
```
