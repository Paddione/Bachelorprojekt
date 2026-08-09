---
title: "ghcr-digest-auth — Implementation Plan"
ticket_id: T002837
domains: [ci, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ghcr-digest-auth — Implementation Plan

_Ticket: T002837_

Design und verifizierte Ursachenanalyse: `openspec/changes/ghcr-digest-auth/design.md`.

Kurzfassung: `ghcr.io/paddione/workspace-brett` ist privat und mit keinem Repository
verknüpft. Ein repo-scoped `GITHUB_TOKEN` erhält darauf `403 DENIED`, unabhängig von den
deklarierten `permissions`. Die vier Build-Workflows umgehen das seit `555cda1ff` mit
`GH_PAT`; PR #3877 fügte mit dem Digest-Resolve einen Consumer hinzu, ohne diese Ausnahme zu
übernehmen. Der Fix zieht den Renderer auf denselben Auth-Weg.

## Partials

| # | Rolle | Zieldateien |
|---|-------|-------------|
| 1 | tests + fix | `.github/workflows/render-fleet-artifact.yml`, `tests/spec/ci-cd/ghcr-digest-auth.bats` |

Ein einzelnes Partial: der Production-Diff umfasst zwei Zeilen in einer Datei, eine Aufteilung
brächte nur Koordinationsaufwand ohne Parallelitätsgewinn.

## File Structure

```
.github/workflows/render-fleet-artifact.yml   (geändert — GHCR-Login: 2 Zeilen)
tests/spec/ci-cd/ghcr-digest-auth.bats        (neu — Guard, liegt bereits im Stage-Commit vor)
openspec/changes/ghcr-digest-auth/design.md   (neu — Design + Ursachenanalyse)
openspec/changes/ghcr-digest-auth/specs/ci-cd.md (neu — Delta-Spec)
```

Keine Budget-Angaben: der Production-Diff ändert zwei Zeilen in einer Workflow-Datei, die
S1-Größenschwellen sind hier ohne Aussagekraft.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard `tests/spec/ci-cd/ghcr-digest-auth.bats` liegt
      bereits im Stage-Commit dieses Branches. Er ist auf dem aktuellen Stand rot, weil der
      Login-Step noch `GITHUB_TOKEN` und `github.actor` trägt. Vor der Implementierung
      ausführen und den roten Stand bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ghcr-digest-auth.bats
# expected: FAIL — Tests 1 und 2 rot ("Renderer nutzt GH_PAT", "Login-Username ist der
# Repository-Owner"). Test 3 ("GH_PAT-Konvention deckt sich mit den Build-Workflows") ist
# bereits grün: er beschreibt den Bestand, an dem sich der Fix ausrichtet.
```

      Schlagen alle drei fehl, ist die Konvention im Bestand gebrochen — dann zuerst klären,
      statt den Guard anzupassen.

- [ ] **Fix-Step (GREEN).** In `.github/workflows/render-fleet-artifact.yml`, Step
      `Log in to GHCR`, genau zwei Zeilen ändern:

```yaml
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GH_PAT }}
```

      Beide Zeilen sind notwendig. `github.actor` ist der auslösende Akteur; bei einem
      Bot-Push (release-please, Renovate) passt dieser Name nicht zum PAT des
      Repository-Owners, und der Login bräche ausgerechnet bei den automatischen Pushes.
      Nichts sonst am Workflow anfassen — insbesondere bleibt `permissions:` unverändert,
      da der Artefakt-Push weiterhin `packages: write` benötigt.

      Danach muss der Guard grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ghcr-digest-auth.bats
```

- [ ] **Wirkungskontrolle nach dem Merge.** Der eigentliche Beweis liegt außerhalb der
      lokalen Tests, weil der GHCR-Login nur im Actions-Runner stattfindet. Nach dem Merge
      auf `main` den nächsten Renderer-Lauf prüfen und bestätigen, dass Flux das neue
      Artefakt zieht:

```bash
gh-axi run list --workflow render-fleet-artifact.yml --limit 3
# erwartet: conclusion=success statt failure

kubectl --context fleet -n flux-system get kustomization flux-mentolder \
  -o jsonpath='{.status.lastAppliedRevision}{"\n"}'
# erwartet: eine Revision, die den Merge-Commit enthält — nicht mehr latest@sha256:fe69d554…
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
