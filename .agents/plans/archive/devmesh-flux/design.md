# Design: Flux auf devmesh, Dev-Stack weg von fleet

Stand 2026-10-21. Pfad: feature. Slug: `devmesh-flux`.

## Ziel

`fleet` (Gekkos Hetzner-Knoten `gekko-hetzner-2/3/4`) wird nach Runbook
gekko32/mentolder-prod#18 neu aufgesetzt. Danach läuft dort nichts mehr aus
Paddione/Bachelorprojekt. Der eigene Cluster `devmesh` bekommt ein eigenes,
von fleet und mentolder unabhängiges Flux. Der Dev-Stack, der heute auf fleet
im Namespace `workspace-dev` läuft, zieht nach devmesh, soweit er dort noch
gebraucht wird.

Erfolg:

- Auf devmesh synchronisiert Flux den ganzen devmesh-Stack aus einem eigenen,
  signierten OCI-Artefakt. `flux get kustomizations -A` ist grün.
- `dev-pod` läuft auf devmesh und ist per SSH über das Tailnet erreichbar.
- Auf fleet gibt es keine Kustomization `flux-dev` oder `flux-dev-pod` mehr.
- Kein Manifest im devmesh-Artefakt referenziert `mentolder.de`, fleet oder
  `fleet-manifests`.

## Entscheidungen des Nutzers

| ID | Entscheidung |
|---|---|
| Q1 | Dev-Stack von fleet nach devmesh: ja |
| Q2 | Flux auf devmesh: ja |
| Q3 | fleet-Neuaufbau macht Gekko, danach Phase 9 (mentolder-Anteile aus Bachelorprojekt entfernen), nicht Teil dieses Features |
| Q4 | Erreichbarkeit: vorerst nur Tailnet/LAN. Öffentlich später die eigene Prod-Website und brainstorm, eigenes Folge-Feature |
| Q5 | Flux verwaltet den ganzen devmesh-Stack aus einem eigenen OCI-Artefakt (O1) |

## Ist-Stand

- fleet, Namespace `workspace-dev`, aus `fleet-manifests` über `flux-dev`
  (`prod-fleet/dev` → `k3d/dev-stack`) und `flux-dev-pod`
  (`prod-fleet/dev-pod` → `k3d/dev-pod`), beide `prune: true`:
  `dev-pod`, `website:dev`, `sdlc-console`, `sish`, `oauth2-proxy-dev`,
  `oauth2-proxy-brainstorm`, `oauth2-proxy-session-hub`, `shared-db-dev`.
  Hosts: `dev.mentolder.de`, `*.dev.mentolder.de`, `brainstorm.mentolder.de`.
- `brainstorm` und Session-Hub sind ForwardAuth-Tore vor sish-Tunneln, ohne
  eigenes Backend.
- `shared-db-dev` enthält nur leere Datenbanken (je ca. 7 MB).
- devmesh hat kein Flux. Deploy per `task devmesh:deploy`
  (`scripts/devmesh/render-stack.sh` rendert `dev-local/<DEVMESH_PROFILE>`,
  Profil `core`, dazu helm für cert-manager und lego-webhook, SealedSecrets aus
  `environments/sealed-secrets/dev.yaml`). devmesh betreibt bereits `website`,
  `sdlc-console`, `shared-db`, `llm-services` (mit `mcp-node`, `repo-sync`)
  und den tailscale-operator.
- ADR-008 Punkt 2 sieht `workspace-dev` auf fleet als öffentliche
  Referenzumgebung vor. Diese Entscheidung wird abgelöst.

## Design

### 1. Was umzieht, was entfällt

| Teil | Entscheidung | Grund |
|---|---|---|
| `dev-pod` | zieht um, Overlay `dev-local/components/dev-pod` | einziger Teil ohne devmesh-Gegenstück |
| PVC `dev-pod-home` (20 Gi), `dev-pod-repo` (5 Gi) | Daten einmalig kopieren | Home und Repo-Stand des Nutzers |
| `website:dev`, `sdlc-console`, `oauth2-proxy-dev` | entfallen | devmesh hat `website` und `sdlc-console` |
| `shared-db-dev` | entfällt, kein Datenumzug | leer; `dev-pod` nutzt `shared-db` in `workspace` |
| `sish`, `oauth2-proxy-brainstorm`, `oauth2-proxy-session-hub` | entfallen | ohne öffentlichen Zugang ohne Zweck, kommen mit dem Folge-Feature (Q4) |

