# mentolder-prod

**Selbst gehostete Kollaborationsplattform (Marke Mentolder) — Produktionsumgebung als eigenständiges Repository.**

Abgespalten aus `Bachelorprojekt` (Chore T016564). Dieses Repo enthält ausschließlich die
Mentolder-Produktion für den Gekko-Cluster: Kubernetes-Manifeste (Kustomize-Basen und
Overlays), Umgebungsprofile, SealedSecrets, Flux-GitOps-Konfiguration, Render-/Deploy-
Werkzeuge und Betriebs-Docs. App-Quellcode (Website, Brett), zweite Marke (Korczewski),
Staging- und Dev-Stacks leben nicht hier.

Live-Instanz: [mentolder.de](https://mentolder.de)

## Repository-Layout

| Bereich | Inhalt |
|---|---|
| [flux/clusters/fleet-gekko/](flux/clusters/fleet-gekko/) | GitOps-Einstieg: FluxInstance, Git- und OCI-Source, Prod-Kustomizations |
| [prod-fleet/mentolder/](prod-fleet/mentolder/) | Marken-Overlay Workspace-Namespace (Nextcloud, Collabora, Pocket ID, Brett) |
| [prod-fleet/website-mentolder/](prod-fleet/website-mentolder/) | Website-Overlay (Astro-SSR, Ingress, TLS) |
| [prod-fleet/coturn/](prod-fleet/coturn/) | Talk-HPB (coturn/Janus, hostNetwork auf gekko-hetzner-2) |
| [prod-fleet/platform/](prod-fleet/platform/) | Cluster-Basis (cert-manager, SealedSecrets-Controller, Traefik) |
| [prod-mentolder/](prod-mentolder/), [prod/](prod/), [k3d/](k3d/) | Kustomize-Basen (nicht direkt anwenden, nur über `prod-fleet/*`) |
| [environments/](environments/) | Umgebungsprofile (`fleet-mentolder.yaml`), Schema, SealedSecrets, Zertifikate |
| [scripts/](scripts/) | Render (`flux-render-artifact.sh`), Env-Auflösung, Seal-/Rotate-Werkzeuge |
| [docs/](docs/) | Runbooks (Backup/Restore, Secrets, git-crypt) und ADRs |

## Betrieb

Jeder Push auf `main` rendert die Manifeste zu einem OCI-Artefakt (`render-fleet-artifact.yml`),
signiert es (Cosign, keyless) und stößt den Flux-Reconcile an. Flux auf dem Cluster gleicht
daraus ab:

```
Browser → Traefik (TLS via cert-manager) → Pocket ID (OIDC) / Website / Nextcloud / Vaultwarden / DocuSeal ...
```

Details: Runbooks unter [docs/runbooks/](docs/runbooks/).

## Voraussetzungen

- `kustomize` ≥ 5.4, `flux` CLI, `envsubst` (gettext), `python3` + PyYAML, `task` ≥ 3.52
- `kubectl` mit Zugriff auf den Gekko-Cluster (`fleet`-Kontext)
- git-crypt-Key für `environments/.secrets/**` (separat übergeben, siehe Übergabe-Checkliste)
- GHCR-Zugang für Images und OCI-Artefakt

## Erste Schritte nach der Übergabe

1. Alle `__GEKKO_*__`-Platzhalter ersetzen (siehe Übergabe-Checkliste vom bisherigen Betreiber).
2. `task manifests:validate` — Kustomize-Build aller vier Overlays.
3. `task flux:render` — Offline-Render nach `out/` prüfen.
4. Flux-Bootstrap auf dem Cluster (FluxInstance + `ghcr-auth`-Secret, siehe Runbooks).
5. Ersten CI-Lauf auf `main` abwarten (Render → Push → Cosign-Signatur), dann Flux-Reconcile prüfen.

## Secrets

- Klartext-Secrets liegen git-crypt-verschlüsselt unter `environments/.secrets/` — ohne den
  separat übergebenen Schlüssel sind sie nicht lesbar.
- Entschlüsselte Werte niemals committen, drucken oder in Logs schreiben.
- Rotation: `scripts/secret-rotate.sh`, danach `scripts/env-seal.sh --env fleet-mentolder`.
