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
      # Kosmetisch (Review T012177): ohne Wert brach `shift 2` unter `set -e`
      # wortlos mit Exit 1 ab — jetzt eine benannte Fehlermeldung, plus
      # Validierung, dass der Wert tatsaechlich numerisch ist.
      if [ $# -lt 2 ] || [ -z "${2:-}" ]; then
        echo "ERROR: --port erwartet einen Portwert" >&2
        usage >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "ERROR: --port erwartet eine Zahl, erhalten: '$2'" >&2
        usage >&2
        exit 1
      fi
      CACHE_PORT="$2"
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
# S3 (Review T012177): auf 127.0.0.1 binden, nicht auf 0.0.0.0 — ein einfaches
# "-p PORT:5000" bindet auf alle Interfaces und macht den unauthentifizierten
# Docker-Hub-Proxy im LAN erreichbar. Der Cache wird ausschliesslich vom
# lokalen Docker-Daemon (registry-mirrors -> http://localhost:PORT) und dem
# lokalen gitlab-runner-Prozess gebraucht, nie von einem anderen Host.
run_args=(
  run -d
  --name "${CONTAINER_NAME}"
  --restart unless-stopped
  -p "127.0.0.1:${CACHE_PORT}:5000"
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

# 0. Fail-fast-Vorpruefung (Zusatz, Nachreview T012177): der [runners.docker]-
#    Block MUSS existieren, sonst kann Schritt 3 unten sein pull_policy nie
#    einfuegen. Diese Pruefung laeuft VOR jeder zustandsaendernden Aktion
#    (Container-Start, daemon.json-Merge, systemctl restart docker) — nicht
#    erst danach. Ohne diese Reihenfolge waere die unangenehmste Abbruchstelle
#    genau zwischen "docker neu gestartet" und "config.toml geaendert": der
#    Docker-Daemon liefe bereits mit dem neuen Mirror, aber pull_policy bliebe
#    unangewendet — ein Teilzustand, der bei einem erneuten Lauf nicht von
#    selbst heilt (die Ursache, ein fehlender [runners.docker]-Block, aendert
#    sich durch einen Docker-Neustart nicht).
if [ -f "${RUNNER_CONFIG_TOML}" ] && ! sudo grep -qE '^[[:space:]]*\[runners\.docker\]' "${RUNNER_CONFIG_TOML}"; then
  echo "ERROR: kein [runners.docker]-Block in ${RUNNER_CONFIG_TOML} gefunden — Runner noch nicht mit dem Docker-Executor registriert?" >&2
  echo "       Abbruch VOR jeder Aenderung (Cache-Container, daemon.json, Docker-Neustart)." >&2
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

# 3. pull_policy im bestehenden self-hosted Runner, GEZIELT im [runners.docker]-
#    Block (S2, Review T012177). Ein blindes `tee -a` haengt an das Dateiende
#    an — folgt dort z.B. [runners.cache] (wie in Etappe-1-Installationen
#    ueblich), landet der Key in der FALSCHEN TOML-Tabelle und wird von
#    gitlab-runner still ignoriert (genau der stille Fehlermodus, vor dem
#    Design D4a warnt). awk sucht den [runners.docker]-Header gezielt und fuegt
#    die Zeile DIREKT danach ein; die Idempotenz-Pruefung ist auf den
#    [runners.docker]-Block SCOPED, damit ein pull_policy in einem anderen
#    Block nicht faelschlich als "bereits gesetzt" durchgeht. Die Existenz des
#    Blocks selbst ist bereits in Schritt 0 (fail-fast, vor jeder Aenderung)
#    geprueft.
#
# N3 (Nachreview T012177): alle drei Anker sind [[:space:]]*-tolerant. Ein
# echtes, von `gitlab-runner register` geschriebenes config.toml rueckt
# verschachtelte Tabellen mit zwei Leerzeichen ein — ein Anker auf Spalte 0
# (^\[runners\.docker\]) matcht eine solche Datei NIE und der Block-Reset
# (^\[) ebenfalls nicht, was den awk-Insert stillschweigend leerlaufen liesse.
if [ -f "${RUNNER_CONFIG_TOML}" ]; then
  already_set="$(sudo awk '
    /^[[:space:]]*\[runners\.docker\]/ { in_block=1; next }
    /^[[:space:]]*\[/ { in_block=0 }
    in_block && /pull_policy[[:space:]]*=[[:space:]]*\["if-not-present"\]/ { print "yes"; exit }
  ' "${RUNNER_CONFIG_TOML}")"

  if [ "${already_set}" = "yes" ]; then
    echo "✓ pull_policy bereits im [runners.docker]-Block von ${RUNNER_CONFIG_TOML} gesetzt."
  else
    tmp_toml="$(mktemp)"
    # shellcheck disable=SC2024 # gewollt: sudo hebt nur das Lesen der
    # privilegierten Datei an, der tmp_toml-Schreibzugriff bleibt bewusst beim
    # aktuellen Benutzer (mktemp-Datei); der privilegierte Rueckschreibschritt
    # ist der separate `sudo cp` darunter.
    sudo awk '
      { print }
      /^[[:space:]]*\[runners\.docker\]/ && !inserted { print "  pull_policy = [\"if-not-present\"]"; inserted=1 }
    ' "${RUNNER_CONFIG_TOML}" > "${tmp_toml}"
    sudo cp "${tmp_toml}" "${RUNNER_CONFIG_TOML}"
    rm -f "${tmp_toml}"
    echo "✓ pull_policy in den [runners.docker]-Block von ${RUNNER_CONFIG_TOML} eingefuegt — sudo systemctl restart gitlab-runner nicht vergessen."
  fi
else
  echo "HINWEIS: ${RUNNER_CONFIG_TOML} nicht gefunden — pull_policy nicht gesetzt (Runner noch nicht registriert?)." >&2
fi
