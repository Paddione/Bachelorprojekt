# Runbook: Drei Workstations per ISO zum k3s-Cluster

Ziel: ein USB-Stick, der auf drei x86-Workstations ohne Rueckfrage Ubuntu
Server installiert, jeder Maschine einen eigenen Hostnamen gibt und den
k3s-Join vorbereitet. Der Join selbst ist ein zweiter, bewusster Schritt.

**Das ISO loescht beim Booten die groesste Platte der Maschine ohne
Rueckfrage.** Einzige Abbruchgelegenheit sind 5 Sekunden im GRUB-Menue.

---

## Warum k3s nicht schon im Image steckt

Rolle und Cluster-Token stehen erst fest, wenn alle drei Maschinen laufen: der
erste Node startet den Cluster, die anderen beiden joinen gegen dessen IP. Ein
Image mit eingebranntem Token muesste bei jeder Neuinstallation neu gebaut
werden und traegt ein Cluster-Secret auf einem USB-Stick durch die Gegend.
Deshalb bringt das Image nur `/usr/local/sbin/k3s-join.sh` mit.

---

## 1. Vorbereitung

### Werkzeuge

```bash
sudo apt install -y xorriso curl gettext-base openssl
task iso:deps
```

### MAC-Adressen einsammeln

Ohne Zuordnung heissen die Nodes `ws-<letzte-3-MAC-Oktette>` — eindeutig, aber
nicht sprechend. Mit Zuordnung heissen sie so, wie du sie planst.

MAC ablesen: UEFI-Setup der Maschine (meist unter "Network"), oder aus der
DHCP-Lease-Liste des Routers, oder von einem Live-System per
`ip -o link | awk '{print $2, $(NF-2)}'`.

```bash
cp scripts/iso/node-map.example scripts/iso/node-map
# eintragen, eine Zeile je Maschine:
#   aa:bb:cc:dd:ee:01  ws-node-1
```

`scripts/iso/node-map` ist gitignored — es beschreibt deine Hardware, nicht das
Repo.

---

## 2. ISO bauen

```bash
task iso:build ISO_SSH_KEY=~/.ssh/id_ed25519.pub
```

oder direkt, mit allen Schaltern:

```bash
bash scripts/iso/build-node-iso.sh \
  --ssh-key ~/.ssh/id_ed25519.pub \
  --node-map scripts/iso/node-map \
  --admin-user clusteradmin \
  --admin-password 'nur-fuer-die-konsole' \
  --out ~/iso/ws-node.iso
```

Der erste Lauf laedt das Ubuntu-Server-ISO (~3 GB) nach
`~/.cache/bachelorprojekt-iso` und prueft dessen SHA256 gegen
`releases.ubuntu.com`. Spaetere Laeufe nutzen den Cache.

`--admin-password` ist optional. Ohne es gibt es nur SSH-Key-Login — sicherer,
aber bei einem Netzwerkproblem kommst du an der lokalen Konsole nicht mehr
rein. Fuer Bare Metal, das im Zweifel im Keller steht, ist ein Konsolen-Passwort
die pragmatischere Wahl.

---

## 3. Stick schreiben

