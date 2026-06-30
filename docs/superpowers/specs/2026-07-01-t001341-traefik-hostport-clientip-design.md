---
ticket_id: T001341
plan_ref: openspec/changes/traefik-hostport-clientip/tasks.md
status: active
date: 2026-07-01
---

# Design Spec: Traefik hostPort — Echte Client-IP ohne klipper-lb-Hop

**Datum:** 2026-07-01
**Ticket:** T001341
**Branch:** fix/t001341-traefik-hostport-clientip
**Status:** active — Follow-up auf T001328 (siehe `docs/superpowers/specs/2026-06-30-pocket-id-rate-limit-design.md`), dessen `externalTrafficPolicy: Local`-Fix den Bug live NICHT behoben hat.

---

## Warum dieses Ticket existiert

T001328/PR #2330 (merged 2026-06-30) ging davon aus, dass `kube-proxy`s SNAT beim
Forward zur Traefik-Service-ClusterIP (unter `externalTrafficPolicy: Cluster`) die
einzige Ursache für den Client-IP-Verlust ist, und setzte `externalTrafficPolicy:
Local`. Frische Live-Verifikation nach dem Rollout zeigt: Pocket-ID sieht weiterhin
`ip=10.42.x.x` für echte Browser-Requests. Der Bug ist nicht behoben.

---

## Verifizierte Root Cause

k3s' eingebautes ServiceLB ("Klipper LB", `svclb-traefik`-DaemonSet in
`kube-system`) bindet Port 80/443 per `hostPort` auf jedem Node — implementiert
über zwei Container (`lb-tcp-80`, `lb-tcp-443`) mit `SRC_PORT`/`DEST_IPS=status.
hostIPs`/`DEST_PORT=<NodePort>`. Der Traffic-Flow:

```
Client → Node-Public-IP:80/443 (DNS Round-Robin, pk-hetzner-4/6/8)
       → svclb-traefik Pod (hostPort-Listener, EIGENE Pod-Netns)
       → iptables-DNAT zur NodePort-Backend-IP (DEST_IPS=status.hostIPs)
       → Re-Egress aus der svclb-Pod-Netns: src wird zu deren Pod-IP (10.42.x.x)
       → kube-proxy NodePort → Traefik-Pod
```

`externalTrafficPolicy: Local` (T001328) wirkt **nur** auf den letzten Schritt
(kube-proxy NodePort → Pod). Der Verlust passiert davor, beim Re-Egress aus
`svclb-traefik`s eigener Pod-Netns — eine zweite, eigenständige Proxy-Hop-Stelle,
die der ursprünglichen Root-Cause-Analyse nicht bekannt war.

Live bestätigt (`kubectl --context fleet -n kube-system get pods -l
svccontroller.k3s.cattle.io/svcname=traefik -o wide`): `svclb-traefik`-Pods laufen
auf allen 6 Fleet-Nodes (auch den 3 Workern ohne Public-IP), nicht nur den 3
Traefik-Nodes.

---

## Verworfene Alternative: MetalLB

Initial vorgeschlagen (siehe Ticket-Beschreibung), nach Live-Topologie-Prüfung
verworfen: DNS für `auth.mentolder.de`/`auth.korczewski.de`/`mentolder.de` löst
bereits per Round-Robin direkt auf alle 3 öffentlichen Node-IPs auf — es gibt
keine geteilte/floating VIP, die MetalLB bereitstellen müsste. MetalLB
L2Advertisement bräuchte eine gemeinsame L2-Broadcast-Domain zwischen den
(separaten, teils unterschiedlichen Hetzner-Produkten zugehörigen) Nodes,
BGP-Mode bräuchte Peering mit Hetzners Netz — beides für gemietete Server nicht
gegeben/verfügbar. MetalLB würde ein Problem lösen, das hier nicht existiert,
bei deutlich größerem Architektur-Footprint (neue CRDs, Speaker-Pods).

PROXY-Protocol-Passthrough (ebenfalls in der Ticket-Beschreibung genannt) bleibt
verworfen: `klipper-lb:v0.4.17` bietet laut Env-Var-Inspektion keine Option dafür.

---

## Gewählte Lösung: `ports.*.hostPort` (Chart-nativ) statt `hostNetwork: true`

`prod/traefik-values.yaml` (committed im T001328-PR) enthält bereits:

```yaml
ports:
  web:
    hostPort: 80
  websecure:
    hostPort: 443
updateStrategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 1
    maxSurge: 0
```

Das ist der vom Traefik-Helm-Chart vorgesehene Mechanismus für genau diesen
Anwendungsfall (DaemonSet + direkter Host-Port-Bind ohne `Service`/`NodePort`-Hop)
— kubelet richtet dafür eine einzelne iptables-DNAT-Regel `hostIP:hostPort →
podIP:containerPort` ein. Eine einzelne DNAT-Regel ändert nur das Ziel, nicht die
Quelle — anders als `klipper-lb`s zweistufiges Design (DNAT **plus** eigenständige
Re-Origination beim Forward zum NodePort) geht die Client-IP hier nicht verloren.

