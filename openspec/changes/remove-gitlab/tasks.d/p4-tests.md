---
title: "p4 — GitLab-Guards entfernen, Restguards anpassen, RED→GREEN"
ticket_id: T900650
domains: [ci-cd]
status: active
---

# p4 — GitLab-Guards entfernen, Restguards anpassen, RED→GREEN

Files: siehe Manifest-Zeile p4 in `../tasks.md` plus die hier geloeschten Testdateien.
Laeuft nach p1–p3.

## Task 4.1: RED bestaetigen

Der Test ist mit dem Plan committed. Auf dem Plan-Stand (vor p1–p3) war er rot:

```bash
PLAN=$(git log --format=%H -1 -- openspec/changes/remove-gitlab/tasks.md)
git worktree add -q /tmp/red-check-T900650 "$PLAN"
tests/unit/lib/bats-core/bin/bats /tmp/red-check-T900650/tests/spec/ci-cd/github-only-ci.bats
git worktree remove --force /tmp/red-check-T900650
```

expected: FAIL (Tests 2, 3 und 4 rot, Test 1 gruen).

## Task 4.2: GitLab-Guards loeschen

```bash
git rm -q tests/spec/ci-cd/gitlab-*.bats tests/spec/ci-cd/ci-diff-base.bats
```

Erwartet: 19 Dateien (18 `gitlab-*.bats` plus `ci-diff-base.bats`).

## Task 4.3: `tests/spec/.spec-runtime.tsv`

Alle Zeilen entfernen, deren Pfad auf eine in Task 4.2 geloeschte Datei zeigt
(`grep -v -E 'tests/spec/ci-cd/(gitlab-[^/]*|ci-diff-base)\.bats$'`). Die neue Datei
`tests/spec/ci-cd/github-only-ci.bats` mit Laufzeit `1.000` einsortieren, falls die Datei
sortiert ist (Nachbarzeilen ansehen) oder der Guard "Spec Runtime Manifest Completeness"
sie verlangt.

## Task 4.4: `tests/spec/flux-render-security/runtime-var-unwrapping.bats`

`RENDERED` zeigt auf die geloeschte `k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml`.
- Die Tests, die `$RENDERED` lesen (T012503 "gitlab-runner-rendered.yaml traegt die
  Laufzeit-Variablen als $$", T012634 "keine einzige unescapte ${VAR} in der gerenderten
  Datei", T012503 "nach dem Unwrapping bleibt in der gerenderten Datei kein $$ stehen")
  und die `RENDERED=`-Zeile im `setup` entfernen.
- Die Muster-Tests (`$${VAR}`, `$$VAR`, `$$(`, `$$!`/`$$?`), den Renderer-Muster-Test und
  T012907 behalten; sie pruefen den Mechanismus, der bleibt.
- Den Kopfkommentar um den Satz ergaenzen, dass der Runner-Stack mit T900650 entfernt wurde.

## Task 4.5: `tests/spec/health-goals/korczewski-brand-pause.bats`

Den Block `run timeout 20 kubectl --context fleet -n flux-system get ocirepository fleet-manifests-gitlab ...`
bis einschliesslich seines `}` entfernen. Die Kustomization- und Job-Pruefungen bleiben.

## Task 4.6: `tests/spec/ci-cd/awk-interval-portability.bats`

Im Kopfkommentar "war die letzte rote Zusicherung im GitLab-Job bats-unit." ersetzen durch
"war die letzte rote Zusicherung im damaligen GitLab-Job bats-unit (entfernt mit T900650)."

## Task 4.7: GREEN und Inventar

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/github-only-ci.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ tests/spec/flux-render-security/
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/korczewski-brand-pause.bats
task test:inventory
```

Alle vier Tests in `github-only-ci.bats` gruen. `korczewski-brand-pause.bats` braucht den
fleet-Context; ohne Cluster-Zugang ist ein `skip`/Fehler dort kein Befund dieses Partials,
aber im Ticket zu notieren.

`tests/evals/` NICHT anfassen (human-owned, siehe `../tasks.md` Task H).
