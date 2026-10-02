#!/usr/bin/env bats
# tests/spec/agent-skills/nightly-vendor-sync.bats
# Ticket: T900454 — Runbook: docs/runbooks/vendor-sync.md
#
# Befund 2026-09-30: scripts/nightly-update.sh liess die Updater im Hauptcheckout
# laufen. Sieben geaenderte Dateien blieben dort uncommittet liegen. Der Lauf schreibt
# jetzt ueber scripts/nightly-vendor-sync.sh in einen eigenen Worktree und reicht einen
# PR ein.
#
# Pruefmodus [T002448-M4]: OUTPUT-VERIFIKATION. Jeder Test baut ein Fixture-Repo mit
# lokalem bare-origin unter $BATS_TEST_TMPDIR, FUEHRT das Skript aus und urteilt ueber
# Exit-Code, den Zustand des Hauptcheckouts und die Branches auf origin. `gh` ist ein
# Stub im PATH, der seine Aufrufe protokolliert.
#
# Ausnahme (letzter Test): die Verdrahtung in nightly-update.sh wird am Quelltext
# geprueft. Das Skript laesst sich nicht ausfuehren, ohne apt-, npm- und CLI-Updates
# der Maschine anzustossen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/nightly-vendor-sync.sh"
  T="$BATS_TEST_TMPDIR"
  export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid
  export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
  export GIT_CONFIG_GLOBAL=/dev/null

  ORIGIN="$T/origin.git"
  MAIN="$T/main-checkout"
  git init -q --bare -b main "$ORIGIN"
  git init -q -b main "$MAIN"
  printf 'v1\n' > "$MAIN/vendored.txt"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
  git -C "$MAIN" remote add origin "$ORIGIN"
  git -C "$MAIN" push -q -u origin main

  # gh-Stub: protokolliert jeden Aufruf; `pr list` gibt den Inhalt von $GH_OPEN_HEADS aus.
  mkdir -p "$T/bin"
  cat > "$T/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
if [ "$1 $2" = "pr list" ]; then
  [ -f "$GH_OPEN_HEADS" ] && cat "$GH_OPEN_HEADS"
  exit 0
fi
if [ "$1 $2" = "pr create" ]; then
  echo "https://example.invalid/pr/1"
  exit 0
fi
exit 0
STUB
  chmod +x "$T/bin/gh"
  export GH_LOG="$T/gh.log" GH_OPEN_HEADS="$T/open-heads.txt"
  : > "$GH_LOG"
  export PATH="$T/bin:$PATH"
  export REPO_DIR="$MAIN" NIGHTLY_WT_DIR="$T/wt/nightly"
}

nightly_branches_on_origin() {
  git -C "$ORIGIN" for-each-ref --format='%(refname:short)' 'refs/heads/chore/nightly-vendor-sync-T900454-*'
}

@test "T900454: Upstream-Aenderung landet auf einem Branch mit PR, der Hauptcheckout bleibt unberuehrt" {
  export NIGHTLY_UPDATE_CMD='printf "v2\n" > vendored.txt; printf "neu\n" > added.txt'
  run bash "$SCRIPT"
  echo "$output"
  [ "$status" -eq 0 ]

  # Positiv-Anker: die Aenderung liegt auf genau einem Nightly-Branch auf origin.
  local branch
  branch="$(nightly_branches_on_origin)"
  [ "$(printf '%s\n' "$branch" | grep -c .)" -eq 1 ]
  [ "$(git -C "$ORIGIN" show "$branch:vendored.txt")" = "v2" ]
  [ "$(git -C "$ORIGIN" show "$branch:added.txt")" = "neu" ]
  grep -qF -e "pr create" "$GH_LOG"
  grep -qF -e "--head $branch" "$GH_LOG"

  # Der Hauptcheckout ist sauber, steht auf main und traegt den alten Inhalt.
  [ -z "$(git -C "$MAIN" status --porcelain)" ]
  [ "$(git -C "$MAIN" rev-parse --abbrev-ref HEAD)" = "main" ]
  [ "$(cat "$MAIN/vendored.txt")" = "v1" ]
  [ ! -e "$MAIN/added.txt" ]

  # Worktree und lokaler Branch sind wieder weg.
  [ ! -e "$NIGHTLY_WT_DIR" ]
  [ -z "$(git -C "$MAIN" branch --list 'chore/nightly-vendor-sync-*')" ]
}

@test "T900454: ohne Upstream-Aenderung entsteht weder Branch noch PR" {
  export NIGHTLY_UPDATE_CMD='touch "$MARKER"'
  export MARKER="$T/update-ran"
  run bash "$SCRIPT"
  echo "$output"
  [ "$status" -eq 0 ]

  # Positiv-Anker: der Updater lief tatsaechlich.
  [ -e "$MARKER" ]

  [ -z "$(nightly_branches_on_origin)" ]
  local created
  created="$(grep -F -e "pr create" "$GH_LOG" || true)"
  [ -z "$created" ]
  [ -z "$(git -C "$MAIN" status --porcelain)" ]
  [ ! -e "$NIGHTLY_WT_DIR" ]
}

@test "T900454: ein offener Nightly-PR verhindert einen zweiten Lauf" {
  printf 'feature/anderes-T000001\nchore/nightly-vendor-sync-T900454-20260101\n' > "$GH_OPEN_HEADS"
  export NIGHTLY_UPDATE_CMD='touch "$MARKER"; printf "v2\n" > vendored.txt'
  export MARKER="$T/update-ran"
  run bash "$SCRIPT"
  echo "$output"
  [ "$status" -eq 0 ]

  # Positiv-Anker: die PR-Abfrage lief.
  grep -qF -e "pr list" "$GH_LOG"

  [ ! -e "$MARKER" ]
  [ -z "$(nightly_branches_on_origin)" ]
}

@test "T900454: schlaegt die PR-Abfrage fehl, bricht der Lauf ab statt blind einzureichen" {
  cat > "$T/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
exit 1
STUB
  export NIGHTLY_UPDATE_CMD='touch "$MARKER"'
  export MARKER="$T/update-ran"
  run bash "$SCRIPT"
  echo "$output"
  [ "$status" -eq 1 ]
  grep -qF -e "pr list" "$GH_LOG"
  [ ! -e "$MARKER" ]
  [ -z "$(nightly_branches_on_origin)" ]
}

@test "T900454: nightly-update.sh ruft den Worktree-Lauf auf und wechselt nicht in den Hauptcheckout" {
  local update="$REPO/scripts/nightly-update.sh"
  grep -qF -e 'scripts/nightly-vendor-sync.sh' "$update"
  local cd_into_repo
  cd_into_repo="$(grep -nE '^[[:space:]]*cd[[:space:]]+"?\$\{?REPO_DIR' "$update" || true)"
  [ -z "$cd_into_repo" ]
}
