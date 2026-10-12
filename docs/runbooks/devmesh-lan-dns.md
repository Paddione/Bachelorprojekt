# Runbook: LAN- und Tailnet-DNS auf devmesh (AdGuard Home)

AdGuard Home läuft in devmesh (`dev-local/lan-dns/`, Namespace `lan-dns`) als
DaemonSet mit `hostNetwork` auf den Nodes mit `lan_dns: true` im Inventar
(gpu-cluster, gpu-cluster2). Jede Instanz bindet Port 53 direkt an die LAN-IP
ihres Nodes. Es ersetzt den Raspberry Pi `raspberrypi`
(10.0.0.2, Tailnet-Gerät `dns`) in drei Rollen: Upstream-DNS der Fritzbox,
globaler Nameserver des Tailnets und Subnet-Router für `10.0.0.0/24`.
Entscheidungen: `.agents/plans/lan-dns-adguard/design.md` (T016515).

```
LAN-Gerät ──DHCP/DNS──► Fritzbox 10.0.0.1 ──► 10.10.10.2:53 (AdGuard auf gpu-cluster)
                                         └──► 9.9.9.9 (Ausweich)
Tailnet-Gerät ──MagicDNS──► lan-dns (Operator-Proxy) ──► AdGuard (gpu-cluster, gpu-cluster2)
                       └──► 9.9.9.9 (Ausweich)
```

**DHCP bleibt auf der Fritzbox.** Kein Schritt in diesem Runbook ändert die
Adressvergabe. Geräte bekommen weiter 10.0.0.1 als DNS-Server.

Die Konfiguration steht vollständig in `dev-local/lan-dns/AdGuardHome.yaml`.
Änderungen in der Web-UI gehen beim nächsten Pod-Start verloren.

**Kein LoadBalancer oder NodePort auf Port 53.** Die k3s-ServiceLB legt dafür
hostPort-DNAT an, die auch den lokalen Resolver `127.0.0.53` jedes Nodes kapert.
Am 2026-10-12 fiel dadurch die DNS-Auflösung aller devmesh-Nodes für vier Minuten
aus (T016520). Ein Test verbietet das.

---

## 1. Deploy und Prüfung

```bash
task devmesh:dns:deploy        # siehe unten
task devmesh:dns:check         # jeder lan_dns-Host muss "ok" melden
kubectl --context devmesh -n lan-dns get pods -o wide   # ein Pod je lan_dns-Node
```

`dns:deploy` (`scripts/devmesh/lan-dns-deploy.sh`) prüft zuerst die Node-DNS auf
jedem k3s-Host, setzt ufw-Regeln und Node-Labels, rollt aus und prüft danach
Node-DNS und jede AdGuard-IP. Scheitert ein Schritt nach dem Apply, löscht es
alles wieder (`kubectl delete -k dev-local/lan-dns`) und meldet Exit 1.
`DRY_RUN=1` zeigt nur die Schritte.

Tailnet-Gerät prüfen: in der Admin-Konsole unter Machines erscheint `lan-dns` mit
Tag `tag:lan-dns`. Dafür muss die Policy aus Abschnitt 4 eingespielt sein, sonst
darf der Operator den Tag nicht vergeben.

## 2. Ausfalltest vor jeder Umstellung

```bash
kubectl --context devmesh -n lan-dns delete pod -l app=adguard \
  --field-selector spec.nodeName=gpu-cluster
task devmesh:dns:check         # gpu-cluster kurz FEHLT, gpu-cluster2 ok
kubectl --context devmesh -n lan-dns rollout status ds/adguard   # Pod kommt zurück
task devmesh:dns:check         # beide wieder ok
```

Die Fritzbox kennt nur `10.10.10.2`. Fällt AdGuard auf gpu-cluster aus, weicht
sie auf `9.9.9.9` aus, nicht auf gpu-cluster2. Das Tailnet nutzt beide Instanzen
über den Operator-Proxy.

Komplett abschalten und wieder ausrollen (für die Ausfalltests unten):

```bash
kubectl --context devmesh delete -k dev-local/lan-dns    # AdGuard aus
task devmesh:dns:deploy                                  # wieder an
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
kubectl --context devmesh delete -k dev-local/lan-dns
dig @10.0.0.1 quad9.net +short               # muss weiter antworten
task devmesh:dns:deploy
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

Ausfalltest wie in Abschnitt 3 (AdGuard abschalten, Auflösung muss weiter gehen).

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
kubectl --context devmesh -n lan-dns port-forward ds/adguard 3000
kubectl --context devmesh -n lan-dns get secret adguard-admin -o jsonpath='{.data.password}' | base64 -d; echo
```

Dann `http://localhost:3000`, Benutzer `admin`, Passwort aus dem Secret. Die UI
lauscht nur auf `127.0.0.1` des Nodes (hostNetwork), ist dort aber für Prozesse
und hostNetwork-Pods erreichbar, deshalb die Anmeldung. Das Secret legt
`lan-dns-deploy.sh` beim ersten Deploy an (Zufallspasswort, bcrypt-Hash, braucht
`python3-bcrypt`). Es steht nicht im Repo. Neues Passwort: Secret löschen,
`task devmesh:dns:deploy`. Jede Instanz hat eigene Statistik und eigenes
Query-Log. Änderungen in der UI gehen beim Neustart verloren.

## 7. Rückweg

- Fritzbox: „DNSv4-Server des Internetanbieters verwenden“.
- Tailnet: globaler Nameserver wieder `100.79.93.76`, Split-Routen wiederherstellen.
- Beides wirkt sofort, der Pi läuft bis zu seinem Abbau weiter.

## 8. Danach

- Optional DNSv6 der Fritzbox ebenso umstellen. Bis dahin gehen IPv6-Anfragen
  ungefiltert an den Anbieter.
- Pi abbauen bzw. als k3s-Worker aufnehmen (eigenes Ticket): AdGuard und
  Subnet-Route auf dem Pi abschalten, erst wenn Abschnitte 3 bis 5 bestanden sind.
