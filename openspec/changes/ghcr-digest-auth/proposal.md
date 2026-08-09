# Proposal: ghcr-digest-auth

## Why

`render-fleet-artifact.yml` bricht seit PR #3877 bei jedem Push auf `main` mit
`403 DENIED` ab, wenn es den Digest von `ghcr.io/paddione/workspace-brett:latest`
auflöst. Damit entsteht kein neues OCI-Artefakt, und Flux reconciled den fleet-Cluster
stumm weiter auf einer alten Revision — `flux get kustomization` meldet dabei
`READY=True`, sodass der Ausfall im Cluster unsichtbar bleibt. Belegt am 2026-08-09:
der Fix aus PR #3937 lag auf `main`, war im Cluster aber nicht angekommen.

Ursache ist die fehlende Repository-Verknüpfung des Packages, nicht ein Token-Scope.
Ein repo-scoped `GITHUB_TOKEN` kann ein privates, unverknüpftes Package nicht lesen.
Commit `555cda1ff` hielt genau das für die Build-Workflows fest und wich auf `GH_PAT`
aus; PR #3877 fügte einen Consumer hinzu, ohne diese Ausnahme zu übernehmen.

## What

Der GHCR-Login des Renderers wechselt auf `secrets.GH_PAT` mit
`github.repository_owner` als Username — derselbe Weg, den `build-brett`, `build-docs`,
`build-videovault` und `build-mediaviewer-widget` bereits gehen. Ein Offline-Guard
(`tests/spec/ci-cd/ghcr-digest-auth.bats`) hält das Muster fest, damit ein künftiger
Consumer nicht erneut daran vorbeiläuft.

Nicht im Scope: die Verknüpfung der vier Packages samt Rückbau der `GH_PAT`-Umgehungen,
ein Drift-Detektor gegen stilles Altern der Flux-Revision, sowie die Sichtbarkeit der
GHCR-Packages.

_Ticket: T002837_
