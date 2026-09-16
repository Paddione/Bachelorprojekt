# Workspace MVP

Kubernetes-basierte Kollaborationsplattform für kleine Teams (Bachelorprojekt): Nextcloud mit Talk, Pocket ID für SSO, Collabora, Vaultwarden, DocuSeal, Whiteboard, Brett und eine Astro/Svelte-Website mit Chat.

## Einstieg

- [Entwicklung und Beitragen](CONTRIBUTING.md) — Worktrees, Package Manager und Prüfungen.
- [Dokumentationswegweiser](docs/README.md) — Architektur, Betrieb, Spezifikationen und Referenzen.
- [Agent-Einstieg](AGENTS.md) — kompakte Arbeitsregeln; [CLAUDE.md](CLAUDE.md) enthält die ausführliche Referenz.
- [Website lokal starten](components/website/CLAUDE.md#dev-quick-start) — Docker- und Host-Variante einschließlich Umgebungsvariablen.

## Entwicklung

Für die lokale Website gibt es [compose.dev.yaml](compose.dev.yaml). Einrichtung und benötigte `.env`-Werte stehen im [Website-Guide](components/website/CLAUDE.md#dev-quick-start).

Der lokale Kubernetes-Stack verwendet die Overlays in [dev-local/](dev-local/) und die Tasks in [taskfiles/Taskfile.devmesh.yml](taskfiles/Taskfile.devmesh.yml). Zielbild und Netz-Zugang: [ADR-008](docs/adr/ADR-008-local-k3s-dev-mesh.md) und [Devmesh-Runbook](docs/runbooks/devmesh-tailnet.md). Historische k3d-Anleitungen sind kein Bootstrap für diesen Stack.

Task-Befehle lassen sich vor der Ausführung über den Oracle auflösen:

```bash
bash scripts/vda.sh oracle 'run all offline tests' --dry-run
```

## Produktion

Die Produktions-Manifeste werden aus [k3d/](k3d/) und den [Fleet-Overlays](prod-fleet/) gerendert. Der [Render-Workflow](.github/workflows/render-fleet-artifact.yml) veröffentlicht das OCI-Artefakt; [Flux](flux/clusters/fleet/) reconciliert es auf dem `fleet`-Cluster. `workspace:deploy` ist der manuelle Break-Glass-Pfad.

Die Brand-Zuordnung liegt in [environments/mentolder.yaml](environments/mentolder.yaml) und [environments/korczewski.yaml](environments/korczewski.yaml). Suspensionen und Wiederaufnahme beschreibt das [Flux-Runbook](docs/runbooks/flux-suspensions.md). Laufzustand und Replica-Zahlen müssen am Cluster geprüft werden.

Domains werden in [k3d/configmap-domains.yaml](k3d/configmap-domains.yaml) und den Umgebungsprofilen gepflegt.

## Repository-Layout

| Bereich | Inhalt / maßgebliche Referenz |
|---|---|
| [components/](components/) | Anwendungen; [Website-Guide](components/website/CLAUDE.md) |
| [packages/](packages/) | Gemeinsame Pakete |
| [k3d/](k3d/) | Kubernetes-Basis-Manifeste, trotz historischem Verzeichnisnamen weiterhin verwendet |
| [prod-fleet/](prod-fleet/), [flux/](flux/) | Produktions-Overlays und GitOps-Reconciliation |
| [prod/](prod/), [prod-mentolder/](prod-mentolder/), [prod-korczewski/](prod-korczewski/) | Von Fleet-Overlays referenzierte Basen; nicht direkt anwenden |
| [dev-local/](dev-local/), [devmesh/](devmesh/) | Lokale Cluster-Overlays, Inventar und Netz-Policy |
| [environments/](environments/) | Umgebungsprofile, Schema und verschlüsselte Secrets |
| [scripts/](scripts/), [taskfiles/](taskfiles/), [Taskfile.yml](Taskfile.yml) | Automatisierung und Task-Einstieg |
| [tests/](tests/), [openspec/](openspec/) | Tests, aktuelle Spezifikationen und Change-Archiv |
| [docs/](docs/README.md), [.agents/skills/](.agents/skills/) | Dokumentation und wiederverwendbare Arbeitsabläufe |

## Prüfungen und Regeln

```bash
task test:changed
task freshness:check
task workspace:validate
```

Änderungen gehen über isolierte Worktrees und Pull Requests mit Squash-Merge. Root und Brett verwenden npm, die Website pnpm. Produktions-Deployments verwenden Kubernetes/Kustomize; Compose dient der lokalen Website-Entwicklung. Secrets nie im Klartext committen. Details: [CONTRIBUTING.md](CONTRIBUTING.md).