`dev-pod` auf devmesh: Namespace `workspace`, DB-URL auf
`shared-db.workspace.svc.cluster.local` (Datenbank `website`), Secret aus den
vorhandenen devmesh-Secrets statt `shared-db-dev-secrets`. SSH über einen
Service mit `tailscale.com/expose: "true"` (Muster `dev-local/lan-dns`), kein
öffentlicher Port, `DEV_SSH_ALLOWLIST` entfällt auf devmesh. `repo-sync` klont
weiter `Paddione/Bachelorprojekt`.

### 2. Rendering und Artefakt

- `scripts/devmesh/render-stack.sh` wird die einzige Render-Logik für devmesh.
  Neuer Modus `--out <dir>`: schreibt das gerenderte Manifest nach
  `<dir>/workspace/stack.yaml` statt nach stdout (stdout-Modus bleibt für
  `task devmesh:deploy`).
- Plattform-Teile, die heute nur im Task stehen (cert-manager, lego-webhook,
  sealed-secrets-controller, `dev-local/cluster/tls.yaml`), werden als
  Manifeste bzw. Flux-`HelmRelease` unter `dev-local/platform/` beschrieben und
  nach `<dir>/platform/` gerendert. Die SealedSecrets aus
  `environments/sealed-secrets/dev.yaml` gehen nach `<dir>/secrets/`.
- Neuer Workflow `.github/workflows/render-devmesh-artifact.yml`:
  Trigger Push auf `main` mit Pfaden `dev-local/**`, `k3d/**`,
  `environments/dev.yaml`, `environments/sealed-secrets/dev.yaml`,
  `devmesh/**`, `scripts/devmesh/**`, `flux/clusters/devmesh/**` sowie
  `workflow_dispatch`. Rendert mit Dummy-Secrets (`scripts/ci-dummy-secrets.sh`),
  pusht `ghcr.io/paddione/devmesh-manifests:latest` (+ `sha-<commit>`), signiert
  keyless per cosign. Das Paket bleibt privat.
- Render-Gate im Workflow: kein `mentolder.de`, kein `fleet-manifests`, keine
  `${VAR}`-Reste, Placeholder-Digests verboten (bestehende Guards aus
  `flux-render-artifact.sh` wiederverwenden).

### 3. Flux auf devmesh

- Installation per flux-operator (wie fleet) mit `FluxInstance` aus
  `flux/clusters/devmesh/flux-instance.yaml`. Sync: `GitRepository`
  `Paddione/Bachelorprojekt`, `ref: refs/heads/main`, `path: flux/clusters/devmesh`.
- `flux/clusters/devmesh/`:
  - `oci-source.yaml`: `OCIRepository` `devmesh-manifests`, `interval: 5m`,
    cosign-Prüfung auf `render-devmesh-artifact.yml@refs/heads/main`,
    Pull-Secret `ghcr-auth`.
  - `bootstrap/ghcr-auth-sealedsecret.yaml`: mit dem devmesh-Controller-Schlüssel
    versiegelt (read:packages-Token).
  - `ks-platform.yaml` (`./platform`), `ks-secrets.yaml` (`./secrets`,
    `dependsOn: platform`), `ks-workspace.yaml` (`./workspace`,
    `dependsOn: secrets`). `prune: true`, `wait: true`.
- Kein Receiver (devmesh ist nicht öffentlich), Flux pollt.
- Übernahme bestehender Objekte: Flux wendet per Server-Side-Apply an und
  übernimmt die per `kubectl apply` angelegten Objekte als zusätzlicher
  Feldbesitzer. Konflikte zeigt die Kustomization als Fehler (Abschnitt 6).
  Die helm-Releases cert-manager und lego-webhook übernimmt je eine
  `HelmRelease` mit gleichem Release-Namen und Namespace.
