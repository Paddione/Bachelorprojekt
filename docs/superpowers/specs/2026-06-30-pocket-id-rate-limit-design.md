---
ticket_id: T001328
plan_ref: openspec/changes/pocket-id-rate-limit/tasks.md
status: active
date: 2026-06-30
---

# Design Spec: Pocket ID Rate-Limit — Real-IP Forwarding (REVISION 2)

**Datum:** 2026-06-30
**Ticket:** T001328
**Branch:** fix/t001328-pocket-id-rate-limit
**Status:** active — ersetzt die ursprüngliche Analyse vollständig (siehe „Warum Revision 2" unten)

---

## Warum Revision 2

Die ursprüngliche Analyse (siehe Git-Historie dieser Datei) ging davon aus, dass
Traefik den `X-Forwarded-For`-Header mangels `forwardedHeaders`-Konfiguration
gar nicht erst setzt, und schlug vor, `forwardedHeaders.insecure: true` an der
Traefik `IngressRoute` (dev) bzw. eine entsprechende Annotation am
Kubernetes-`Ingress` (prod) zu ergänzen.

Beim Implementierungsversuch wurde verifiziert (offizielle Traefik-Doku +
Go-Source `ingressroute.go` + Annotations-Referenz):

- `IngressRouteSpec` kennt **nur** `Routes`, `EntryPoints`, `TLS` — kein
  `forwardedHeaders`-Feld. Würde von Kubernetes/Traefik beim Apply ignoriert.
- Die unterstützten `traefik.ingress.kubernetes.io/router.*`-Annotationen
  decken `entrypoints/middlewares/priority/tls/observability` ab — keine
  `forwardedHeaders`-Annotation existiert.

`forwardedHeaders` ist in Traefik ausschließlich eine **EntryPoint-(statische)
Konfiguration** — architektonisch bedingt, da die Vertrauensentscheidung beim
Verbindungsaufbau fällt, bevor Routing überhaupt stattfindet. Pro-Router/
Pro-Ingress ist sie nicht einstellbar.

Ein Live-Check auf dem Fleet-Cluster zeigte zudem, dass die ursprüngliche
Root-Cause-Annahme selbst falsch war (siehe unten) — das Problem liegt nicht
bei Traefik→Pocket-ID, sondern eine Ebene davor.

---

## Verifizierte Root Cause

```bash
kubectl --context fleet -n workspace-korczewski logs deploy/pocket-id --tail=200
```

zeigt für echte Browser-Requests (`user_agent=Mozilla/5.0 ...`) `ip=`-Werte wie
`10.42.0.125`, `10.42.1.106`, `10.42.2.136` — **nicht** Traefiks eigene Pod-IP
(`10.42.0.220`), sondern exakt die Pod-IPs der `svclb-traefik-*`-Pods
(k3s ServiceLB / „Klipper LB", DaemonSet in `kube-system`, läuft auf allen
6 Fleet-Knoten):

```
kube-system   svclb-traefik-861f0436-2xbnl   10.42.0.125   pk-hetzner-4
kube-system   svclb-traefik-861f0436-5js9v   10.42.2.136   pk-hetzner-8
kube-system   svclb-traefik-861f0436-nx8c8   10.42.1.106   pk-hetzner-6
```

### Tatsächlicher Traffic-Flow (prod, fleet)

```
Client → Hetzner-Node-IP:80/443 (DNS round-robin auf pk-hetzner-4/6/8,
         KEIN Hetzner-LB davor)
       → svclb-traefik Pod (Klipper LB, hostPort-Listener auf diesem Node)
       → iptables-Forward zur Traefik-Service-ClusterIP
       → kube-proxy (Service `kube-system/traefik`, externalTrafficPolicy: Cluster)
       → Traefik-Pod (aktuell: Deployment mit 1 Replica auf pk-hetzner-4)
       → Pocket-ID-Service → Pocket-ID-Pod
```

`kube-proxy` SNATed den Traffic beim Forward zur Service-ClusterIP, sobald
`externalTrafficPolicy: Cluster` (Standard) gilt — die echte Client-IP geht
**bevor Traefik sie je sieht** verloren. Traefik selbst forwarded
`X-Forwarded-For` korrekt nach Default-Verhalten (hängt seine eigene
beobachtete `RemoteAddr` an) — der Wert ist nur bereits falsch, weil
`RemoteAddr` schon die `svclb`-Pod-IP ist, nicht die echte Client-IP.

Bestätigt:
```bash
kubectl --context fleet -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'
# → Cluster
```

Klipper LB (`svclb`) unterstützt kein PROXY-Protocol (bestätigt über
k3s-io/k3s GitHub Discussions/Issues — "the only stable solution is proxy
protocol, klipper does not inject these headers"). Die Standardlösung für
genau dieses bekannte k3s-ServiceLB-Verhalten ist
**`externalTrafficPolicy: Local`** auf dem betroffenen `Service`.

### Pocket-ID-Seite ist bereits korrekt konfiguriert

`k3d/pocket-id.yaml` setzt bereits `TRUST_PROXY: "true"` — laut Pocket-ID-Doku
vertraut das *allen* Proxies und extrahiert die Client-IP aus
`X-Forwarded-For`/`X-Real-IP`. Sobald dieser Header die echte IP enthält,
braucht Pocket ID **keine weitere Änderung**. `TRUSTED_PROXIES` (Ansatz B der
Revision 1) ist zudem kein unterstützter Pocket-ID-v2.9.0-Env-Var (Upstream-PR
#265 wurde nie gemerged) — Streichen aus dem Plan.

---

## Komplikation: Traefik-Service ist nicht GitOps/Kustomize-verwaltet

Der `kube-system/traefik`-Service wird **nicht** über `k3d/` oder `prod*/`
Kustomize-Overlays verwaltet — er entsteht imperativ über
`helm install traefik traefik/traefik -n kube-system ...` in
`prod/cloud-init.yaml`, das nur **einmalig beim Node-Bootstrap** läuft.

Zwei Konsequenzen:

1. **Bereits laufende Fleet-Knoten** sind von einem Repo-Merge nicht betroffen
   — ein Fix im Repo wirkt erst bei *künftigen* Node-Neuanlagen/Cluster-
   Rebuilds. Für den sofortigen Effekt auf den **laufenden** Fleet-Cluster ist
   ein manueller `helm upgrade` nötig (siehe Tasks).
2. Der bisherige Code-Pfad nutzt inline `--set`-Flags (kein Values-File). Die
   bislang ungenutzte (durch `grep` bestätigt: 0 Referenzen im Repo)
   `prod-korczewski/traefik-values.yaml` beschreibt zwar bereits eine
   `DaemonSet`+Node-Affinity-Topologie auf `pk-hetzner-4/6/8` — wird aber
   nirgends tatsächlich angewendet. Der laufende Cluster ist aktuell ein
   **Single-Replica-`Deployment`** (bestätigt: `kubectl get deployment -n
   kube-system traefik` → `1/1`), nicht das dort beschriebene DaemonSet.

### Wichtiger Sequenzierungs-Risk

`externalTrafficPolicy: Local` lässt `kube-proxy` Verbindungen auf Knoten
**ohne lokalen Backend-Pod** verwerfen. Mit der aktuellen Topologie (1
Traefik-Pod auf `pk-hetzner-4`, aber DNS verteilt auf alle drei
`pk-hetzner-4/6/8`) würde ein blindes Umschalten auf `Local` **~2/3 des
Ingress-Traffics für beide Brands stillschweigend verwerfen** — ein
Outage, kein Fix.

**Reihenfolge ist zwingend:**
1. Traefik-Topologie zuerst auf alle drei öffentlichen Knoten ausweiten
   (DaemonSet + Node-Affinity auf `pk-hetzner-4/6/8` — funktional neutral
   unter `externalTrafficPolicy: Cluster`, da Service-Routing weiterhin über
   alle Pods load-balanced).
2. Verifizieren, dass Ingress für beide Brands weiterhin funktioniert
   (3 Traefik-Pods statt 1, kein Verhaltenswechsel erwartet).
3. **Erst danach** `externalTrafficPolicy: Local` setzen.
4. Verifizieren: `ip=`-Werte in Pocket-ID-Logs sind echte externe Client-IPs;
   alle drei öffentlichen IPs (`204.168.244.104`, `37.27.251.38`,
   `62.238.23.79`) sind weiterhin erreichbar.

Rollback (jederzeit): `helm upgrade traefik traefik/traefik -n kube-system
--reuse-values --set service.spec.externalTrafficPolicy=Cluster` (Topologie-
Änderung muss nicht zurückgerollt werden — DaemonSet auf 3 Knoten ist auch
unter `Cluster`-Policy sicher/neutral).

---

## Ziel

Pocket ID (und implizit jeder andere Service hinter `auth.${PROD_DOMAIN}`,
`files.${PROD_DOMAIN}` etc., die clientseitiges Rate-Limiting/Logging nach
IP betreiben) sieht die echte Client-IP. Keine netzwerkweiten 429-Fehler
mehr durch geteilte Pseudo-IPs.

---

## Nicht im Scope

- Traefik-Rate-Limiter-Middleware (`rate-limit-auth`) anpassen.
- Migration weg von k3s ServiceLB (z. B. MetalLB) — größerer, separater
  Architektur-Change; `externalTrafficPolicy: Local` löst das konkrete
  Problem ohne diese Migration.
- Pocket-ID-Version-Upgrade.
- Dev/k3d: Single-Node-Cluster hat keinen Cross-Node-SNAT-Hop und reproduziert
  den Bug nicht — keine Änderung an `k3d/pocket-id.yaml` nötig (`TRUST_PROXY`
  ist dort bereits korrekt gesetzt und ausreichend, sobald X-Forwarded-For
  stimmt).
- `k3d/pocket-id.yaml` / `prod/ingress.yaml`: **keine Änderung** — die
  Felder, die Revision 1 dort ergänzen wollte, existieren nicht in Traefiks
  Schema (siehe oben).

---

## Lösungsansatz

1. **`prod/traefik-values.yaml` (neu)** — konsolidiert die bisher tote
   `prod-korczewski/traefik-values.yaml` mit den inline-`--set`-Flags aus
   `prod/cloud-init.yaml` zu einer einzigen, testbaren Quelle: `deployment.kind:
   DaemonSet`, Node-Affinity auf `pk-hetzner-4/6/8`, `ports.web/websecure.hostPort`,
   `ingressRoute.dashboard.enabled: false`, **neu:** `service.spec.externalTrafficPolicy: Local`.
2. **`prod/cloud-init.yaml`** — Helm-Install-Zeile auf `-f traefik-values.yaml`
   umstellen (Datei wird wie `install-dev-tools.sh` per `curl` aus dem Repo
   geholt), damit künftige Node-Bootstraps/Cluster-Rebuilds die korrekte
   Topologie + Policy direkt erhalten.
3. **`prod-korczewski/traefik-values.yaml`** — entfernen (toter Code, durch
   `prod/traefik-values.yaml` ersetzt; 0 Referenzen im Repo bestätigt).
4. **Manueller Rollout-Task (nicht automatisiert)** — `helm upgrade` in zwei
   Schritten gegen den laufenden Fleet-Cluster, mit Verifikation und
   Rollback-Befehl dokumentiert in `tasks.md`. Dies ist **kein** Teil des
   automatisierten PR-Merge/Deploy-Pfads (kein Kustomize-Tracking für diesen
   Service) und muss bewusst von einem Menschen/Ops-Agenten ausgeführt werden.
5. **`tests/spec/pocket-id-rate-limit.bats`** — überarbeitet auf das, was
   offline/CI tatsächlich prüfbar ist: Manifest-Struktur-Assertions gegen
   `prod/traefik-values.yaml` (yq) + Regression-Guard, dass
   `prod/cloud-init.yaml` diese Datei tatsächlich referenziert. **Kein**
   Live-Cluster-Verhalten in CI testbar (kein Cluster in CI) — das wird
   stattdessen explizit als manueller Verifikationsschritt im Rollout-Task
   dokumentiert.

---

## Geänderte Dateien (Überblick)

| Datei | Änderung |
|-------|----------|
| `prod/traefik-values.yaml` | NEU — DaemonSet + Node-Affinity + `externalTrafficPolicy: Local` |
| `prod/cloud-init.yaml` | Helm-Install nutzt `-f traefik-values.yaml` (curl-geholt) statt inline `--set` |
| `prod-korczewski/traefik-values.yaml` | ENTFERNT — totes File, ersetzt durch `prod/traefik-values.yaml` |
| `tests/spec/pocket-id-rate-limit.bats` | NEU/ÜBERARBEITET — Manifest-Struktur-Test statt Live-Verhalten |
| `openspec/changes/pocket-id-rate-limit/{proposal,tasks}.md` | Root-Cause + Plan korrigiert |
