# Proposal: cluster-dev-node-gekko2

## Why

Drei Befunde aus der Ops-Session vom 2026-08-03, die alle denselben Kern haben: die
Fleet-Topologie ist von dem abgedriftet, was `openspec/specs/fleet-operations.md` beschreibt —
und niemand hat es bemerkt, weil kein Gate den Ist-Zustand gegen die Spec prüft.

**1. `gekko-hetzner-2` ist aus dem Cluster gefallen und läuft als Schatten-Cluster weiter.**
Die SSOT-Spec führt ihn als Worker mit `10.20.0.4/32`. Tatsächlich kennt `kubectl get nodes` ihn
nicht. Auf dem Node läuft stattdessen ein eigenständiger Single-Node-k3s **v1.32.13** (fleet:
v1.36.1) mit 69 Pods, eigenem `workspace`-Namespace, cert-manager, Collabora und LiveKit — obwohl
LiveKit laut T002184 aus fleet entfernt wurde.

Der Zeitpunkt ist belegbar: der `wg-fleet`-Peer `10.20.0.4/32` auf `pk-hetzner-4` hat seinen
letzten Handshake vor 30 Tagen, und der k3s-Server auf gekko-hetzner-2 läuft seit
`2026-07-03 20:59 UTC`. Der Node ist also nicht „nie beigetreten", sondern wurde an diesem Tag
durch einen k3s-Server-Install überschrieben, der den Agent ersetzte. Sämtliche Ingresses lauten
`*.localhost`; auf `178.104.169.206` zeigt kein DNS-Record. Der Stack bedient **null Traffic** und
belegt seit einem Monat eine vollständige Maschine.

**2. Der Cluster-Dev-Stack ist seit 10 Tagen leer — durch einen Aus-Schalter an der falschen
Stelle.** `k3d/dev-stack/` definiert `shared-db-dev`, `website-dev`, `brett-dev`, `sish`, drei
oauth2-Proxies und Ingress; `prod-fleet/dev` wrappt das nach `workspace-dev`; `ks-dev.yaml`
reconciled es und meldet `Ready=True`. Der Namespace ist trotzdem leer.

Ursache: `scripts/flux-render-artifact.sh` liest `DEV_DOMAIN` aus der `dev`-Umgebung. Aber
`environments/dev.yaml` beschreibt die **lokale k3d-Umgebung** (`context: k3d-korczewski`,
`domain: localhost`) — eine lokale Umgebung hat naturgemäß keine öffentliche Domain. Laut
`environments/schema.yaml` bedeutet leer „*Empty disables the dev stack*", also rendert das Skript
bewusst ein leeres, gültiges Kustomize-Verzeichnis. Kein Fehler im Renderer: eine Datei erfüllt
zwei unvereinbare Rollen. Der passende Wert steht bereits in `environments/mentolder.yaml`
(`DEV_DOMAIN: "dev.mentolder.de"`) — nur in der Datei, die der Renderpfad nicht liest.

**3. Externer `kubectl`-Zugriff hängt an einem einzigen Node.** Das API-Zertifikat führt als
öffentliche SAN nur `204.168.244.104`; `pk-hetzner-6` und `-8` haben keine `tls-san`-Einträge in
ihrer `config.yaml`. Trotz drei Control-Plane-Nodes ist die Kubernetes-API von außen
ausschließlich über `pk-hetzner-4` erreichbar — fällt der Node aus, gibt es kein `kubectl` mehr,
obwohl das etcd-Quorum intakt wäre. Der Fehler wurde beim Rolling-Reboot am 2026-08-03 sichtbar,
als der Endpunkt-Schwenk auf `pk-hetzner-6` mit einem x509-Fehler scheiterte.

## What

**Cluster-Dev-Node.** `gekko-hetzner-2` verliert den Schatten-k3s und tritt fleet als Worker bei —
mit Label und Taint `role=dev:NoSchedule`, sodass ausschließlich Dev-Workloads dort landen. Vor
dem Wipe werden die 1,7 GB Nutzdaten aus 8 PVCs als Tarball gesichert.

**Dev-Stack scharfschalten.** Eine neue `environments/dev-cluster.yaml` liefert `DEV_DOMAIN` und
Kontext für den fleet-gerenderten Dev-Stack; `environments/dev.yaml` beschreibt danach
ausschließlich die lokale k3d-Umgebung. `scripts/flux-render-artifact.sh` sourct die neue Datei.
Der `workspace-dev`-Stack bekommt `nodeAffinity` und Toleration auf `role=dev`. DNS
`dev.mentolder.de` wird von `153.92.37.9` (Heim-ISP) auf `178.104.169.206` umgestellt.

**tls-san nachziehen.** `pk-hetzner-6` und `-8` erhalten ihre öffentlichen IPs als `tls-san` in
`/etc/rancher/k3s/config.yaml`, gefolgt von einer Zertifikatsrotation.

**Drift-Gate.** Ein Test prüft die in `fleet-operations` beschriebene Node-Menge gegen den
Ist-Zustand des Clusters. Ohne diesen Schritt wiederholt sich Befund 1 unbemerkt.

## Non-Goals

- **Keine Control-Plane-Promotion.** Ursprünglich waren 5 CP angedacht. Verworfen: `gekko-hetzner-3`
  und `-4` haben 7 GB RAM bei bereits 1,3 GB etcd-Datenbank, die CP-Nodes 15 GB. etcd reagiert
  empfindlich auf Speicherdruck und verliert dann Leader-Wahlen — fünf CP mit zwei knapp
  bemessenen Nodes wären in der Praxis unzuverlässiger als drei gut ausgestattete. Beide bleiben
  Worker. Zudem verträgt 6 CP genauso wenige Ausfälle wie 5 (Quorum 4 von 6), bringt gegenüber
  dem heutigen Stand also keinen Verfügbarkeitsgewinn, der die Umbauten rechtfertigt.
- **Der lokale WSL/k3d-Dev-Stack ist nicht Teil dieses Vorgangs.** Er ist Etappe E2 von T002623
  (ADR-006, SDLC-Isolation auf den Dev-Host). Doppelplanung wird bewusst vermieden.
- **korczewski bleibt eingefroren** (T002479, `ks-korczewski.yaml` mit `suspend: true`).
- **Keine Migration der Schatten-Stack-Workloads.** Der Tarball ist eine Sicherung, keine
  Wiederinbetriebnahme.

_Ticket: T002630_
