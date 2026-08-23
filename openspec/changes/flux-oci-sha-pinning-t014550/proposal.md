# Proposal: flux-oci-sha-pinning-t014550

## Why

System-Audit 2026-08-23 (SA-GR-07, T014550): Beide Flux `OCIRepository`-Ressourcen
(`flux/clusters/fleet/oci-source.yaml:9-10`, `oci-source-gitlab.yaml:27-28`) ziehen das
mutable Tag `latest`. Cosign verifiziert dabei nur die **Identität** des Signers
(OIDC-Subject), nicht die **Inhaltshistorie** — der Cluster läuft jederzeit auf dem
jüngsten Artifact, ohne dass das Repo nennt, welche Revision das ist. Rollbacks sind
nicht deterministisch nachvollziehbar (welcher sha-`GITHUB_SHA` steckt in `latest`?).

Die sha-Tags existieren bereits: `render-fleet-artifact.yml` taggt jeden Push zusätzlich
als `sha-${GITHUB_SHA}` (Zeilen 119–121). Sie werden nur nie konsumiert.

## What

1. **Pin statt Float:** Beide OCIRepositories referenzieren `ref.tag: sha-<gitsha>`
   statt `latest`. Initiales Pin = sha-Tag des letzten erfolgreichen Render-Runs
   (vom Execute aus GHCR auflösen).
2. **Automatisches Nachziehen (Bump-Commit):** Der Render-Workflow setzt nach
   Push + Signatur einen Commit, der beide `ref.tag:`-Zeilen auf den neuen
   `sha-${GITHUB_SHA}` hebt (`[skip ci]`, GITHUB_TOKEN — kein Re-Trigger). Damit nennt
   das Repo immer die exakt deployte Revision; Rollback = Revert des Bump-Commits.
3. **Guard:** BATS-Spec prüft, dass keine OCIRepository auf `tag: latest` zeigt und
   jede `ref.tag` dem Muster `sha-[0-9a-f]{7,40}` folgt.

_Non-Goal:_ Keine Umstellung auf digest-Pinning (`ref.digest`) — der Bump-Commit-Mechanismus
kann später darauf erweitert werden; sha-Tags sind der im Workflow bereits gebaute Standard.

_Ticket: T014550_
