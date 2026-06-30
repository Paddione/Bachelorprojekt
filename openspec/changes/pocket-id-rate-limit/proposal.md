# Proposal: pocket-id-rate-limit

## Warum (REVISION 2 — siehe Design-Spec für Details)

Pocket ID verwendet einen internen Rate-Limiter, der Requests pro Client-IP
zählt. Live-Diagnose auf dem Fleet-Cluster
(`kubectl --context fleet -n workspace-korczewski logs deploy/pocket-id`)
zeigt: echte Browser-Requests landen mit `ip=`-Werten, die exakt den Pod-IPs
der `svclb-traefik-*`-Pods (k3s ServiceLB „Klipper LB", DaemonSet in
`kube-system`) entsprechen — nicht der echten Client-IP.

**Root Cause:** Der `kube-system/traefik`-Service (`type: LoadBalancer`) hat
`externalTrafficPolicy: Cluster` (Standard). `kube-proxy` SNATed den Traffic
beim Forward von der `svclb`-Klipper-LB-Hop zur Traefik-Service-ClusterIP —
die echte Client-IP geht **bevor Traefik sie überhaupt sieht** verloren.
Traefik selbst forwarded `X-Forwarded-For` korrekt per Default-Verhalten; der
Wert ist nur bereits falsch. Klipper unterstützt kein PROXY-Protocol
(bestätigt über k3s-io/k3s GitHub Discussions). Die Standardlösung für genau
dieses bekannte ServiceLB-Verhalten: `externalTrafficPolicy: Local`.

(Eine erste Analyse-Revision ging von einer fehlenden `forwardedHeaders`-
Konfiguration an der Traefik `IngressRoute`/`Ingress` aus. Beim
Implementierungsversuch wurde verifiziert, dass dieses Feld in Traefiks
Schema gar nicht existiert — weder auf `IngressRoute` noch als
`Ingress`-Annotation; `forwardedHeaders` ist ausschließlich
EntryPoint-/statische Konfiguration. Diese Revision korrigiert die
Root-Cause-Analyse vollständig.)

## Was

`externalTrafficPolicy: Local` auf dem shared `kube-system/traefik`-Service
(beide Brands hängen am selben Traefik). Da `Local` Traffic auf Knoten ohne
lokalen Backend-Pod verwirft, muss die Traefik-Pod-Topologie zuerst alle drei
öffentlichen Knoten abdecken (`pk-hetzner-4/6/8`, DaemonSet statt der aktuell
laufenden Single-Replica-`Deployment`) — sonst Outage statt Fix.

Konkret:
- `prod/traefik-values.yaml` (neu) — konsolidiert die DaemonSet+Affinity-
  Topologie (bisher unbenutzt in `prod-korczewski/traefik-values.yaml`
  dokumentiert, nie angewendet) mit `externalTrafficPolicy: Local`.
- `prod/cloud-init.yaml` — nutzt diese Datei für künftige
  Full-Cluster-Rebuilds statt inline `--set`-Flags.
- `prod-korczewski/traefik-values.yaml` — entfernt (totes File).
- Manueller Rollout-Task (zweistufiges `helm upgrade` gegen den laufenden
  Fleet-Cluster + Verifikation + Rollback) — siehe `tasks.md`. Dies ist kein
  Kustomize-/GitOps-verwalteter Pfad; ein Merge dieses PRs ändert das
  laufende Cluster-Verhalten NICHT automatisch.
- Keine Änderung an `k3d/pocket-id.yaml` oder `prod/ingress.yaml` —
  Pocket ID hat bereits `TRUST_PROXY: "true"` gesetzt und ist damit
  ausreichend konfiguriert, sobald `X-Forwarded-For` korrekt ankommt. Dev/k3d
  (Single-Node) reproduziert den Bug nicht (kein Cross-Node-SNAT-Hop).

_Ticket: T001328_
