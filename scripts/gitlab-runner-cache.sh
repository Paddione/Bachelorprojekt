#!/usr/bin/env bash
# gitlab-runner-cache.sh — lokaler Registry-Pull-Through-Cache auf PK-Desktop
# [T012177, gitlab-ci-k8s-runner-cache]
#
# Startet (idempotent) einen registry:2-Proxy-Container fuer Docker Hub auf
# PK-Desktop und bindet ihn im lokalen Docker-Daemon als registry-mirror an
# (Design D4: der Cache existiert zweimal — einmal hier, einmal auf fleet als
# Deployment in k3d/gitlab-runner-stack/registry-cache.yaml). Zusaetzlich setzt
# es pull_policy = ["if-not-present"] im [runners.docker]-Block des bestehenden
# self-hosted Runners — das spart den Registry-Roundtrip, wenn das Image lokal
# schon liegt (komplementaer zum Cache, der Ausgangspunkt in
# scripts/gitlab-runner-setup.sh, config.toml aus Etappe 1).
#
# Usage:
#   scripts/gitlab-runner-cache.sh [--dry-run] [--port <n>]
#
# Env:
#   CACHE_PORT   Alternative zu --port. Default: 5000.
#
# Im --dry-run-Modus gibt das Skript den vollstaendigen `docker run ...`-Befehl,
# den geplanten daemon.json-Merge und den geplanten config.toml-Anhang aus, ohne
# eine Datei zu beruehren und ohne docker/sudo aufzurufen — mit Exit-Code 0, auch
# ohne installiertes docker. Damit prueft der BATS-Guard
# (tests/spec/ci-cd/gitlab-registry-cache.bats) das *Verhalten* des Skripts statt
# seinen Quelltext zu greppen (Repo-Konvention T002448-M4).
set -euo pipefail

DRY_RUN=false
CACHE_PORT="${CACHE_PORT:-5000}"
CONTAINER_NAME="gitlab-registry-cache"
REMOTE_URL="https://registry-1.docker.io"
DAEMON_JSON="/etc/docker/daemon.json"
RUNNER_CONFIG_TOML="/etc/gitlab-runner/config.toml"

usage() {
  cat <<EOF
Usage: $0 [--dry-run] [--port <n>]

  --dry-run       Geplante Aktionen ausgeben, ohne Docker/Dateisystem zu beruehren.
  --port <n>      Host-Port fuer den Cache-Container (Default: \${CACHE_PORT:-5000}).

Env:
  CACHE_PORT      Alternative zu --port. Default: 5000.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --port)
      CACHE_PORT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unbekanntes Argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Einzige Fundstelle des Registrierungsbefehls — Dry-Run und Echtlauf teilen sich
# dieses Array, statt es an zwei Stellen gepflegt vorzufinden (analog
# gitlab-runner-setup.sh).
run_args=(
  run -d
  --name "${CONTAINER_NAME}"
  --restart unless-stopped
  -p "${CACHE_PORT}:5000"
  -e "REGISTRY_PROXY_REMOTEURL=${REMOTE_URL}"
  -e "REGISTRY_STORAGE_DELETE_ENABLED=true"
  -v "gitlab-registry-cache-data:/var/lib/registry"
  registry:2
)

_print_dry_run_plan() {
  echo "docker \\"
  i=0
  n=${#run_args[@]}
  while [ "$i" -lt "$n" ]; do
    cur="${run_args[$i]}"
    line="$(printf '%q' "$cur")"
    i=$((i + 1))
    if [ "$i" -lt "$n" ]; then
      printf '  %s \\\n' "$line"
    else
      printf '  %s\n' "$line"
    fi
  done
  echo ""
  echo "Geplanter Merge in ${DAEMON_JSON} (registry-mirrors):"
  printf '  { "registry-mirrors": ["http://localhost:%s"] }\n' "${CACHE_PORT}"
  echo ""
  echo "Geplanter Anhang in ${RUNNER_CONFIG_TOML} ([runners.docker]):"
  echo '  pull_policy = ["if-not-present"]'
  echo ""
  echo "Dry-Run: kein Docker-Kontakt, keine Datei geschrieben."
}

if [ "$DRY_RUN" = true ]; then
  _print_dry_run_plan
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker ist nicht installiert." >&2
  echo "Installationshinweis: https://docs.docker.com/engine/install/" >&2
  exit 1
fi

# 1. Cache-Container starten (idempotent — existiert er bereits, ueberspringen
#    statt einen Namenskonflikt zu werfen).
if docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  echo "✓ Container ${CONTAINER_NAME} existiert bereits — ueberspringe docker run."
else
  docker "${run_args[@]}"
  echo "✓ Container ${CONTAINER_NAME} gestartet (Port ${CACHE_PORT})."
fi

# 2. Anbindung im Docker-Daemon (registry-mirrors) — Merge statt Ueberschreiben.
if [ ! -f "${DAEMON_JSON}" ]; then
  sudo mkdir -p "$(dirname "${DAEMON_JSON}")"
  echo "{}" | sudo tee "${DAEMON_JSON}" >/dev/null
fi

if command -v jq >/dev/null 2>&1; then
  merged="$(sudo jq --arg mirror "http://localhost:${CACHE_PORT}" \
    '.["registry-mirrors"] = ((.["registry-mirrors"] // []) + [$mirror] | unique)' \
    "${DAEMON_JSON}")"
  echo "${merged}" | sudo tee "${DAEMON_JSON}" >/dev/null
  echo "✓ registry-mirrors in ${DAEMON_JSON} gemerged."
else
  echo "ERROR: jq ist nicht installiert — kann ${DAEMON_JSON} nicht sicher mergen." >&2
  echo "Installiere jq oder trage \"registry-mirrors\": [\"http://localhost:${CACHE_PORT}\"] manuell ein." >&2
  exit 1
fi

sudo systemctl restart docker
echo "✓ Docker-Daemon neu gestartet."

# 3. pull_policy im bestehenden self-hosted Runner (additiv zum Docker-Mirror).
if [ -f "${RUNNER_CONFIG_TOML}" ]; then
  if sudo grep -qF -- 'pull_policy = ["if-not-present"]' "${RUNNER_CONFIG_TOML}"; then
    echo "✓ pull_policy bereits in ${RUNNER_CONFIG_TOML} gesetzt."
  else
    printf '  pull_policy = ["if-not-present"]\n' | sudo tee -a "${RUNNER_CONFIG_TOML}" >/dev/null
    echo "✓ pull_policy an ${RUNNER_CONFIG_TOML} angehaengt — sudo systemctl restart gitlab-runner nicht vergessen."
  fi
else
  echo "HINWEIS: ${RUNNER_CONFIG_TOML} nicht gefunden — pull_policy nicht gesetzt (Runner noch nicht registriert?)." >&2
fi
