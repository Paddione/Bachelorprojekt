#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation (T002448-M4) — die SUT
# scripts/devflow-post-merge-deploy.sh wird in einem Wegwerf-Fixture mit
# gestubbten externen Aufrufen ausgefuehrt; $status/$output entscheiden.
# Fix: T003982 (p5) — k3d/sdlc-stack/** vor dem K8s-Match aus $CHANGED filtern.
# Positiv-Anker (T002356-M1): Fall 1 zuerst, dann die Negativ-Aussage (Fall 2).

setup() {
  REPO="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  FIXTURE="$BATS_TMPDIR/fixture"
  mkdir -p "$FIXTURE"

  cd "$FIXTURE"
  git init
  git config user.email "test@example.com"
  git config user.name "Test User"
  # Commit 0: leerer Basis-Commit als Parent der Fall-Commits.
  git commit --allow-empty -m "initial"
  git update-ref refs/remotes/origin/main HEAD

  # SUT ins Fixture KOPIEREN (live Stand) — alle relativen Aufrufe bleiben hermetisch.
  mkdir -p "$FIXTURE/scripts" "$FIXTURE/bin"
  cp "$REPO/scripts/devflow-post-merge-deploy.sh" "$FIXTURE/scripts/devflow-post-merge-deploy.sh"

  # Stubs UNTRACKED im Arbeitsbaum (git diff-tree liest nur den Commit).
  echo 'cat; exit 0' > "$FIXTURE/scripts/filter-generated.sh"
  chmod +x "$FIXTURE/scripts/filter-generated.sh"

  echo 'echo "ticket.sh: $*"; exit 0' > "$FIXTURE/scripts/ticket.sh"
  chmod +x "$FIXTURE/scripts/ticket.sh"

  echo 'exit 0' > "$FIXTURE/scripts/devflow-post-merge-ticket-closure.sh"
  chmod +x "$FIXTURE/scripts/devflow-post-merge-ticket-closure.sh"

  # task-Stub: einziger Indikator, ob Zeile 83 `task feature:deploy` ausgeloest wurde.
  echo 'echo "task called: $*"; exit 0' > "$FIXTURE/bin/task"
  chmod +x "$FIXTURE/bin/task"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "Fall 1: CHANGED only k3d/websocket.yaml -> status 0 + Deploye K8s-Manifeste + task called" {
  cd "$FIXTURE"
  mkdir -p k3d
  touch k3d/websocket.yaml
  git add k3d/websocket.yaml
  git commit -m "[T004295] fixture 1"
  git update-ref refs/remotes/origin/main HEAD

  run env PATH="$FIXTURE/bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T004295
  [ "$status" == 0 ]
  [[ "$output" =~ "Deploye K8s-Manifeste" ]]
  [[ "$output" =~ "task called: feature:deploy" ]]
}

@test "Fall 2: CHANGED only k3d/sdlc-stack/* -> status 0 + Keine bekannte Deploy-Trigger" {
  cd "$FIXTURE"
  mkdir -p k3d/sdlc-stack
  touch k3d/sdlc-stack/sdlc-console.yaml
  touch k3d/sdlc-stack/kustomization.yaml
  git add k3d/sdlc-stack/
  git commit -m "[T004295] fixture 2"
  git update-ref refs/remotes/origin/main HEAD

  run env PATH="$FIXTURE/bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T004295
  [ "$status" == 0 ]
  [[ "$output" =~ "Keine bekannten Deploy-Trigger" ]]
  [[ ! "$output" =~ "task called:" ]]
  # Die "Geänderte Dateien"-Liste (Zeile 57) zeigt den gefilterten $CHANGED —
  # sdlc-stack-Pfade duerfen nirgends auftauchen.
  [[ ! "$output" =~ "k3d/sdlc-stack" ]]
}

@test "Fall 3: CHANGED k3d/websocket.yaml + k3d/sdlc-stack/* -> task called + sdlc-stack NOT in list" {
  cd "$FIXTURE"
  mkdir -p k3d/sdlc-stack
  touch k3d/websocket.yaml
  touch k3d/sdlc-stack/sdlc-console.yaml
  git add k3d/websocket.yaml k3d/sdlc-stack/sdlc-console.yaml
  git commit -m "[T004295] fixture 3"
  git update-ref refs/remotes/origin/main HEAD

  run env PATH="$FIXTURE/bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T004295
  [ "$status" == 0 ]
  [[ "$output" =~ "task called: feature:deploy" ]]
  # Regression: der Filter entfernt NUR sdlc-stack-Pfade, nie andere k3d-Pfade —
  # der sdlc-stack-Pfad darf in keinem Output-Bestandteil erscheinen.
  [[ ! "$output" =~ "k3d/sdlc-stack" ]]
}