```bash
lsblk -o NAME,SIZE,MODEL,TRAN      # Zielgeraet identifizieren
sudo dd if=~/iso/ws-node.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

`of=` zeigt auf das **Geraet** (`/dev/sdb`), nicht auf eine Partition
(`/dev/sdb1`). Ein falsches `of=` loescht die genannte Platte sofort.

---

## 4. Installieren

Auf jeder Maschine: Stick einstecken, im UEFI davon booten, 5 Sekunden nicht
eingreifen. Der Rest laeuft durch (10-20 Minuten je nach Netz und Platte) und
endet mit einem Reboot.

Danach ist die Maschine per SSH erreichbar:

```bash
ssh clusteradmin@<ip>
hostname     # sollte den Namen aus der node-map zeigen
```

Stimmt der Hostname nicht, steht die Ursache in
`/var/log/assign-identity.log` — meist eine MAC, die im UEFI anders lautet
als die der tatsaechlich genutzten NIC (typisch bei Boards mit zwei Ports).
Nachtraeglich korrigierbar mit `hostnamectl set-hostname <name>`, solange
noch kein k3s laeuft.

---

## 5. Cluster bilden

Token einmal erzeugen und auf allen drei Nodes denselben benutzen:

```bash
openssl rand -hex 32
```

**Node 1** startet den Cluster:

```bash
sudo k3s-join.sh --role init --token "$TOKEN"
```

**Node 2 und 3** treten als Server bei (HA mit embedded etcd):

```bash
sudo k3s-join.sh --role server --token "$TOKEN" --server https://<ip-node-1>:6443
```

Danach auf Node 1:

```bash
sudo k3s kubectl get nodes -o wide     # drei Nodes, Status Ready
```

### Drei Server oder ein Server und zwei Worker?

etcd braucht eine ungerade Anzahl Server. Drei Server verkraften den Ausfall
einer Maschine. **Zwei Server sind schlechter als einer** — sie verlieren bei
jedem Ausfall das Quorum. Also entweder alle drei als `--role server`, oder
einer `init` und zwei `agent` (dann faellt der Cluster mit Node 1 aus).

Fuer drei gleichwertige Workstations ist `server` auf allen dreien die
richtige Wahl.

### kubeconfig auf den Arbeitsrechner holen

```bash
ssh clusteradmin@<ip-node-1> sudo cat /etc/rancher/k3s/k3s.yaml \
  | sed "s|127.0.0.1|<ip-node-1>|" > ~/.kube/ws-cluster.yaml
KUBECONFIG=~/.kube/ws-cluster.yaml kubectl get nodes
```

---

## Bekannte Stolperstellen

**Mehrere Platten in einer Maschine.** Der Installer nimmt die **groesste**
Platte (`layout: direct`, `match: {size: largest}`). Bei genau einer Platte ist
das eindeutig — im VM-Test entstand daraus `vda1` (EFI) plus `vda2` (root ueber
den Rest). Bei zwei Platten kann es die falsche treffen: eine kleine schnelle
NVMe plus eine grosse HDD ergibt ein System auf der HDD. Wenn das nicht
gewollt ist, in `scripts/iso/autoinstall/user-data.tmpl` das Match-Kriterium
aendern, etwa `match: {ssd: true}` oder ein fester Pfad
(`match: {path: /dev/nvme0n1}`). Alle drei Maschinen brauchen dann dieselbe
Bestueckung, sonst ist wieder ein ISO je Maschine faellig.

**Secure Boot.** Das umgepackte ISO ist nicht signiert. Bootet die Maschine
nicht, im UEFI Secure Boot deaktivieren.

**Zwei Netzwerkkarten.** `k3s-join.sh` nimmt ohne `--node-ip` die IP der
Default-Route. Bei getrenntem Management- und Cluster-Netz die gewuenschte IP
explizit angeben: `--node-ip 10.0.0.11`.

**DHCP-Adressen.** Ein Node, dessen IP sich aendert, faellt aus dem Cluster.
Vor dem Join im Router feste Leases setzen oder statische Adressen vergeben.

**Wiederholter Join.** `k3s-join.sh` bricht ab, wenn k3s schon installiert ist.
Erst `/usr/local/bin/k3s-uninstall.sh` (bzw. `k3s-agent-uninstall.sh`) laufen
lassen.

**ufw.** Die Installation legt die Regeln an, laesst die Firewall aber aus —
ein Default-Deny vor dem Join sperrt sonst den eigenen Zugang aus.
`k3s-join.sh` schaltet sie ein, nachdem alle Regeln stehen.

---

## Bezug zum fleet-Cluster

Dieser Cluster ist eigenstaendig und hat nichts mit dem produktiven
`fleet`-Cluster zu tun. Sollen die Workstations spaeter stattdessen dem fleet
beitreten, ist der Weg ein anderer: WireGuard-Mesh (`wg-fleet`) mit Peer-Eintrag
auf den Control-Plane-Nodes, dann `k3s-join.sh --role agent --flannel-iface wg0`.
Die Vorlage dafuer ist `scripts/hetzner/cloud-init.yaml.tmpl` zusammen mit
`scripts/hetzner/generate-wg-conf.sh`.
