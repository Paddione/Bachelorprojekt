---
title: "dev-stack-k3d-removal — Design"
ticket_id: T900332
status: active
---

# dev-stack-k3d-removal — Design

_Ticket: T900332 · Vorgänger: T900310 (Design D6, Review F7/F8)_

## Kontext

`workspace-dev` auf `fleet` wird von der Flux-Kustomization `flux-dev` aus `prod-fleet/dev`
gerendert, das `k3d/dev-stack/` einbindet. CI veröffentlicht `ghcr.io/paddione/website:dev` und
`ghcr.io/paddione/workspace-brett:dev` (`build-website.yml`, `build-brett.yml`).
`taskfiles/Taskfile.dev-stack.yml` stammt aus der Zeit des k3d-in-k3s-Stacks: `build:*` bauen
lokal und importieren per SSH mit `k3d image import` auf `$DEV_NODE` (`dev-vm`, am 2026-09-22
nicht erreichbar: `ssh root@dev-vm` → `No route to host`). `apply` installiert per Helm
cert-manager und spielt `k3d/dev-stack/cert-manager.yaml` (ClusterIssuer `letsencrypt-prod`) und
`traefik-tls.yaml` (TLSStore `default` in `kube-system`) ein. Gegen den Default `CTX_DEV=fleet`
überschreibt das Prod-Objekte gleichen Namens.

Live-Messung (2026-09-22):

```bash
kubectl --context fleet -n workspace-dev get secret,cm \
  -o custom-columns=NAME:.metadata.name,FLUX:.metadata.labels.kustomize\\.toolkit\\.fluxcd\\.io/name
kubectl --context fleet -n workspace-dev get deploy website brett \
  -o jsonpath='{range .items[*]}{.metadata.name}={.spec.template.spec.containers[0].imagePullPolicy}{"\n"}{end}'
```

Ergebnis: `ghcr-pull-secret`, `shared-db-dev-secrets`, `workspace-secrets` ohne Flux-Label;
`sish-authorized-keys` gehört `flux-dev`; beide Deployments `IfNotPresent`.

## Entscheidungen

**D1 — Redeploy = Rollout-Restart (User).** `dev:redeploy:website` und `dev:redeploy:brett`
bauen nichts mehr, sie führen `kubectl rollout restart` und `rollout status` in `NS_DEV` auf
`CTX_DEV` aus. Voraussetzung ist ein Push, nach dem CI das `:dev`-Image gebaut hat.

**D2 — `imagePullPolicy: Always` für die `:dev`-Deployments.** `IfNotPresent` passte zum
lokalen Import. Mit einem veränderlichen Registry-Tag hält es das alte Image im Knoten-Cache
fest. Die Änderung betrifft nur `k3d/dev-stack/website-dev.yaml` und `brett-dev.yaml` und
kommt über Flux in `workspace-dev`.

**D3 — Imperatives Apply entfällt (User).** `build:website`, `build:brett`, `apply`
und `deploy` werden gelöscht. Flux ist die einzige Quelle für die Manifeste in
`workspace-dev`.

**D4 — `dev:secrets` statt `_materialise-secrets` (User).** Der interne Task wird als
`dev:secrets` eigenständig aufrufbar. Er legt nur an, was Flux nicht liefert, und nur in
`NS_DEV`. Weg fallen `ipv64-api-key` (Namespace `cert-manager`, gegen fleet = Prod) und
`sish-authorized-keys` (gehört Flux). `mcp-tokens` bleibt.

**D5 — cert-manager-Bootstrap-Dateien entfallen (User).** `k3d/dev-stack/cert-manager.yaml`
und `traefik-tls.yaml` werden gelöscht. Der Kommentar in `dev-local/cluster/tls.yaml`, der sie
als Muster nennt, und die Kommentare in `k3d/dev-stack/kustomization.yaml`, `sish.yaml` zu
`dev:apply`/`dev:deploy` werden angepasst.

**D6 — Staging-Taskfile vollständig (User).** `taskfiles/Taskfile.staging.yml`, das Include in
`Taskfile.yml`, `k3d/staging-stack/`, `scripts/staging-id.sh`, `tests/unit/staging.bats` und die
Staging-Fälle in `tests/spec/security.bats` entfallen. `prod-fleet/staging` bleibt.

**D7 — Bleibt:** `logs`, `psql`, `tunnel`, `firewall:open`, `db:refresh`, die Includes `dev:`/`dev-korczewski:`
(Requirement „The `dev:` Task Namespace Stays Reserved" in `sdlc-isolation`), die Variablen
`DEV_NODE`, `DEV_SSH_USER`, `DEV_SSH_ALLOWLIST` (weitere Leser: `workspace:deploy`,
`prod-korczewski/`, `Taskfile.brainstorm.yml`).

**D8 — Skills und Doku.** `.opencode/skills/references/deploy-routing.md` verliert die Zeile
`full → task dev:deploy` (Ersatz: Merge nach `main`, Flux reconciliert). Die Zeilen für
`website`/`brett` bleiben, der Befehlsname ändert sich nicht. `.opencode/skills/dev-flow-execute/SKILL.md`
Schritt 4 nennt die Voraussetzung (CI-Build von `:dev`). `docs/dev-stack/README.md` wird auf den
Flux-Stand umgeschrieben.

**D9 — Guard erweitern.** `tests/spec/local-dev-mesh/k3d-tooling-removed.bats` prüft die
zusätzlichen Tasks und Dateien und sucht `k3d image import` auch unter `taskfiles/`. Ein neuer
Test belegt per `task --dry`, dass `dev:redeploy:*` nicht baut und `dev:secrets` im Namespace
bleibt. `tests/unit/dev-build-safety.bats` verliert den Fall zu `build:website`.

## Spec-Deltas

| SSOT | Art | Inhalt |
|---|---|---|
| `local-dev-mesh` | MODIFIED | „The repository ships no local k3d cluster tooling" um Dev-Stack- und Staging-Reste erweitert |
| `local-dev-mesh` | ADDED | „Dev redeploy pulls the CI-built dev image", „Dev secrets are materialised by an explicit task" |
| `ci-cd` | MODIFIED | „Dev-Build-Safety" ohne das Szenario zu `Taskfile.dev-stack.yml` |
| `workspace-deploy` | REMOVED | zwei Staging-Requirements (`staging-id.sh`, `k3d/staging-stack`) |

## Risiken

- **R1:** Ein Knoten, der das `:dev`-Image noch nie gezogen hat, zieht es nach D2 bei jedem
  Pod-Start neu. Das ist gewollt und betrifft nur `workspace-dev`.
- **R2:** Ohne CI-Build vor dem Redeploy startet der Pod mit dem bisherigen `:dev`-Stand neu.
  Die Task-Beschreibung nennt diese Voraussetzung.
