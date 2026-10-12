# fleet-gekko-ohne-wg — Design

Ticket: T016529 (feature, mentolder). Folgeticket: T016530 (Fritzbox-DNS, separat).

## Ziel

fleet (Prod) neu auf gekko-hetzner-2/3/4 ausrollen, ohne WireGuard. Die
pk-hetzner-Nodes verlassen fleet. Knotenverkehr ueber das private
Hetzner-Netz, Admin-Zugriff ueber Tailscale. Danach existiert im Repo keine
WireGuard-VPN-Strecke mehr (wg-fleet, toter Mesh).

## Entscheidungen (Operator, 2026-10-13, im Ticket belegt)

- D1 Netz: k3s auf gekko mit node-ip 192.168.200.x, Flannel ueber das private
  Netz (gleiches DC). Kein vpn-auth. Tailscale auf allen Nodes fuer
  Admin/kubectl, tls-san mit Tailnet-Namen und -IPs. Oeffentlich nur 80/443.
  Key-Ablauf fuer die fleet-Nodes in Tailscale abschalten, eigener fleet-Tag.
- D2: 3 Server mit embedded etcd (gekko-hetzner-2/3/4). Alter Cluster laeuft
  bis zum DNS-Umschalten weiter.
- D3: Kein Longhorn, nur local-path. Ersatz: regelmaessige Backups
  (shared-db-Backup-CronJob, Volume-Backups), vor dem Cutover verifiziert.
- Q16 Umfang: nur Prod workspace (inkl. website, cert-manager,
  sealed-secrets, flux, traefik, coturn falls Prod-Teil) plus schlankes
  neues monitoring. staging/dev/korczewski-Namespaces ziehen nach devmesh.
- Monitoring (Operator 2026-10-13 bestaetigt): kube-prometheus ohne Loki,
  kurze Retention.

## Prior-Art

- ADR-001 (fleet = pk-Server + gekko-Worker) wird durch diesen Umbau
  faktisch umgekehrt. Neue ADR-014 dokumentiert die Umkehr und vermerkt
  ADR-001 als teilweise superseded. ADR-007/008 betreffen devmesh/WSL und
  bleiben unberuehrt; das k3s-interne flannel-wg in devmesh bleibt.
- Guards: tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py
  und tests/py/spec/test_fleet_operations.py sichern heute den WG-Mesh ab
  und muessen mit dem Abbau ersetzt bzw. angepasst werden.

## Warum ein sequenzieller Plan (partials=1)

Alle Schritte wirken auf denselben Cluster und sind durch Operator-Gates
serialisiert (Backup-Verifikation, Abnahme, DNS-Freigabe, Loesch-Freigabe).
Parallele Partials auf disjunkten Dateien wuerden die Gate-Reihenfolge
nicht abbilden. Deshalb ein Plan, eine Ausfuehrungsreihenfolge.

## Gates

- G1 Backup verifiziert: erst danach gekko aus dem alten fleet loesen.
- G2 Abnahme neuer Cluster: Website, Nextcloud, Pocket ID, Vaultwarden und
  Zertifikate per resolve-/hosts-Test gegen die gekko-IPs gruen.
- G3 Operator-Freigabe direkt vor dem DNS-Umschalten (TTL vorher senken).
- G4 Operator-Freigabe vor dem Loeschen der pk-hetzner-Server.

## Risiken

- R1 RAM: 21 GiB gesamt auf gekko. Nur Prod plus schlankes Monitoring
  (ca. 7-8 GiB Pods). staging/dev/Longhorn ziehen nicht mit.
- R2 Kein Volume-Replikat (D3): Node-Ausfall macht dessen local-path-Daten
  bis zur Rueckkehr unerreichbar. Backups vorher verifizieren (G1).
- R3 Feste Node-Namen/IPs/Longhorn-StorageClass in Manifesten fuehren nach
  dem Umzug zu Pending-Pods. Vorher bereinigen (Task 3).
- R4 Cutover: DNS-TTL und Caches; Zertifikate vorher ausstellen (G2).

## Out of Scope

- Fritzbox-DNS-Alternative 10.10.10.3: eigenes Ticket T016530.
- WSL wg0 und Pi-Abschaltung: bereits erledigt bzw. Operator-Handarbeit.
