# Runbook: LAN- und Tailnet-DNS auf devmesh (AdGuard Home)

AdGuard Home läuft in devmesh (`dev-local/lan-dns/`, Namespace `lan-dns`) mit zwei
Replicas auf verschiedenen Nodes. Es ersetzt den Raspberry Pi `raspberrypi`
(10.0.0.2, Tailnet-Gerät `dns`) in drei Rollen: Upstream-DNS der Fritzbox,
globaler Nameserver des Tailnets und Subnet-Router für `10.0.0.0/24`.
Entscheidungen: `.agents/plans/lan-dns-adguard/design.md` (T016515).

```
LAN-Gerät ──DHCP/DNS──► Fritzbox 10.0.0.1 ──► 10.10.10.2:53 (ServiceLB) ──► AdGuard ×2
                                         └──► 9.9.9.9 (Ausweich)
Tailnet-Gerät ──MagicDNS──► lan-dns (Operator-Proxy) ──► AdGuard ×2
                       └──► 9.9.9.9 (Ausweich)
```

**DHCP bleibt auf der Fritzbox.** Kein Schritt in diesem Runbook ändert die
Adressvergabe. Geräte bekommen weiter 10.0.0.1 als DNS-Server.

Die Konfiguration steht vollständig in `dev-local/lan-dns/AdGuardHome.yaml`.
Änderungen in der Web-UI gehen beim nächsten Pod-Start verloren.

---

## 1. Deploy und Prüfung

```bash
task devmesh:dns:deploy        # ufw Port 53 auf allen k3s-Hosts, dann apply + rollout
task devmesh:dns:check         # jede Server-IP muss "ok" melden
kubectl --context devmesh -n lan-dns get pods -o wide   # zwei Pods, zwei Nodes
```

Tailnet-Gerät prüfen: in der Admin-Konsole unter Machines erscheint `lan-dns` mit
Tag `tag:lan-dns`. Dafür muss die Policy aus Abschnitt 4 eingespielt sein, sonst
darf der Operator den Tag nicht vergeben.

## 2. Ausfalltest vor jeder Umstellung

```bash
kubectl --context devmesh -n lan-dns delete pod -l app=adguard --wait=false \
  --field-selector "spec.nodeName=$(kubectl --context devmesh -n lan-dns get pods -l app=adguard -o jsonpath='{.items[0].spec.nodeName}')"
task devmesh:dns:check         # muss weiter "ok" melden (zweite Replica)
```

## 3. Fritzbox umstellen

Internet → Zugangsdaten → DNS-Server → „Andere DNSv4-Server verwenden“:

- Bevorzugter DNSv4-Server: `10.10.10.2`
- Alternativer DNSv4-Server: `9.9.9.9`

Prüfung von einem LAN-Gerät:

```bash
dig @10.0.0.1 quad9.net +short
dig @10.0.0.1 gpu-metal.fritz.box +short     # lokale Namen über die Fritzbox
```

Danach im Query-Log der UI (Abschnitt 6) Anfragen von 10.0.0.1 sehen.

**Ausfalltest nach der Umstellung** (prüft, dass die Fritzbox auf 9.9.9.9 ausweicht —
das ist nicht dokumentiert, nur so belegbar):

```bash
kubectl --context devmesh -n lan-dns scale deploy/adguard --replicas=0
dig @10.0.0.1 quad9.net +short               # muss weiter antworten
kubectl --context devmesh -n lan-dns scale deploy/adguard --replicas=2
```

Antwortet die Fritzbox ohne AdGuard nicht, sofort zurückstellen (Abschnitt 7).

## 4. Tailnet umstellen

1. Live-Policy (Access controls) mit `devmesh/tailnet-policy.hujson` vergleichen,
   den `tag:lan-dns`-Eintrag in `tagOwners`, die Regel auf `tag:lan-dns:53` und
   `autoApprovers` übernehmen. Prüfen, dass der Operator-Tag dort `tag:k8s-operator` heißt.
2. DNS → Global nameservers: `lan-dns` (dessen 100.x-Adresse) als ersten,
   `9.9.9.9` als zweiten Eintrag. Den Eintrag `100.79.93.76` (Pi) entfernen.
3. Split DNS: die Routen `fritz.box` und `home` auf 10.0.0.2 entfernen. AdGuard
   löst beide selbst über die Fritzbox auf.

Prüfung von einem Tailnet-Gerät außerhalb des Heimnetzes (z. B. Hotspot):

```bash
tailscale dns status                          # Resolvers: lan-dns-Adresse, 9.9.9.9
nslookup gpu-metal.fritz.box                  # lokaler Name über AdGuard → Fritzbox
nslookup quad9.net
```

Ausfalltest wie in Abschnitt 3 (auf 0 skalieren, Auflösung muss weiter gehen).

**Achtung:** Die devmesh-Nodes nutzen selbst Tailscale-DNS (`AcceptDNS=True`).
Nach der Umstellung lösen sie über `lan-dns` auf, also über den eigenen Cluster.
Der zweite Nameserver `9.9.9.9` fängt einen Clusterausfall ab. Er darf deshalb
nicht entfernt werden.

## 5. Subnet-Route redundant machen

```bash
DRY_RUN=1 task devmesh:tailnet:routes          # zeigt gpu-cluster, gpu-cluster2
task devmesh:tailnet:routes
```

In der Admin-Konsole unter Machines tragen gpu-cluster und gpu-cluster2 dann die
Route `10.0.0.0/24` (über `autoApprovers` freigegeben, sonst dort manuell
freigeben). Test: Pi kurz vom Netz nehmen, von außerhalb `ping 10.0.0.1`.

## 6. Web-UI

```bash
kubectl --context devmesh -n lan-dns port-forward deploy/adguard 3000
```

Dann `http://localhost:3000`. Die UI ist im Pod nur auf `127.0.0.1` gebunden:
kein anderer Pod im Cluster erreicht sie, nur `kubectl port-forward`. Deshalb
ohne Anmeldung. Nicht auf `0.0.0.0` umstellen, sonst könnte jeder Pod in devmesh
die Upstreams für LAN und Tailnet umschreiben. Jede Replica hat eigene Statistik und eigenes Query-Log.

## 7. Rückweg

- Fritzbox: „DNSv4-Server des Internetanbieters verwenden“.
- Tailnet: globaler Nameserver wieder `100.79.93.76`, Split-Routen wiederherstellen.
- Beides wirkt sofort, der Pi läuft bis zu seinem Abbau weiter.

## 8. Danach

- Optional DNSv6 der Fritzbox ebenso umstellen. Bis dahin gehen IPv6-Anfragen
  ungefiltert an den Anbieter.
- Pi abbauen bzw. als k3s-Worker aufnehmen (eigenes Ticket): AdGuard und
  Subnet-Route auf dem Pi abschalten, erst wenn Abschnitte 3 bis 5 bestanden sind.
