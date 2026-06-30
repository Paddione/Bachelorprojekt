---
ticket_id: T001328
plan_ref: openspec/changes/pocket-id-rate-limit/tasks.md
status: active
date: 2026-06-30
---

# Design Spec: Pocket ID Rate-Limit — Real-IP Forwarding

**Datum:** 2026-06-30  
**Ticket:** T001328  
**Branch:** fix/t001328-pocket-id-rate-limit  
**Status:** draft  
**ticket_id:** T001328  
**plan_ref:** openspec/changes/pocket-id-rate-limit/tasks.md

---

## Kontext

Pocket ID (stonith404/pocket-id, v2.9.0) verwendet einen internen Rate-Limiter,
der Requests pro Client-IP zählt. Erreicht ein Client das Limit, antwortet Pocket
ID mit HTTP 429 und der Meldung "aus Ihrem Netzwerk" — ein Synonym dafür, dass
alle aktuellen Requests dieselbe Source-IP teilen.

Seit der Keycloak→Pocket-ID-Migration laufen Auth-Endpunkte über Pocket ID.
Benutzer berichten von netzwerkweiten 429-Fehlern: sobald ein Nutzer das
Rate-Limit erreicht, sind alle anderen Nutzer ebenfalls blockiert.

### Traffic-Flow

```
Browser → Hetzner LB → Traefik (Ingress) → rate-limit-auth Middleware → Pocket ID Service → Pocket ID Pod
```

In dev (k3d):
```
Browser → Traefik (IngressRoute) → Pocket ID Service → Pocket ID Pod
```

### Ist-Zustand

**Pocket ID Deployment** (`k3d/pocket-id.yaml:170-171`):
```yaml
- name: TRUST_PROXY
  value: "true"
```

**Traefik IngressRoute** (`k3d/pocket-id.yaml:277-291`):
```yaml
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`${POCKET_ID_DOMAIN}`)
      services:
        - name: pocket-id
          port: 1411
```
→ Kein `forwardedHeaders`-Block.

**Prod-Ingress** (`prod/ingress.yaml:29-51`):
```yaml
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "...rate-limit-auth@kubernetescrd"
```
→ Keine `forwardedHeaders`-Annotation.

---

## Root Cause

Pocket ID setzt `TRUST_PROXY=true` (Environment-Variable), was dem zugrunde
liegenden Fiber-Webframework signalisiert, den `X-Forwarded-For`-Header zur
Ermittlung der echten Client-IP zu verwenden.

Allerdings fehlt in der Traefik-Konfiguration (sowohl IngressRoute-CRD als auch
Kubernetes-Ingress) die Angabe `forwardedHeaders`. Ohne diese Konfiguration
hängt das Verhalten von der Traefik-Default-Einstellung ab:

- **Traefik v2 Default:** `forwardedHeaders.insecure=false` → Traefik injectiert
  KEINE `X-Forwarded-For`-Header in den Upstream-Request, es sei denn, der Client
  (hier: Hetzner LB) sendet selbst einen. Der Hetzner LB sendet jedoch keinen
  `X-Forwarded-For`-Header.
- **Ergebnis:** Pocket ID erhält keinen `X-Forwarded-For`-Header → fällt zurück
  auf die unmittelbare Verbindungs-IP (kube-proxy / Traefik-Pod-IP).
- **Netzwerkweite 429:** Alle Benutzer teilen sich dieselbe Source-IP → das
  Rate-Limit (20 req/s avg, Pocket ID-intern) wird gemeinschaftlich verbraucht.

---

## Ziel

Pocket ID sieht die echte Client-IP für Rate-Limiting und Logging. Keine
falschen 429-Fehler mehr.

---

## Nicht im Scope

- Traefik-Rate-Limiter (`rate-limit-auth` Middleware) anpassen
- Pocket ID-Version upgraden
- Andere Services mit demselben Problem (nur pocket-id-Ingress)

---

## Lösungsansatz

### Ansatz A: forwardedHeaders am IngressRoute (Dev) + Ingress (Prod)

Der Traefik IngressRoute bekommt `forwardedHeaders.insecure: true`, damit
Traefik den `X-Forwarded-For`-Header setzt. Für das Kubernetes-Ingress (prod)
via Annotation oder Middleware.

### Ansatz B: TRUSTED_PROXIES im Pocket ID Deployment

Pocket ID bekommt eine `TRUSTED_PROXIES`-Env mit den Cluster-CIDR-Ranges
(z.B. `10.42.0.0/16,10.43.0.0/16`), sodass es die Traefik-IP als vertrauens-
würdigen Proxy erkennt und `X-Forwarded-For` akzeptiert.

### Empfohlen: Ansatz A (Primär) + Ansatz B (Defense-in-Depth)

Ansatz A ist zwingend (ohne forwardedHeaders setzt Traefik gar keinen
`X-Forwarded-For`). Ansatz B stellt sicher, dass Pocket ID den Header auch
tatsächlich auswertet, falls `TRUST_PROXY` ohne `TrustedProxies`-Liste
nicht alle Proxies als vertrauenswürdig einstuft.

---

## Geänderte Dateien (Überblick)

| Datei | Änderung |
|-------|----------|
| `k3d/pocket-id.yaml` | `forwardedHeaders.insecure: true` im IngressRoute + ggf. `TRUSTED_PROXIES`-Env |
| `prod/ingress.yaml` | `forwardedHeaders`-Annotation für auth-Ingress |
| `prod/patch-pocket-id.yaml` | Alternative: IngressRoute forwardedHeaders |
| `environments/schema.yaml` | Ggf. neuen Env-Key eintragen |
