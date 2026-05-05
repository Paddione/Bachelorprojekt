# ArgoCD -- GitOps Multi-Cluster Federation

## Uberblick

ArgoCD automatisiert das Deployment aus Git auf mehrere Kubernetes-Cluster nach dem GitOps-Prinzip:

- **Git ist die einzige Quelle der Wahrheit.** Kein manuelles `kubectl apply` auf Produktionsclustern.
- ArgoCD erkennt Abweichungen (Drift) zwischen Git-Zustand und Live-Zustand automatisch und heilt sie.
- ArgoCD selbst lauft auf einem dedizierten **Hub-Cluster** (Hetzner).
- Ein **ApplicationSet** generiert automatisch eine ArgoCD-Application pro registriertem Ziel-Cluster.

**Relevante Dateien:**

- `argocd/applicationset.yaml` -- ApplicationSet + AppProject (zusammen in einer Datei)
- `argocd/install/` -- ArgoCD-Installation: CMP-Plugin, Ingress, Namespace, Server-Patches
- `prod-mentolder/` / `prod-korczewski/` -- Kustomize-Overlays pro Umgebung

---

## Architektur

```
GitHub Repo (main)
       |
       | Git-Sync (automatisch)
       v
  ArgoCD (Hub-Cluster, Hetzner)
       |
       +---> workspace-hetzner     ---> unified mentolder k3s Cluster
       |                                  namespace: workspace       (mentolder.de)
       |                                  namespace: website
       |
       +---> workspace-korczewski  ---> unified mentolder k3s Cluster
                                         namespace: workspace-korczewski  (korczewski.de)
                                         namespace: website-korczewski
```

Seit dem Cluster-Merge (2026-05-05) laufen beide Workloads auf **einem einzigen physischen Cluster** (mentolder). ArgoCD verwaltet sie weiterhin als zwei separate Applications mit unterschiedlichen Overlays (`prod-mentolder/`, `prod-korczewski/`) und Namespaces. Pro Ziel-Cluster-Secret wird eine eigene ArgoCD-Application erzeugt. Jede App zeigt auf das umgebungsspezifische Kustomize-Overlay und injiziert die Cluster-spezifischen Variablen (Domain, Branding, SMTP, TURN usw.) uber das CMP-Plugin.

---

## AppProject

Definiert in `argocd/applicationset.yaml` (gemeinsam mit dem ApplicationSet).

Das AppProject `workspace` legt fest:

- **Erlaubte Repos:** Nur `https://github.com/Paddione/Bachelorprojekt`
- **Erlaubte Cluster:** Alle registrierten Cluster (`server: "*"`)
- **Erlaubte Namespaces:** `workspace`, `workspace-office`, `coturn`, `website`, `kube-system`, `cert-manager`
- **Cluster-scoped Ressourcen:** Alle erlaubt (fur ClusterIssuer, CRDs usw.)
- **Orphaned Resources:** Warnung im UI, wenn Ressourcen im Cluster, aber nicht in Git existieren

Das AppProject ist die Sicherheitsgrenze: ArgoCD darf nur in explizit erlaubten Clustern und Namespaces deployen.

---

## ApplicationSet

Das ApplicationSet `workspace` (in `argocd/applicationset.yaml`) generiert automatisch eine Application fur jeden Cluster mit dem Label `workspace=true`.

**Cluster-Discovery:** Der `clusters`-Generator liest alle bei ArgoCD registrierten Cluster und filtert nach `matchLabels: workspace: "true"`.

**Konfiguration uber Annotationen:** Alle umgebungsspezifischen Werte werden als Annotationen auf den ArgoCD Cluster-Secrets gespeichert -- kein separates ConfigMap pro Umgebung:

| Annotation | Beschreibung |
|------------|-------------|
| `workspace-overlay` | Kustomize-Pfad im Repo (z.B. `prod-mentolder`) |
| `workspace-domain` | Produktionsdomain (z.B. `mentolder.de`) |
| `workspace-brand` | Brand-Name (z.B. `Mentolder`) |
| `workspace-email` | Kontakt-E-Mail-Adresse |
| `workspace-infra-namespace` | Traefik-Middleware-Namespace |
| `workspace-tls-secret` | Name des TLS-Wildcard-Secrets |
| `workspace-smtp-from` | SMTP-Absenderadresse |
| `workspace-turn-ip` | Offentliche TURN-Server-IP |
| `workspace-turn-node` | TURN-Node-Name |

**Sync-Policy:** Automatisches Pruning (geloschte Ressourcen werden entfernt) und Self-Healing (manuelle Anderungen werden zuruckgesetzt).

---

## Ersteinrichtung (einmalig)

**Vollautomatisch (empfohlen):**

```bash
task argocd:setup
```

Fuhrt automatisch durch: install -> Passwort ausgeben -> CLI-Login -> Cluster registrieren -> Apps anwenden.

