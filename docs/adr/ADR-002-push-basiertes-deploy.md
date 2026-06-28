# ADR-002: Push-basiertes Deploy — kein GitOps-Reconciler im Cluster

**Status:** Accepted  
**Datum:** 2026-04-01  
**Ticket:** T001298

## Kontext

Kubernetes-Produktivumgebungen verwenden typischerweise einen GitOps-Reconciler (Flux CD, Argo CD), der Änderungen im Git-Repository automatisch auf den Cluster anwendet. Für dieses Projekt wurde diese Option evaluiert.

Rahmenbedingungen des Projekts:
- Bachelorarbeit-Kontext: überschaubare Komplexität, kein Teamfehler durch verpasste Deploys.
- Zwei Marken-Namespaces mit leicht unterschiedlichen Konfigurationen.
- Bestehende Taskfile-Infrastruktur (`task workspace:deploy`) bereits etabliert.
- Cluster-Ressourcen begrenzt (kein dedizierter Reconciler-Node).

## Entscheidung

Das Projekt verzichtet auf einen in-cluster GitOps-Reconciler. Deployments erfolgen ausschließlich push-basiert:

- `task workspace:deploy ENV=<brand>` — manuell oder via CI/CD nach Merge.
- `build-website*.yml` GitHub Actions — automatischer Push nach `website/**`-Änderungen auf main.
- Kein `flux-system`-Namespace, kein Argo-Controller auf dem Fleet-Cluster.

## Konsequenzen

**Positive Konsequenzen:**
- Keine Reconciler-Latenz: Änderungen werden sofort beim Deploy-Aufruf wirksam.
- Einfachere Fehlersuche: kein separates Reconciler-Logging, kein Drift-Detection-Overhead.
- Ressourcenschonung auf dem Cluster.
- Volle Kontrolle: kein automatisches Rollback durch einen Reconciler, der unerwünschte Zustände korrigiert.

**Negative Konsequenzen:**
- Kein automatischer Drift-Schutz: manuelle Änderungen am Cluster (`kubectl apply`, `kubectl edit`) werden nicht automatisch zurückgesetzt.
- Ein vergessener Deploy nach Merge führt zu einem Cluster-Zustand, der nicht dem main-Branch entspricht.
- Skaliert schlechter bei vielen simultanen Deployments.

**Mitigierung:** `task workspace:deploy` wird nach jedem Merge auf main explizit in der CI-Dokumentation und im CLAUDE.md-Gotchas-Abschnitt als Pflichtschritt dokumentiert.
