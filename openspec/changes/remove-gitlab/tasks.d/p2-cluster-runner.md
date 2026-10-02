---
title: "p2 — Runner-Stack, OCI-Fallback und Runner-Secrets entfernen"
ticket_id: T900650
domains: [ci-cd]
status: active
---

# p2 — Runner-Stack, OCI-Fallback und Runner-Secrets entfernen

Files: siehe Manifest-Zeile p2 in `../tasks.md`. Disjunkt zu p1, p3, p4.

Wirkung nach dem Merge: Flux prunt `flux-gitlab-runner` und `fleet-manifests-gitlab`, die
Kustomization prunt Namespace `gitlab-runner` samt Deployments `gitlab-runner` und
`registry-cache`. Das ist gewollt (design.md D3/D7).

## Task 2.1: Dateien loeschen

```bash
git rm -r -q flux/clusters/fleet/ks-gitlab-runner.yaml flux/clusters/fleet/oci-source-gitlab.yaml \
  k3d/gitlab-runner-stack scripts/gitlab-runner-cache.sh scripts/gitlab-runner-setup.sh
```

Pruefen, dass keine `kustomization.yaml` unter `flux/` die geloeschten Dateien listet:
`git grep -n -E 'ks-gitlab-runner|oci-source-gitlab' -- flux/` muss leer sein (Exit 1).

## Task 2.2: `scripts/flux-render-artifact.sh`

- Block "1c. GitLab-Runner-Stack (T012177)" entfernen: die zwei Kommentarzeilen,
  `mkdir -p "${OUT_DIR}/gitlab-runner"` und
  `render_component k3d/gitlab-runner-stack "${OUT_DIR}/gitlab-runner/gitlab-runner.yaml"`.
- In der Validierungsschleife (`for tree_dir in ...`) den Eintrag `"${OUT_DIR}/gitlab-runner"` streichen.
- Kommentar beim dev-pod-Render: "gleiche Lage wie beim gitlab-runner-stack oben." streichen,
  der Satz davor bleibt.
- Den historischen Kommentar zum `$$`-Unwrapping ("Genau so lag der gitlab-runner ab bc80f246b
  im CrashLoop.") unveraendert lassen; das Unwrapping selbst bleibt (design.md D3).

Pruefen: `bash -n scripts/flux-render-artifact.sh`.

## Task 2.3: `taskfiles/Taskfile.platform.yml`

Den kompletten Task `gitlab-runner:render:` entfernen (von der Zeile `  gitlab-runner:render:`
bis vor `  loki:render:`). Pruefen: `task --list-all | grep -c gitlab` ergibt 0.

## Task 2.4: `environments/schema.yaml`

Unter `secrets:` den Abschnitt ab dem Kommentar
`# ── GitLab-CI Etappe 2: K8s-Runner auf fleet (T012177)` bis einschliesslich des Eintrags
`GITLAB_RUNNER_REGISTRATION_TOKEN` (endet mit `owner_brand: [mentolder]` vor der Leerzeile und
`setup_vars:`) entfernen. Beide Eintraege `GITLAB_RUNNER_TOKEN` und
`GITLAB_RUNNER_REGISTRATION_TOKEN` fallen weg.

## Task 2.5: SealedSecrets und Klartext-Quelle

Nicht neu versiegeln (`task env:seal` wuerde jeden Ciphertext neu erzeugen). Stattdessen gezielt:

- `environments/sealed-secrets/fleet-mentolder.yaml`: die Zeile `    GITLAB_RUNNER_TOKEN: Ag...`
  im `workspace-secrets`-SealedSecret entfernen und das komplette Dokument
  `kind: SealedSecret` mit `name: gitlab-runner-secret`, `namespace: gitlab-runner`
  (inkl. eines der beiden `---`-Trenner) entfernen.
- `environments/.secrets/fleet-mentolder.yaml` (git-crypt, im Worktree entschluesselt): die
  Zeile `GITLAB_RUNNER_TOKEN: "..."` entfernen. Vorher `git-crypt status environments/.secrets/fleet-mentolder.yaml`
  pruefen; ist die Datei nicht entschluesselt, stoppen und im Ticket kommentieren.

Pruefen:

```bash
python3 -c "import yaml; list(yaml.safe_load_all(open('environments/sealed-secrets/fleet-mentolder.yaml')))"
git grep -n -i gitlab -- environments/ ; test $? -eq 1
```

## Task 2.6: Kommentar in `prod-fleet/dev-pod/kustomization.yaml`

Die Zeile `# genauso wie beim gitlab-runner-stack.` entfernen und den vorherigen Satz mit
einem Punkt abschliessen (`... kein vorheriges env-resolve.sh.`).

## Task 2.7: Manifeste validieren

```bash
task workspace:validate
```
