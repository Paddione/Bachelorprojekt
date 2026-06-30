# Proposal: pocket-id-rate-limit

## Warum

Pocket ID verwendet einen internen Rate-Limiter, der Requests pro Client-IP zählt.
Weil Traefik keinen `X-Forwarded-For`-Header an Pocket ID weiterleitet (fehlende
`forwardedHeaders`-Konfiguration), sieht Pocket ID alle Requests von derselben
Cluster-internen IP (kube-proxy/Traefik-Pod-IP). Sobald ein Nutzer das Limit
erreicht, erhalten alle Nutzer HTTP 429 "aus Ihrem Netzwerk".

## Was

`forwardedHeaders.insecure: true` an der Traefik IngressRoute (dev) und am
Kubernetes Ingress (prod) für pocket-id setzen, damit der echte Client-IP via
`X-Forwarded-For` an Pocket ID übergeben wird. Optional ergänzend:
`TRUSTED_PROXIES`-Env mit Cluster-CIDR im Pocket-ID-Deployment.

_Ticket: T001328_
