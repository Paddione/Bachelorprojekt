# ADR-003: Brand-Namespace-Split — Multi-Mandanten via Kubernetes-Namespaces

**Status:** Accepted  
**Datum:** 2026-05-05  
**Ticket:** T001298

## Kontext

Das Projekt betreibt zwei voneinander getrennte Marken (mentolder.de, korczewski.de) auf derselben Plattform. Beide Marken haben eigene Keycloak-Realms, eigene Nextcloud-Instanzen, eigene Domains und eigene Secrets. Die Frage ist, auf welcher Abstraktionsebene die Isolation umgesetzt wird.

Optionen:
1. Separate Cluster pro Marke (höchste Isolation, höchster Betriebsaufwand).
2. Namespace-Trennung im selben Cluster (mittlere Isolation, niedrigerer Aufwand).
3. Ein Namespace mit Label-basierter Trennung (geringste Isolation, nicht gewählt).

## Entscheidung

Die Marken werden durch Kubernetes-Namespaces getrennt: `workspace` (mentolder) und `workspace-korczewski` (korczewski). Alle marken-sensitiven Tasks exportieren `WORKSPACE_NAMESPACE` und verwenden `${WORKSPACE_NAMESPACE:-workspace}` konsequent. Keine Ressource hardcodet `-n workspace`.

ENV-Aliase: `ENV=mentolder` = `ENV=fleet-mentolder`, `ENV=korczewski` = `ENV=fleet-korczewski` — beide zeigen auf den `fleet`-Kontext.

## Konsequenzen

**Positive Konsequenzen:**
- Ein einziger Fleet-Cluster statt zwei Cluster — Betriebsaufwand halbiert.
- Namespace-RBAC trennt Workloads: kein Pod aus `workspace-korczewski` kann direkt auf Secrets in `workspace` zugreifen.
- Cross-cutting-Ressourcen (shared-db, cert-manager, Sealed Secrets Controller) sind einmalig vorhanden.

**Negative Konsequenzen:**
- Namespace-Isolation ist schwächer als Cluster-Isolation: ein kompromittierter Cluster-Admin hat Zugriff auf beide Namespaces.
- Cross-cutting-Änderungen (DB-Passwort-Rotation, OIDC-Client-Anpassungen) müssen explizit in beiden Namespaces durchgeführt werden.
- `WORKSPACE_NAMESPACE` muss in jedem neuen Task und Skript explizit berücksichtigt werden.

**Implikation für DSGVO:** Daten beider Marken liegen physisch auf denselben Nodes. Die logische Trennung durch Namespaces ist dokumentiert; eine physische Trennung ist für das Bachelorprojekt nicht gefordert.
