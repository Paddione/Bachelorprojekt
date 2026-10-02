#!/usr/bin/env bats
# tests/spec/ci-cd/github-only-ci.bats — GitHub Actions ist die einzige CI-Plattform [T900650]
#
# Requirement (ci-cd-Spec): "GitHub Actions ist die einzige CI-Plattform".
# Geprueft wird die Ausgabe von `git ls-files` und `git grep` (versionierter Stand), nicht
# das Dateisystem: eine liegengebliebene, ungetrackte Datei ist kein Repo-Inhalt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT"
}

@test "github-only-ci: git ls-files liefert ueberhaupt Treffer (Anker)" {
  # Positiv-Anker [T002356-M1]: ein leeres ls-files (kein Repo, falsches cwd) erfuellt
  # jede "nichts gefunden"-Aussage unten vakuos.
  count="$(git ls-files .github/workflows | grep -c .)"
  echo "Anker: workflows=${count}"
  [ "$count" -gt 0 ]
}

@test "github-only-ci: keine GitLab-CI-, Runner- oder Mirror-Dateien versioniert" {
  run git ls-files -- .gitlab-ci.yml .gitlab-ci-images k3d/gitlab-runner-stack \
    'flux/clusters/fleet/*gitlab*' .github/workflows/mirror-to-gitlab.yml
  echo "$output"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "github-only-ci: kein Workflow pusht nach GitLab oder liest GITLAB_-Secrets" {
  run git grep -n -E 'registry\.gitlab\.com|GITLAB_' -- .github/workflows
  echo "$output"
  # git grep: Exit 1 = kein Treffer (gewollt), Exit 0 = Treffer, >1 = Fehler.
  [ "$status" -eq 1 ]
}

@test "github-only-ci: Restore-Runbook nennt Tag und alle neu anzulegenden Secrets" {
  doc="docs/runbooks/gitlab-restore.md"
  [ -n "$(git ls-files -- "$doc")" ] || { echo "MISSING: $doc"; return 1; }
  for needle in archive/gitlab-ci GITLAB_MIRROR_TOKEN GITLAB_MIRROR_URL \
                GITLAB_RUNNER_TOKEN gitlab-registry-auth GITLAB_REGISTRY_PREFIX GITLAB_REGISTRY_TOKEN; do
    grep -qF "$needle" "$doc" || { echo "FEHLT im Runbook: $needle"; return 1; }
  done
}
