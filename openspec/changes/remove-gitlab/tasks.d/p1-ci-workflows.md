---
title: "p1 — GitLab-CI, Mirror-Workflow und Registry-Spiegelschritte entfernen"
ticket_id: T900650
domains: [ci-cd]
status: active
---

# p1 — GitLab-CI, Mirror-Workflow und Registry-Spiegelschritte entfernen

Files: siehe Manifest-Zeile p1 in `../tasks.md`. Disjunkt zu p2–p4. Nur Loeschungen und
Schritt-Entfernungen, keine neue Logik.

## Task 1.1: Dateien loeschen

```bash
git rm -r -q .gitlab-ci.yml .gitlab-ci-images .github/workflows/mirror-to-gitlab.yml \
  scripts/build-ci-images.sh scripts/ci-diff-base.sh scripts/gitlab-pipeline-check.sh \
  scripts/mirror-image-to-gitlab.sh
```

## Task 1.2: Image-Spiegelschritt aus zehn Build-Workflows entfernen

In jeder dieser Dateien den kompletten Step `- name: Mirror image to GitLab registry` entfernen
(von der `- name:`-Zeile bis einschliesslich `run: bash scripts/mirror-image-to-gitlab.sh`,
plus die direkt folgende Leerzeile, falls der naechste Block sonst doppelt getrennt waere):

`.github/workflows/build-brett.yml`, `build-collabora.yml`, `build-dev-pod.yml`,
`build-factory-runner.yml`, `build-mediaviewer-widget.yml`, `build-mentolder-web.yml`,
`build-sdlc-console.yml`, `build-transcriber.yml`, `build-videovault.yml`, `build-website.yml`.

Referenzform (aus `build-website.yml`):

```yaml
      - name: Mirror image to GitLab registry
        continue-on-error: true
        env:
          GITLAB_REGISTRY_PREFIX: ${{ secrets.GITLAB_REGISTRY_PREFIX }}
          GITLAB_REGISTRY_TOKEN: ${{ secrets.GITLAB_REGISTRY_TOKEN }}
          SOURCE_TAGS: |
            ...
        run: bash scripts/mirror-image-to-gitlab.sh
```

## Task 1.3: OCI-Spiegelschritt aus `render-fleet-artifact.yml` entfernen

Den Step `- name: Mirror signed OCI artifact to GitLab registry` samt dem direkt davor
stehenden Kommentarblock ("Registry-Redundanz [T012415] ...", "continue-on-error: Der Spiegel
ist sekundaer ...") entfernen. Der naechste Step `- name: Ping Flux receiver (immediate reconcile)`
bleibt unveraendert.

## Task 1.4: Orphan-Quelle in `docs/code-quality/gates.yaml`

Die zwei Zeilen

```yaml
    # GitLab CI pipeline references build scripts (build-ci-images.sh etc.)
    - ".gitlab-ci.yml"
```

entfernen. Die dort referenzierten Skripte `build-ci-images.sh` und `ci-diff-base.sh` sind in
Task 1.1 geloescht.

## Task 1.5: Pruefen

```bash
git grep -n -E 'registry\.gitlab\.com|GITLAB_|mirror-image-to-gitlab' -- .github/workflows; test $? -eq 1
for f in .github/workflows/*.yml; do python3 -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" "$f" || echo "YAML kaputt: $f"; done
node scripts/code-quality/check.mjs 2>&1 | grep -i orphan || true
```

Meldet der Orphan-Check ein Skript, das bisher nur ueber `.gitlab-ci.yml` erreichbar war, und
ist es nicht in Task 1.1 gelistet: nicht loeschen, sondern stoppen und im Ticket kommentieren.
