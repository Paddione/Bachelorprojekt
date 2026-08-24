#!/usr/bin/env bash
# tests/spec/software-factory/wsl-exit-fleet-factory.bats [T016422]
#
# Manifest-Guards für den WSL-Exit (ADR-007): das geprüfte Verhalten manifestiert
# sich ausschließlich im Quelltext der Deploy-Manifeste — hier ist grep die
# angemessene Prüfform (Ausnahme "Querschnittstests im Quelltext",
# tests/CLAUDE.md). Negativ-Assertions tragen Positiv-Anker im selben Test;
# keine nackten '!'-Pipelines.
#
# Konventionen aus _sf_common.bash: Repo-Root über $BATS_TEST_DIRNAME/../../..

BRETT_DEV="k3d/dev-stack/brett-dev.yaml"
FACTORY_RUNNER="k3d/dev-stack/factory-runner.yaml"
SDLC_CONSOLE="k3d/dev-stack/sdlc-console.yaml"
GITATTRS=".gitattributes"

@test "brett-dev declares writable tmp emptyDir" {
  [ -f "$BRETT_DEV" ]
  # Volume deklariert …
  grep -q 'name: tmp' "$BRETT_DEV"
  grep -q 'emptyDir: {}' "$BRETT_DEV"
  # … und auch gemountet (Positiv-Anker gegen reine Deklaration ohne Mount).
  grep -q 'mountPath: /tmp' "$BRETT_DEV"
}

@test "factory-runner is single-replica by design" {
  [ -f "$FACTORY_RUNNER" ]
  # Genau ein Deployment-Replica: File-Locks + Worktree-Claims sind single-writer,
  # mehr als ein 'replicas:'-Eintrag wäre Designbruch (D1).
  count="$(grep -c '^  replicas: 1$' "$FACTORY_RUNNER")"
  [ "$count" -eq 1 ]
  # Flock-Hinweis dokumentiert, warum es kein HPA/Surge gibt.
  grep -qi 'flock' "$FACTORY_RUNNER"
}

@test "factory tick cronjob invokes wakeup.sh" {
  [ -f "$FACTORY_RUNNER" ]
  # Der Tick ruft das UNVERÄNDERTE wakeup.sh im Runner-Pod auf …
  grep -q 'scripts/factory/wakeup.sh' "$FACTORY_RUNNER"
  # … und sein CronJob-Image ist digest-gepinnt (kein Float-Tag am Tick-Pfad).
  grep -q '@sha256:[0-9a-f]\{64\}' "$FACTORY_RUNNER"
}

@test "no WSL bridge endpoint remains in dev-stack" {
  # Positiv-Anker: der Stack existiert und hat Inhalt — sonst wäre die
  # Negativ-Aussage unten vakuos.
  files="$(find k3d/dev-stack -name '*.yaml' -size +0c | wc -l)"
  [ "$files" -ge 5 ]
  hits="$(grep -R '172\.23\.0\.1' k3d/dev-stack/ || true)"
  [ -z "$hits" ]
}

@test "sdlc-console has no llm-proxy-host dependency" {
  # Positiv-Anker: Datei existiert und ist nicht leer.
  [ -s "$SDLC_CONSOLE" ]
  hits="$(grep -R 'llm-proxy-host' "$SDLC_CONSOLE" || true)"
  [ -z "$hits" ]
}

@test "gitattributes enforces LF for shell scripts" {
  [ -f "$GITATTRS" ]
  grep -qE '\*\.sh[[:space:]]+text eol=lf' "$GITATTRS"
  grep -qE '\*\.bats[[:space:]]+text eol=lf' "$GITATTRS"
}