- `task devmesh:flux:install` (flux-operator + FluxInstance anwenden),
  `task devmesh:flux:suspend` / `task devmesh:flux:resume` (alle
  devmesh-Kustomizations). `task devmesh:deploy` bleibt Notfallweg und bricht
  mit Hinweis ab, solange eine nicht suspendierte Kustomization existiert
  (Override `FORCE=1`).

### 4. Umzug und Abbau auf fleet

Reihenfolge (Runbook im Plan):

1. Artefakt rendern, Flux auf devmesh installieren, alle Kustomizations grün.
2. `dev-pod` auf devmesh starten, Daten kopieren: Job auf fleet und Job auf
   devmesh, `tar` über das Tailnet (oder `kubectl cp` über den Operator-Rechner),
   danach Prüfsumme der Dateiliste vergleichen.
3. Abnahme: SSH auf devmesh-`dev-pod` über das Tailnet, `repo-sync` aktuell.
4. Erst dann fleet: `flux-dev` und `flux-dev-pod` löschen. Weil beide
   `prune: true` haben, werden ihre Workloads mitgelöscht. Vorher die PVCs von
   fleet sichern ist Schritt 2.
5. Repo: `flux/clusters/fleet/ks-dev.yaml`, `ks-dev-pod.yaml`, die Komponenten
   `dev`/`dev-pod` in `scripts/flux-render-artifact.sh`, `prod-fleet/dev`,
   `prod-fleet/dev-pod` und die nicht mehr genutzten Teile von `k3d/dev-stack`
   entfernen. `k3d/dev-pod` bleibt als Basis für das devmesh-Overlay.

Nicht in diesem Feature: übrige Flux-Kustomizations auf fleet (platform,
coturn, office, rustdesk, sealed-secrets-mentolder) und alle mentolder-Anteile.
Die verschwinden mit dem Neuaufbau bzw. in Phase 9 (Q3).

### 5. ADR

Neue `docs/adr/ADR-015-devmesh-eigenes-flux.md`: devmesh mit eigenem Flux aus
`devmesh-manifests`, kein Dev-Stack auf fleet. Ersetzt ADR-008 Punkt 2 und
klärt den offenen SP-3-Punkt „GitOps (flux-Branch vs. push-task)“ zugunsten von
Flux. ADR-008 bekommt einen Verweis.

### 6. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Render-Fehler in CI | kein Push, laufendes Artefakt bleibt |
| cosign-Prüfung schlägt fehl | `OCIRepository` nicht ready, Cluster bleibt auf letztem Stand |
| Übernahme kollidiert mit manuell angelegtem Objekt | Kustomization zeigt Fehler, `task devmesh:flux:suspend`, Objekt bereinigen, `resume` |
| Datenkopie unvollständig | Abbau auf fleet (Schritt 4) unterbleibt, fleet-PVCs bleiben |

### 7. Tests

- pytest-Verträge unter `tests/py/spec/devmesh/`:
  - Render mit `--out` erzeugt `platform/`, `secrets/`, `workspace/` und
    enthält keinen Host unter `mentolder.de`.
  - Alle Objekte in `flux/clusters/devmesh/` referenzieren nur
    `devmesh-manifests` bzw. `Paddione/Bachelorprojekt` und keinen fleet-Pfad.
  - `dev-pod` im devmesh-Render: Namespace `workspace`, DB-Host
    `shared-db.workspace.svc.cluster.local`, kein `shared-db-dev`.
  - `scripts/flux-render-artifact.sh` kennt die Komponenten `dev` und
    `dev-pod` nicht mehr; `flux/clusters/fleet/` enthält keine `ks-dev*.yaml`.
- Workflow-Render-Gate (Abschnitt 2).
- Manuelle Abnahme (Abschnitt 4, Schritte 1 und 3).

## Folge-Feature (nicht hier)

Öffentlicher Zugang für die eigene Prod-Website und brainstorm. Offen: DynDNS
von der Fritzbox auf ipv64 (`korczewski.de`) mit Portfreigabe oder Tailscale
Funnel (nur `*.ts.net`, keine eigene Domain). Mit brainstorm kommen sish und die
oauth2-Tore zurück.
