#!/usr/bin/env bash
# gitlab-runner-setup.sh — non-interactive self-hosted GitLab-Runner-Registrierung [T011790]
#
# Registriert den self-hosted Runner fuer die GitLab-CI-Migration (Etappe 1) mit dem
# Docker-Executor, ueber einen Authentication-Token (glrt-Praefix, --token). Der
# aeltere --registration-token-Fluss ist seit GitLab 16 veraltet und aus aktuellen
# Versionen entfernt — ein darauf gebautes Skript wuerde genau dann scheitern, wenn
# es zum ersten Mal gebraucht wird (design.md D5).
#
# Usage:
#   scripts/gitlab-runner-setup.sh [--dry-run] [--url <gitlab-url>]
#
# Env:
#   GITLAB_RUNNER_TOKEN   Authentication-Token (glrt-...). Pflicht im Echtlauf.
#   GITLAB_RUNNER_URL     GitLab-Instanz-URL. Default: https://gitlab.com
#
# Im --dry-run-Modus gibt das Skript den vollstaendigen Registrierungsbefehl aus, ohne
# GitLab zu kontaktieren und ohne Runner-Konfiguration zu schreiben — mit Exit-Code 0,
# auch ohne gesetzten Token und ohne installiertes gitlab-runner-Binary. Damit prueft
# der BATS-Guard (tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats) das *Verhalten*
# des Skripts statt seinen Quelltext zu greppen (Repo-Konvention T002448-M4).
#
# Die Argumente stehen genau EINMAL, in einem Array. Dry-Run gibt es per `printf '%q'`
# aus, der Echtlauf fuehrt dasselbe Array aus. Ohne diese Kopplung koennte der
# Echtlauf still von der Dry-Run-Ausgabe abweichen (z.B. --token gegen
# --registration-token getauscht) und der Guard bliebe trotzdem gruen.
set -euo pipefail

DRY_RUN=false
GITLAB_URL="${GITLAB_RUNNER_URL:-https://gitlab.com}"
RUNNER_TAG="bachelorprojekt-local"
RUNNER_DESCRIPTION="bachelorprojekt fleet self-hosted (Docker-Executor)"

usage() {
  cat <<EOF
Usage: $0 [--dry-run] [--url <gitlab-url>]

  --dry-run           Registrierungsbefehl ausgeben, ohne GitLab zu kontaktieren
                       oder Runner-Konfiguration zu schreiben.
  --url <gitlab-url>   GitLab-Instanz-URL (Default: \${GITLAB_RUNNER_URL:-https://gitlab.com}).

Env:
  GITLAB_RUNNER_TOKEN  Authentication-Token (glrt-...). Pflicht im Echtlauf.
  GITLAB_RUNNER_URL    GitLab-Instanz-URL. Default: https://gitlab.com
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --url)
      GITLAB_URL="${2:-}"
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

if [ "$DRY_RUN" = true ]; then
  TOKEN_VALUE="<GITLAB_RUNNER_TOKEN>"
else
  if [ -z "${GITLAB_RUNNER_TOKEN:-}" ]; then
    echo "ERROR: GITLAB_RUNNER_TOKEN ist nicht gesetzt (glrt-Authentication-Token erforderlich)" >&2
    exit 1
  fi
  if ! command -v gitlab-runner >/dev/null 2>&1; then
    echo "ERROR: gitlab-runner ist nicht installiert." >&2
    echo "Installationshinweis: https://docs.gitlab.com/runner/install/linux-repository.html" >&2
    exit 1
  fi
  TOKEN_VALUE="${GITLAB_RUNNER_TOKEN}"
fi

# Einzige Fundstelle der Registrierungsargumente — Dry-Run und Echtlauf teilen
# sich dieses Array, statt es an zwei Stellen gepflegt vorzufinden.
args=(
  --non-interactive
  --executor docker
  --docker-image docker:24-git
  --url "${GITLAB_URL}"
  --token "${TOKEN_VALUE}"
  --tag-list "${RUNNER_TAG}"
  --run-untagged=false
  --description "${RUNNER_DESCRIPTION}"
)

if [ "$DRY_RUN" = true ]; then
  printf 'gitlab-runner register'
  printf ' %q' "${args[@]}"
  printf '\n\n'
  echo "Dry-Run: kein Kontakt zu GitLab, keine Runner-Konfiguration geschrieben."
  exit 0
fi

gitlab-runner register "${args[@]}"
