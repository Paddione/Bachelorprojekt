# flux-oci-sha-pinning-t014550 — Implementation Plan

_Ticket: T014550_ · Domänen: gitops, ci · Aufwand: klein

## File Structure

```
flux/clusters/fleet/oci-source.yaml                     — ref.tag pinnen
flux/clusters/fleet/oci-source-gitlab.yaml              — ref.tag pinnen
.github/workflows/render-fleet-artifact.yml             — Bump-Schritt + Permissions
tests/spec/ci-cd/flux-oci-sha-pinning.bats              — Guard (neu)
openspec/changes/flux-oci-sha-pinning-t014550/tasks.md  — dieser Plan
```

## Task List

- [ ] **Initiales Pin auflösen.** Aktuellen sha-Tag des letzten erfolgreichen
      Render-Runs bestimmen (`crane ls ghcr.io/paddione/fleet-manifests | grep '^sha-' |
      sort | tail -1`); Fallback: `gh run list --workflow=render-fleet-artifact.yml
      --status=success -L1` und Sha aus dem Run ableiten.
- [ ] **OCIRepositories pinnen.** In `flux/clusters/fleet/oci-source.yaml` und
      `oci-source-gitlab.yaml` jeweils `ref.tag: latest` → `ref.tag: <aufgelöster sha-Tag>`.
      Kommentar an beiden Stellen mit Verweis auf diesen Plan (Bump-Mechanik, Rollback
      = Revert des Bump-Commits).
- [ ] **Bump-Schritt im Render-Workflow.** In `.github/workflows/render-fleet-artifact.yml`
      nach dem Sign-Schritt ergänzen:
      - Guard: `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
      - `sed`-Ersetzung beider `tag:`-Zeilen auf `sha-${GITHUB_SHA}` (zielgerichtet je
        Datei, nicht global)
      - Commit `[skip ci] chore(flux): pin fleet-manifests to sha-${GITHUB_SHA}`
        mit GITHUB_TOKEN, Push best-effort (Fehler → Warning, kein Fail)
      - Workflow-Permissions um `contents: write` erweitern, falls noch nicht vorhanden
- [ ] **Guard-BATS.** `tests/spec/ci-cd/flux-oci-sha-pinning.bats`:
      1. Kein `ref.tag: latest` in beiden OCIRepository-Dateien (REGRESSION)
      2. Jede `ref.tag:`-Zeile matcht `sha-[0-9a-f]{7,40}` (MUSTER)
      3. Render-Workflow enthält den Bump-Schritt mit `[skip ci]` und Main-Guard (MECHANIK)
      Rot-Grün gegen heutigen Stand dokumentieren.

## Verify

- [ ] `bash scripts/flux-render-artifact.sh` lokal grün (Renderlogik unberührt, aber
      Pfadfilter berühren sie nicht — Sanity)
- [ ] BATS aus tasks.md: 3/3 grün
- [ ] `task freshness:check` grün
- [ ] Nach Merge: erster Render-Run erzeugt Bump-Commit; Flux reconciliert den gepinnten
      Tag (`flux get sources oci` zeigt die Revision); KEIN zweiter Workflow-Run durch
      den Bump-Commit (Loop-Guard wirksam)
