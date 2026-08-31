# Proposal: fix-penpot-minio-image

## Purpose

`design.mentolder.de` liefert HTTP 503, obwohl DNS, TLS, Ingress und Flux gesund sind.
Der Penpot-Pod bleibt im `wait-for-minio`-Init-Container hängen, weil der konfigurierte
MinIO-Image-Tag in Docker Hub nicht existiert. Der Fix ersetzt ihn durch einen offiziell
veröffentlichten, vorab verifizierten Multi-Arch-Release und sichert diese Auswahl mit einem
Manifest-Test ab.

## Scope

- MinIO-Image in `k3d/penpot.yaml` auf einen verfügbaren Release setzen.
- Bestehenden Penpot-Manifest-Test um den Regression-Guard erweitern.
- Penpot-Runbook an den tatsächlich ausgelieferten Release anpassen.
- Nach dem Merge den Flux-Rollout sowie HTTP- und OIDC-Einstieg prüfen.

OpenDesign wird nicht in denselben Fix aufgenommen: Es besitzt aktuell keine native
Penpot-Projektanbindung. Die gemeinsame Bewertungsfläche bleibt Penpot; OpenDesign erzeugt
lokale Artefakte, die kontrolliert nach Penpot bzw. in das Repository überführt werden.

