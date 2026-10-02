# Proposal: remove-gitlab

## Why

GitLab laeuft als zweite, nicht blockierende CI-Plattform neben GitHub, wird aber nicht
genutzt. Der Ist-Stand am 2026-09-27 (Befehle in `design.md`):

- Die Registry-Spiegel (Images, signiertes OCI-Artefakt) sind nie konfiguriert —
  `GITLAB_REGISTRY_*` fehlen, jeder Lauf meldet `SKIP`.
- Die Flux-Fallback-Quelle `fleet-manifests-gitlab` ist `suspend: true` und hat kein Artefakt.
- Der Runner-Stack (`gitlab-runner`, `registry-cache`) belegt seit 36 Tagen Ressourcen auf
  `fleet` fuer eine Pipeline, deren Ergebnis niemand liest.
- Aktiv ist nur der Push-Mirror des Repos nach GitLab.

## What

GitHub wird die einzige CI- und Registry-Plattform. Entfernt werden `.gitlab-ci.yml`,
`.gitlab-ci-images/`, `mirror-to-gitlab.yml`, die GitLab-Spiegelschritte in den Build- und
Render-Workflows, der Runner-Stack samt Flux-Kustomization und OCI-Fallback, die
GitLab-Skripte, `GITLAB_RUNNER_TOKEN`, die `gitlab-*`-Guards und 16 Requirements aus
`ci-cd.md`. Zwei Requirements in `flux-render-security.md` und `health-goals.md` verlieren
ihren GitLab-Anteil.

Rueckholbarkeit: Tag `archive/gitlab-ci` auf dem letzten `main`-Commit vor der Entfernung
und das Runbook `docs/runbooks/gitlab-restore.md` (ersetzt `gitlab-runner.md`).

Nicht im Umfang: das GitLab-Projekt selbst und die Runner-Registrierung auf gitlab.com.

_Ticket: T900650_