**Bewusst nicht gewählt:** `hostNetwork: true` auf dem Pod. Funktional ähnlich,
aber größerer Blast Radius (Pod teilt sich die komplette Host-Netzwerk-Namespace,
nicht nur Port 80/443; bräuchte zusätzlich `dnsPolicy: ClusterFirstWithHostNet`
und eine Neubewertung von IPv6/Dual-Stack-Verhalten). `ports.*.hostPort` erreicht
dasselbe Ziel mit kleinerem, präziser scoped Footprint und ist bereits Chart-Standard.

**Warum dieser Fix bei T001328 trotz committetem File live nie ankam:** Task 4
(manueller Rollout) wendete laut `tasks.md` nur `deployment.kind=DaemonSet` +
`affinity` + (später) `externalTrafficPolicy=Local` per gezielten `--set`-Flags
an — `ports.*.hostPort`/`updateStrategy` aus derselben Datei wurden nie in einen
`helm upgrade`-Befehl übernommen. Live-Check bestätigt: `kubectl --context fleet
-n kube-system get helmchartconfig traefik -o yaml` zeigt aktuell keine
`ports.web`/`ports.websecure`-Keys.

---

## Neu identifizierte Lücke: fehlender `service.spec.type`-Override

`prod/traefik-values.yaml` hat **keinen** `service.spec.type`-Override — der
Traefik-Chart-Default bleibt `LoadBalancer`. Ohne eine Änderung hier bleibt
`klipper-lb` (k3s' ServiceLB-Controller reagiert auf jeden `type: LoadBalancer`-
Service) aktiv und sein `svclb-traefik`-DaemonSet beansprucht **dieselben**
hostPorts 80/443 auf denselben 3 Nodes, die der neue Traefik-`hostPort`-Bind
braucht. Kubernetes' Scheduler verhindert eine doppelte `hostPort`-Belegung auf
demselben Node (`0/3 nodes are available: 3 node(s) didn't have free ports for
the requested pod ports`) — die neuen Traefik-Pods blieben ohne diese Änderung
dauerhaft `Pending`.

Diese Lücke existierte bereits in T001328s ursprünglichem Design (dessen
Traffic-Flow-Diagramm `svclb-traefik` weiterhin als festen Bestandteil zeigt) —
nicht nur ein Ausführungsfehler von Task 4, sondern eine im ursprünglichen Plan
nie adressierte Voraussetzung.

**Fix:** `service.spec.type: ClusterIP` zu `prod/traefik-values.yaml` ergänzen.
k3s' ServiceLB-Controller entfernt daraufhin automatisch das `svclb-traefik`-
DaemonSet (reaktiv, beobachtet `type: LoadBalancer`-Services) und gibt die
hostPorts 80/443 auf allen 3 Nodes frei.

---

## Wichtiger Sequenzierungs-Risk

Der Service-Type-Wechsel ist eine cluster-weite, atomare Eigenschaft (keine
Node-Granularität). Würde er **separat vor** dem `ports.*.hostPort`-Rollout
angewendet (wie bei T001328s zweistufigem Vorgehen), entstünde eine Lücke: alte
Traefik-Pods (noch ohne hostPort) verlieren ihren einzigen öffentlichen
Eintrittspunkt (klipper-lb), bevor die neuen hostPort-Pods bereitstehen — ein
Outage für **beide** Brands auf allen 3 Nodes gleichzeitig.

**Reihenfolge ist daher genau umgekehrt zu T001328 zu handhaben:**
`service.spec.type: ClusterIP` **und** `ports.*.hostPort`/`updateStrategy` werden
in **einem einzigen** `kubectl patch helmchartconfig/traefik`-Aufruf appliziert
(eine `valuesContent`-Änderung) — nicht in zwei manuell verzögerten Schritten mit
Verifikationspause dazwischen, wie bei T001328 (vermutlich genau diese Aufteilung
führte dort dazu, dass `ports`/`updateStrategy` schlicht vergessen wurden).

