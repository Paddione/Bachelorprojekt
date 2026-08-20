#!/usr/bin/env bats
# tests/spec/local-llm-proxy/tools-runtime-sandbox.bats
# SSOT: openspec/specs/local-llm-proxy.md
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# ruft scripts/llm/tools-sandbox.sh und den Preflight aus runner.mjs auf und
# wertet Exit-Code und Ausgabe aus. Er greppt kein Dockerfile — dessen Inhalt
# belegt nicht, dass ein Container mit diesen Eigenschaften auch laeuft.
#
# WARUM: Die eingebauten llama-server-Tools laufen ohne --tools-runtime im
# Host-Kontext der Unit. 'exec_shell_command' gibt damit jedem, der die
# llama.cpp-WebUI auf dem Port erreicht, eine Shell mit den Rechten der Unit
# ueber das gesamte Benutzerverzeichnis — ~/.ssh und die git-crypt-
# entschluesselten Secrets eingeschlossen. Ein Loadout, das 'tools' fuehrt,
# aber keine Laufzeit nennt, ist deshalb ein Befund und keine Geschmacksfrage.
#
# SKIP ohne Docker: der CI-Runner hat keinen Daemon. Ein Guard, der dort gruen
# meldet, ohne geprueft zu haben, waere schlimmer als einer, der sich als
# uebersprungen ausweist. Die beiden Registry-Tests laufen ueberall.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  SANDBOX="${REPO_ROOT}/scripts/llm/tools-sandbox.sh"
}

_docker_up() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

@test "T012971: jedes Loadout mit tools nennt auch eine toolsRuntime" {
  run node -e "
    const doc = require('${LOADOUTS}')
    const bare = doc.loadouts.filter(l => l.tools && !l.toolsRuntime).map(l => l.slug)
    const withRuntime = doc.loadouts.filter(l => l.tools && l.toolsRuntime).map(l => l.slug)
    console.log('BARE=' + bare.join(','))
    console.log('GUARDED=' + withRuntime.join(','))
  "
  [ "$status" -eq 0 ]
  # Positiv-Anker: mindestens ein Loadout fuehrt ueberhaupt Tools MIT Laufzeit.
  # Ohne ihn bestuende der Test auch, wenn das Feld ueberall verschwunden waere.
  [[ "$output" == *"GUARDED="?* ]]
  [[ "$output" == *"BARE="$'\n'* || "$output" == *"BARE="  || "$output" != *"BARE=,"* ]]
  run bash -c "echo '$output' | grep '^BARE=' | cut -d= -f2"
  [ -z "$output" ]
}

@test "T012971: der Preflight erkennt einen fehlenden Container" {
  run node --input-type=module -e "
    const { toolsRuntimeMissing } = await import('${REPO_ROOT}/scripts/llm-proxy/runner.mjs')
    console.log(toolsRuntimeMissing({ toolsRuntime: 'docker-container:gibt-es-sicher-nicht-xyz' }) ?? 'NULL')
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"gibt-es-sicher-nicht-xyz"* ]]
  [[ "$output" == *"tools-sandbox.sh up"* ]]
}

@test "T012971: der gestartete Container hat kein Netz und sieht das Repo nur lesend" {
  _docker_up || skip "kein erreichbarer Docker-Daemon"

  # Ein eigenes Verzeichnis statt REPO_ROOT: hier geht es um Netz, Mount-Modus
  # und Sichtbarkeit — dafuer braucht es kein git-Repo, und REPO_ROOT kann ein
  # Worktree sein, den 'up' bewusst ablehnt (siehe weiter unten).
  local ws="${BATS_TEST_TMPDIR}/ws"
  mkdir -p "$ws" && echo inhalt > "${ws}/datei.txt"

  TOOLS_SANDBOX_NAME=llama-tools-sandbox-bats \
  TOOLS_SANDBOX_WORKSPACE="$ws" \
    run bash "${SANDBOX}" up
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der Container fuehrt ueberhaupt Kommandos aus und
  # sieht den Mount.
  run docker exec llama-tools-sandbox-bats cat /workspace/datei.txt
  [ "$status" -eq 0 ]
  [[ "$output" == *"inhalt"* ]]
  run docker exec llama-tools-sandbox-bats sh -c 'echo lebt'
  [ "$status" -eq 0 ]
  [[ "$output" == *"lebt"* ]]

  # Kein Weg nach draussen.
  run docker exec llama-tools-sandbox-bats sh -c 'wget -q -T2 -O- https://example.com'
  [ "$status" -ne 0 ]

  # Der Mount ist nicht beschreibbar.
  run docker exec llama-tools-sandbox-bats sh -c 'touch /workspace/BATS_PWNED'
  [ "$status" -ne 0 ]
  [ ! -e "${ws}/BATS_PWNED" ]

  # Das Home des Hosts liegt nicht im Container.
  run docker exec llama-tools-sandbox-bats sh -c 'ls /home/patrick/.ssh'
  [ "$status" -ne 0 ]

  TOOLS_SANDBOX_NAME=llama-tools-sandbox-bats bash "${SANDBOX}" down
}

@test "T012971: ein git-Worktree als Workspace wird abgelehnt statt still halb zu funktionieren" {
  _docker_up || skip "kein erreichbarer Docker-Daemon"

  # Ein Worktree wird fuer den Test angelegt statt vorausgesetzt: der Guard soll
  # ueberall greifen, nicht nur dort, wo zufaellig einer herumliegt.
  local wt="${BATS_TEST_TMPDIR}/wt"
  git -C "${REPO_ROOT}" worktree add --detach "$wt" HEAD >/dev/null 2>&1 || skip "worktree add nicht moeglich"
  # Positiv-Anker fuer die Voraussetzung: '.git' ist hier wirklich eine Datei.
  [ -f "${wt}/.git" ]

  TOOLS_SANDBOX_NAME=llama-tools-sandbox-bats \
  TOOLS_SANDBOX_WORKSPACE="$wt" \
    run bash "${SANDBOX}" up
  local rc="$status" out="$output"

  git -C "${REPO_ROOT}" worktree remove --force "$wt" >/dev/null 2>&1 || true

  [ "$rc" -ne 0 ]
  [[ "$out" == *"Worktree"* ]]
  [[ "$out" == *"file_glob_search"* ]]
}

@test "T012971: git ls-files funktioniert im Container — file_glob_search braucht es" {
  _docker_up || skip "kein erreichbarer Docker-Daemon"
  git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1 || skip "kein git-Repo"
  # In einem Worktree kann dieser Fall nicht bestehen; dass er dort ABGELEHNT
  # wird, prueft der Test darueber.
  [ -d "${REPO_ROOT}/.git" ] || skip "REPO_ROOT ist ein Worktree — siehe vorigen Test"

  TOOLS_SANDBOX_NAME=llama-tools-sandbox-bats \
  TOOLS_SANDBOX_WORKSPACE="${REPO_ROOT}" \
    bash "${SANDBOX}" up >/dev/null

  # Genau das Kommando, das llama.cpp fuer file_glob_search absetzt.
  run docker exec llama-tools-sandbox-bats \
    sh -c 'cd "$1" && git ls-files --cached --others --exclude-standard' _ /workspace
  local rc="$status" out="$output"

  TOOLS_SANDBOX_NAME=llama-tools-sandbox-bats bash "${SANDBOX}" down >/dev/null

  [ "$rc" -eq 0 ]
  [ -n "$out" ]
  # Negativ-Anker: die beiden bekannten Fehlklassen duerfen nicht auftreten.
  [[ "$out" != *"dubious ownership"* ]]
  [[ "$out" != *"not a git repository"* ]]
}