**Oder manuell Schritt fur Schritt:**

```bash
task argocd:install            # ArgoCD auf Hub-Cluster installieren (CMP-Sidecar inklusive)
task argocd:password           # Initiales Admin-Passwort ausgeben
task argocd:login              # Mit argocd CLI einloggen (setzt Port-Forward voraus)
task argocd:cluster:register   # Produktions-Cluster mit workspace-Labels registrieren
task argocd:apps:apply         # AppProject + ApplicationSet in ArgoCD anwenden
```

Nach dem Setup:
- ArgoCD UI ist unter `https://argocd.<PROD_DOMAIN>` erreichbar
- Die Apps `workspace-hetzner` und `workspace-korczewski` erscheinen automatisch (beide zeigen auf denselben physischen Cluster, unterschiedliche Namespaces)

---

## Tagliche Nutzung

```bash
task argocd:status             # Sync- und Health-Status aller Apps uber alle Cluster
task argocd:sync -- <app>      # Sync manuell auslosen (z.B. workspace-hetzner)
task argocd:diff -- <app>      # Diff: Git-Zustand vs. Live-Zustand
task argocd:ui                 # ArgoCD UI auf http://localhost:8090 weiterleiten
```

**Wann muss ich manuell syncen?**

Normalerweise synchronisiert ArgoCD automatisch bei jedem Push auf `main`. Ein manueller Sync ist nur notig, wenn:
- `syncPolicy.automated` deaktiviert ist
- Ein Sync fehlgeschlagen ist und nach Bugfix neu gestartet werden soll
- Ein sofortiger Sync ohne Warten auf den Poll-Intervall gewunscht wird

---

## Cluster registrieren

Cluster werden als Kubernetes Secrets im `argocd`-Namespace gespeichert, mit Labels und Annotationen fur die Workspace-Konfiguration.

`task argocd:cluster:register` fuhrt folgendes durch:

1. Cluster per argocd CLI zum Hub hinzufugen
2. `workspace=true` Label setzen
3. Alle workspace-Annotationen (Domain, Brand, SMTP, TURN usw.) aus `environments/<name>.yaml` ubertragen

Um einen neuen Cluster hinzuzufugen:

```bash
# kubeconfig muss den neuen Cluster enthalten
task argocd:cluster:register
task argocd:apps:apply         # ApplicationSet neu anwenden
task argocd:status             # Neue App sollte erscheinen
```

---

## CMP-Plugin (Kustomize + envsubst)

Das CMP-Plugin ermoglicht Umgebungsvariablen-Substitution in Kustomize-Manifesten -- unabdingbar, damit ArgoCD die Domain- und Brand-Variablen pro Cluster einsetzen kann.

**Dateien in `argocd/install/`:**

| Datei | Beschreibung |
|-------|-------------|
| `cmp-plugin.yaml` | ConfigMap mit dem Plugin-Skript (kustomize build + envsubst) |
| `patch-repo-server.yaml` | Fugt den CMP-Sidecar-Container zum argocd-repo-server hinzu |
| `patch-argocd-server.yaml` | Konfiguriert den ArgoCD-Server (insecure + root-path) |
| `ingress.yaml` | Traefik-Ingress fur das ArgoCD UI |
| `namespace.yaml` | argocd-Namespace |
| `kustomization.yaml` | Kustomize-Einstiegspunkt fur die Installation |

Das Plugin-Skript fuhrt aus:
1. `kustomize build <overlay>` -- Kustomize-Manifeste generieren
2. `envsubst` -- `${VAR}`-Platzhalter mit Cluster-Annotationen ersetzen

---

## Fehlerbehebung

**App ist OutOfSync:**

```bash
task argocd:diff -- workspace-hetzner   # Genauer Unterschied anzeigen
task argocd:sync -- workspace-hetzner   # Manuell synchronisieren
```

**Sync schlagt fehl -- Manifest-Fehler:**

```bash
task workspace:validate   # Kustomize Dry-Run lokal pruefen
# Fehler beheben, committen, pushen -- ArgoCD synciert automatisch
```

**Cluster nicht erreichbar:**

```bash
# kubeconfig korrekt?
kubectl config get-contexts
# ArgoCD Cluster-Secret vorhanden?
kubectl get secret -n argocd -l argocd.argoproj.io/secret-type=cluster
```

**CMP-Plugin-Fehler:**

```bash
kubectl logs -n argocd deploy/argocd-repo-server -c cmp-server
# Haufige Ursache: envsubst-Variable nicht als Annotation gesetzt
# Loesung: task argocd:cluster:register erneut ausfuehren
```

**Ressource wird nicht geloescht (Pruning-Problem):**

Sicherstellen, dass `syncPolicy.automated.prune: true` gesetzt ist. Im ArgoCD UI kann Pruning auch manuell fur eine einzelne App ausgelost werden.