**Mechanismus-Korrektur ggü. T001328s `tasks.md`:** Jenes Dokument listete
`helm upgrade traefik traefik/traefik -n kube-system --reuse-values --set ...`
als Rollout-Befehl. Live-Inspektion in diesem Ticket zeigt: `kube-system/traefik`
läuft als k3s-natives **Addon** (`HelmChart`-Objekt mit
`objectset.rio.cattle.io/owner-gvk: k3s.cattle.io/v1, Kind=Addon`), reconciled
durch k3s' eigenen `helm-controller` — dieser merged `HelmChart.spec.valuesContent`
(Basis-Defaults) mit `HelmChartConfig.spec.valuesContent` (unsere Overrides) und
führt intern selbst die `helm upgrade` aus (sichtbar an `helm -n kube-system
history traefik`, dessen Revisionen aus genau diesen Controller-Reconciles
stammen, nicht aus manuell ausgeführten `helm upgrade --set`-Befehlen). Ein
direkter `helm upgrade traefik traefik/traefik --set ...` über die `helm`-CLI
würde vom Controller beim nächsten Reconcile (z. B. Node-Reboot, k3s-Upgrade,
jede künftige `HelmChartConfig`-Änderung) stillschweigend überschrieben, sofern
die Änderung nicht auch in `HelmChartConfig/traefik` steht — exakt das Muster,
das schon einmal zum Verlust von `ports`/`updateStrategy` führte. **Einzig
korrekter Rollout-Weg:** `kubectl patch helmchartconfig traefik -n kube-system
--type merge -p '{"spec":{"valuesContent":"..."}}'` (oder `kubectl apply -f`
einer aktualisierten `HelmChartConfig`-Manifest-Datei).

Echte Canary-Granularität bleibt dennoch erhalten — auf Ebene des DaemonSet-
RollingUpdates selbst (`updateStrategy.maxUnavailable: 1`, sequenziell node-für-
node von Natur aus). Nach dem kombinierten Apply wird der Rollout aktiv
beobachtet; nach dem **ersten** gerollten Node erfolgt sofortige Verifikation
(`curl --resolve` gegen dessen Public-IP, Pocket-ID-Logs auf reale Client-IP),
**bevor** Node 2/3 folgen. Bei Auffälligkeiten: sofortiger Rollback
(`service.spec.type: LoadBalancer` wiederherstellen — klipper-lb kommt zurück,
alter Zustand ist sicher/bekannt).

---

## Ziel

Pocket ID (und implizit jeder andere Service hinter Traefik) sieht die echte
Client-IP. Keine netzwerkweiten 429-Fehler mehr durch geteilte Pseudo-IPs.
Abschluss der mit T001328 begonnenen, aber unvollständig ausgerollten Topologie.

---

## Nicht im Scope

- MetalLB-Migration — siehe „Verworfene Alternative" oben.
- PROXY-Protocol — siehe „Verworfene Alternative" oben.
- Traefik-Rate-Limiter-Middleware (`rate-limit-auth`) anpassen.
- Dev/k3d (`k3d-mentolder-dev`): Single-Node-Docker-Cluster reproduziert weder
  den ursprünglichen Bug (kein Cross-Node-SNAT-Hop) noch lässt sich `hostPort`
  auf echten Host-NICs dort sinnvoll nachstellen (Docker-Netzwerk-Isolation).
  Keine Änderung an `k3d/traefik-config.yaml` (dev-HelmChartConfig) nötig.
- Metrics-Port (9101): kein `hostPort`, bleibt unverändert über `ClusterIP`
  erreichbar.
- `healthCheckNodePort`: wird mit `type: ClusterIP` automatisch von Kubernetes
  nicht mehr vergeben/genutzt — keine explizite Aktion nötig.
- `externalTrafficPolicy: Local` (aus T001328) im File belassen — unter
  `type: ClusterIP` wirkungslos, aber harmlos; kein Cleanup-Scope für diesen PR.

---

## Lösungsansatz

1. **`prod/traefik-values.yaml`** — `service.spec.type: ClusterIP` ergänzen
   (einzige inhaltliche Änderung; `ports`/`updateStrategy` existieren bereits).
2. **`tests/spec/fleet-operations.bats`** — neue `@test`-Blöcke für
   `service.spec.type`, `ports.web.hostPort`, `ports.websecure.hostPort`,
   `updateStrategy.rollingUpdate.maxUnavailable`/`maxSurge` (bisher ungetestet,
   trotz teilweise bereits committetem Inhalt — `service.spec.type` ist der
   einzige Test, der wirklich rot startet, da der Key noch fehlt; die anderen
   dienen als Regressionsschutz für bereits committeten, aber bisher
   ungetesteten Inhalt).
3. **Manueller Produktions-Rollout-Task** (wie bei T001328 — `kube-system/
   traefik` ist ein k3s-Addon, `HelmChartConfig`-verwaltet, kein Kustomize/
   GitOps) — kombinierter `kubectl patch helmchartconfig/traefik` (Service-Type
   + hostPort + updateStrategy in einem `valuesContent`-Patch), aktive Rollout-
   Beobachtung mit Stop-Punkt nach dem ersten Node, Rollback-Befehl dokumentiert
   in `tasks.md`.

---

## Geänderte Dateien (Überblick)

| Datei | Änderung |
|-------|----------|
| `prod/traefik-values.yaml` | `service.spec.type: ClusterIP` ergänzt |
| `tests/spec/fleet-operations.bats` | 4 neue `@test`-Blöcke (Service-Type, hostPort×2, updateStrategy) |
| `openspec/changes/traefik-hostport-clientip/{proposal,tasks}.md` | Root-Cause + Plan für diesen Fix |
