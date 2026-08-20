#!/usr/bin/env bash
# scripts/llm/tools-sandbox.sh — Lebenszyklus des Containers, in dem die
# eingebauten llama-server-Tools laufen (--tools-runtime docker-container:<name>).
#
# WARUM NICHT die 'docker:<image>'-Form von llama.cpp: die startet den Container
# selbst, aber als
#     docker run --rm -i --cidfile <f> <image> sh
# also OHNE jedes Volume. read_file, write_file, edit_file, grep_search und
# file_glob_search laufen dann gegen ein leeres Dateisystem — technisch isoliert,
# praktisch nutzlos. Nur die Attach-Form 'docker-container:<name>' laesst uns die
# Mounts selbst bestimmen, und genau dafuer existiert dieses Skript.
#
# Der Name statt einer Container-ID ist Absicht: llama.cpp ruft 'docker exec
# <arg> …' auf, und docker loest Namen dort auf. Eine ID muesste nach jedem
# Neuanlegen in loadouts.json nachgezogen werden.
#
#   tools-sandbox.sh up      Image bauen (falls noetig) und Container starten
#   tools-sandbox.sh status  Exit 0, wenn der Container laeuft
#   tools-sandbox.sh down    Container entfernen
#
# Umgebungsvariablen:
#   TOOLS_SANDBOX_NAME       Containername (Default: llama-tools-sandbox)
#   TOOLS_SANDBOX_IMAGE      Image-Tag    (Default: llama-tools-sandbox:local)
#   TOOLS_SANDBOX_WORKSPACE  Gemountetes Verzeichnis (Default: Repo-Wurzel)
#   TOOLS_SANDBOX_RW         '1' mountet schreibbar (Default: read-only)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="${TOOLS_SANDBOX_NAME:-llama-tools-sandbox}"
IMAGE="${TOOLS_SANDBOX_IMAGE:-llama-tools-sandbox:local}"
WORKSPACE="${TOOLS_SANDBOX_WORKSPACE:-$REPO_ROOT}"
DOCKERFILE_DIR="${REPO_ROOT}/scripts/llm/tools-sandbox"

_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || echo false)" = "true" ]
}

cmd_status() {
  if _running; then
    echo "läuft: ${NAME} (Image ${IMAGE})"
    return 0
  fi
  echo "läuft nicht: ${NAME}" >&2
  return 1
}

cmd_up() {
  command -v docker >/dev/null || { echo "docker fehlt" >&2; exit 1; }

  # Ein git-WORKTREE taugt nicht als Workspace. Dort ist '.git' eine DATEI, die
  # auf ein gitdir im Eltern-Repo zeigt — das liegt ausserhalb des Mounts, und
  # jedes git-Kommando im Container endet mit "not a git repository". Betroffen
  # ist genau ein Tool, aber ein wichtiges: 'file_glob_search' ruft
  # 'git ls-files' auf. Das faellt sonst nur gegenueber dem Modell auf, waehrend
  # read_file und grep_search weiter funktionieren — also die unauffaelligste
  # Sorte Defekt. Deshalb hier, wo es entscheidbar ist.
  if [ -f "${WORKSPACE}/.git" ] && [ "${TOOLS_SANDBOX_ALLOW_WORKTREE:-0}" != "1" ]; then
    echo "abgebrochen: ${WORKSPACE} ist ein git-Worktree (.git ist eine Datei)." >&2
    echo "  Das gitdir liegt ausserhalb des Mounts — file_glob_search (git ls-files)" >&2
    echo "  wuerde im Container scheitern. Haupt-Checkout nehmen:" >&2
    echo "    TOOLS_SANDBOX_WORKSPACE=<haupt-checkout> $0 up" >&2
    echo "  Bewusst trotzdem starten: TOOLS_SANDBOX_ALLOW_WORKTREE=1" >&2
    exit 1
  fi

  if _running; then
    echo "bereits gestartet: ${NAME}"
    return 0
  fi
  # Eine gestoppte Hülle gleichen Namens blockiert 'docker run' — erst weg damit.
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "baue ${IMAGE} …"
    docker build -t "$IMAGE" -f "${DOCKERFILE_DIR}/Dockerfile" "$DOCKERFILE_DIR"
  fi

  local mount_opts="ro"
  [ "${TOOLS_SANDBOX_RW:-0}" = "1" ] && mount_opts="rw"

  # Härtung, jede Option mit einem Grund:
  #   --network none        kein Weg nach draußen; exec_shell_command kann weder
  #                         nachladen noch etwas abfliessen lassen
  #   --read-only           das Container-Dateisystem selbst ist unveränderlich
  #   --tmpfs /tmp          …deshalb braucht es einen beschreibbaren Kratzplatz
  #   --cap-drop ALL        keine Capabilities; die Tools brauchen keine
  #   --security-opt no-new-privileges  kein setuid-Aufstieg
  #   --pids-limit/--memory Eine Endlosschleife des Modells reisst nicht den Host mit
  docker run -d --name "$NAME" \
    --network none \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --pids-limit 256 \
    --memory 1g \
    -v "${WORKSPACE}:/workspace:${mount_opts}" \
    -w /workspace \
    "$IMAGE" sh -c 'while true; do sleep 3600; done' >/dev/null

  # Positiv-Beleg statt "docker run gab 0 zurück": ein Container kann sofort
  # nach dem Start wieder sterben, und dann meldete das hier trotzdem Erfolg.
  local i
  for i in $(seq 1 30); do
    if _running; then
      echo "gestartet: ${NAME} (${WORKSPACE} → /workspace, ${mount_opts})"
      return 0
    fi
    sleep 0.2
  done
  echo "Container ${NAME} startete, läuft aber nicht:" >&2
  docker logs "$NAME" 2>&1 | tail -20 >&2
  exit 1
}

cmd_down() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  echo "entfernt: ${NAME}"
}

case "${1:-}" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  status) cmd_status ;;
  *)      echo "Aufruf: $0 up|down|status" >&2; exit 2 ;;
esac
