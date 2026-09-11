#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/onboard-machine.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding/spec.md
# Pruefmodus: Laufzeit. Das Skript laeuft gegen ein lokales Origin-Repo mit gestubbten
# wslinfo, gh, git-crypt, sudo, task, node, pnpm und kubectl; geprueft werden Exit-Code,
# Dateimodus und Modification-Times, nicht der Quelltext.

stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$STUBS/$1"; chmod +x "$STUBS/$1"; }
snapshot() { find "$CLONE" "$HOME/.config/git-crypt" -printf '%p %T@\n' | sort; }

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/onboard-machine.sh"
  export HOME="${BATS_TEST_TMPDIR}/home"
  export GIT_CONFIG_NOSYSTEM=1
  mkdir -p "$HOME/.config/git-crypt"
  KEY="$HOME/.config/git-crypt/bachelorprojekt.key"
  CLONE="$HOME/Bachelorprojekt"
  printf 'k' > "$KEY"
  chmod 600 "$KEY"

  ORIGIN="${BATS_TEST_TMPDIR}/origin"
  mkdir -p "$ORIGIN/scripts" "$ORIGIN/environments/.secrets" "$ORIGIN/.githooks"
  cp "$REPO_ROOT/scripts/git-crypt-guard.sh" "$REPO_ROOT/scripts/check-hooks-path.sh" "$ORIGIN/scripts/"
  printf '#!/bin/sh\nexit 0\n' > "$ORIGIN/.githooks/pre-commit"
  printf '\000GITCRYPT\000ciphertext' > "$ORIGIN/environments/.secrets/dev.yaml"
  git -C "$ORIGIN" init -q -b main
  git -C "$ORIGIN" add -A
  git -C "$ORIGIN" -c user.name=t -c user.email=t@example.invalid commit -q -m init

  STUBS="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "$STUBS"
  stub wslinfo 'echo mirrored'
  stub gh 'exit 0'
  stub git-crypt 'exit 0'
  stub sudo 'echo "sudo $*" >> "$HOME/sudo.log"; exit 0'
  stub task 'if [ "$1" = "-d" ]; then cd "$2" || exit 1; shift 2; fi
case "$1" in secrets:install-hooks) git config core.hooksPath .githooks && git config merge.ours.driver true ;; esac'
  for t in node pnpm kubectl; do stub "$t" 'exit 0'; done
  export PATH="$STUBS:$PATH"
}

@test "onboard: fehlende Keydatei endet mit Exit 2 und nennt die Datei" {
  run bash "$SCRIPT" --repo-url "$ORIGIN" --key-file "$HOME/fehlt.key"
  [ "$status" -eq 2 ]
  printf '%s\n' "$output" | grep -qF -e "$HOME/fehlt.key"
}

@test "onboard: Keydatei mit Modus 644 wird auf 600 gesetzt und die Korrektur gemeldet" {
  chmod 644 "$KEY"
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$(stat -c '%a' "$KEY")" = "600" ]
  printf '%s\n' "$output" | grep -F -e 'key-mode' | grep -qF -e '644'
}

@test "onboard: Keydatei eines fremden Benutzers endet mit Exit 1 ohne Aenderung" {
  chmod 644 "$KEY"
  stub id "[ \"\$1\" = \"-u\" ] && { echo 4242; exit 0; }
exec $(command -v id) \"\$@\""
  run bash "$SCRIPT" --repo-url "$ORIGIN"
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF -e 'key-owner'
  [ "$(stat -c '%a' "$KEY")" = "644" ]
}
