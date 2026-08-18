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
  # [T012410] Unter Docker Desktop ist dieser Pfad WIRKUNGSLOS — der Daemon laeuft
  # in der Docker-Desktop-VM und liest seine Konfiguration von der Windows-Seite.
  # Das Skript meldete den Merge frueher trotzdem als Erfolg. Eine Erfolgsmeldung
  # ueber eine wirkungslose Aenderung ist schaedlicher als gar keine: sie beendet
  # die Suche nach der Ursache an der falschen Stelle.
  #
  # Die Erkennung laeuft ueber `docker info`, das im Dry-Run gelesen, aber nichts
  # veraendert; fehlt docker, entfaellt der Hinweis stillschweigend (der Dry-Run
  # muss ohne installiertes docker mit Exit 0 durchlaufen — bestehende Zusicherung).
  if command -v docker >/dev/null 2>&1 \
     && docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi 'docker desktop'; then
    echo "  ACHTUNG: Dieser Host laeuft mit DOCKER DESKTOP — ${DAEMON_JSON} ist hier wirkungslos."
    echo "           Registry-Mirror stattdessen eintragen unter:"
    echo "             Docker Desktop -> Settings -> Docker Engine"
    echo "           pull_policy (unten) wirkt unabhaengig davon und ist der groessere Hebel."
  else
    echo "  (Hinweis: unter Docker Desktop waere dieser Pfad wirkungslos — Konfiguration liegt dort auf der Windows-Seite.)"
  fi
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
if sudo test -f "${RUNNER_CONFIG_TOML}" && ! sudo grep -qE '^[[:space:]]*\[runners\.docker\]' "${RUNNER_CONFIG_TOML}"; then
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

# 2. pull_policy im bestehenden self-hosted Runner — VORGEZOGEN [T012410].
#
#    Dieser Schritt stand frueher als Nummer 3 HINTER dem Docker-Neustart.
#    Das war die teuerste denkbare Reihenfolge: pull_policy ist der groesste
#    Einzelhebel fuer die Laufzeit UND der einzige Schritt, der den
#    Docker-Daemon gar nicht braucht. Auf einem Host ohne
#    systemd-docker.service (Docker Desktop unter WSL, rootless) brach das
#    Skript unter `set -euo pipefail` am Neustart ab — und liess ausgerechnet
#    den wertvollsten Schritt aus, waehrend die beiden dort wirkungslosen
#    Schritte durchliefen. Belegt am 2026-08-18 auf PK-Desktop: daemon.json
#    gemerged, Neustart fehlgeschlagen, `grep -c pull_policy config.toml` = 0.
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
# `sudo test -f` statt `[ -f ... ]` [T012410]: /etc/gitlab-runner ist bei einer
# Standardinstallation 0700 root. Ein unprivilegierter Existenztest ist dort
# IMMER falsch — das Skript uebersprang pull_policy dann still und meldete
# "Runner noch nicht registriert?", also die falsche Ursache. Jeder Lese- und
# Schreibzugriff auf diese Datei laeuft ohnehin ueber sudo; nur der Existenztest
# tat es nicht.
if sudo test -f "${RUNNER_CONFIG_TOML}"; then
  # "Bereits gesetzt" heisst: JEDER [runners.docker]-Block traegt die Zeile —
  # nicht "irgendeiner" [T012410]. Die frueher hier stehende Erste-Fundstelle-
  # Pruefung meldete auf einem Mehr-Runner-Host "bereits gesetzt", sobald ein
  # BELIEBIGER Block sie hatte, und der noch fehlende Block bekam sie nie.
  # Zusammen mit dem ebenfalls nur erst-treffenden Insert ergab das den
  # stabilen Fehlzustand: Zeile im falschen Runner, Erfolgsmeldung, unveraenderte
  # Laufzeit.
  already_set="$(sudo awk '
    /^[[:space:]]*\[runners\.docker\]/ { in_block=1; blocks++; n[blocks]=0; next }
    /^[[:space:]]*\[/ { in_block=0 }
    in_block && /pull_policy[[:space:]]*=[[:space:]]*\["if-not-present"\]/ { n[blocks]++ }
    END {
      # "sauber" heisst: jeder Block hat GENAU EINE Zeile. Ein Block mit zwei
      # Zeilen ist ein doppelter TOML-Key und damit ein Parse-Fehler — er muss
      # den Normalisierungslauf ausloesen, nicht uebersprungen werden.
      if (blocks == 0) exit
      for (i = 1; i <= blocks; i++) if (n[i] != 1) exit
      print "yes"
    }
  ' "${RUNNER_CONFIG_TOML}")"

  if [ "${already_set}" = "yes" ]; then
    echo "✓ pull_policy bereits im [runners.docker]-Block von ${RUNNER_CONFIG_TOML} gesetzt."
  else
    tmp_toml="$(mktemp)"
    # shellcheck disable=SC2024 # gewollt: sudo hebt nur das Lesen der
    # privilegierten Datei an, der tmp_toml-Schreibzugriff bleibt bewusst beim
    # aktuellen Benutzer (mktemp-Datei); der privilegierte Rueckschreibschritt
    # ist der separate `sudo cp` darunter.
    # JEDER [runners.docker]-Block, nicht nur der erste [T012410]. Das frueher
    # hier stehende globale `!inserted`-Flag traf auf einem Host mit mehreren
    # registrierten Runnern den falschen Block — belegt am 2026-08-18: die Zeile
    # landete in "Gitlabrunner", waehrend "bachelorprojekt fleet self-hosted" die
    # Jobs fuhr. Das Skript meldete Erfolg, die Laufzeit blieb unveraendert.
    #
    # pull_policy ist eine Executor-Einstellung ohne Seiteneffekt auf andere
    # Runner; sie auf jeden Docker-Executor des Hosts anzuwenden ist die richtige
    # Semantik und bleibt idempotent (die Skip-Pruefung oben greift beim
    # naechsten Lauf).
    # Konstruktiv idempotent: erst JEDE vorhandene pull_policy-Zeile innerhalb
    # eines [runners.docker]-Blocks entfernen, dann in JEDEN Block genau eine
    # einsetzen. Ein reines "nach dem Header einfuegen" erzeugt sonst bei einem
    # Zweitlauf ueber einen teilweise gepflegten Host einen DOPPELTEN Key in
    # derselben TOML-Tabelle — und ein doppelter Key ist ein Parse-Fehler, also
    # ein kaputter Runner statt einer harmlosen Wiederholung.
    sudo awk '
      /^[[:space:]]*\[runners\.docker\]/ { in_block=1; print; print "  pull_policy = [\"if-not-present\"]"; next }
      /^[[:space:]]*\[/ { in_block=0 }
      in_block && /^[[:space:]]*pull_policy[[:space:]]*=/ { next }
      { print }
    ' "${RUNNER_CONFIG_TOML}" > "${tmp_toml}"
    sudo cp "${tmp_toml}" "${RUNNER_CONFIG_TOML}"
    rm -f "${tmp_toml}"
    echo "✓ pull_policy in den [runners.docker]-Block von ${RUNNER_CONFIG_TOML} eingefuegt — sudo systemctl restart gitlab-runner nicht vergessen."
  fi
else
  echo "HINWEIS: ${RUNNER_CONFIG_TOML} nicht gefunden — pull_policy nicht gesetzt (Runner noch nicht registriert?)." >&2
fi

# 3. Anbindung im Docker-Daemon (registry-mirrors) — Merge statt Ueberschreiben.
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

# Der Neustart ist ab hier NICHT mehr fatal [T012410]: pull_policy ist bereits
# gesetzt, und auf einem Host, dessen Docker gar keine systemd-Unit ist, waere
# ein Abbruch hier eine Fehlermeldung ueber einen Schritt, den es dort nicht gibt.
if systemctl list-unit-files docker.service >/dev/null 2>&1 \
   && systemctl cat docker.service >/dev/null 2>&1; then
  if sudo systemctl restart docker; then
    echo "✓ Docker-Daemon neu gestartet."
  else
    echo "WARNUNG: Neustart von docker.service fehlgeschlagen — registry-mirrors sind noch nicht aktiv." >&2
  fi
else
  echo "HINWEIS: keine systemd-Unit docker.service gefunden." >&2
  if docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi 'docker desktop'; then
    echo "         Dieser Host laeuft mit DOCKER DESKTOP. ${DAEMON_JSON} ist hier WIRKUNGSLOS —" >&2
    echo "         der Daemon laeuft in der Docker-Desktop-VM und liest seine Konfiguration von" >&2
    echo "         der Windows-Seite. Registry-Mirror dort eintragen:" >&2
    echo "           Docker Desktop -> Settings -> Docker Engine -> \"registry-mirrors\": [\"http://localhost:${CACHE_PORT}\"]" >&2
    echo "         danach Docker Desktop neu starten." >&2
  else
    echo "         Docker-Daemon manuell neu starten, damit registry-mirrors greifen." >&2
  fi
  echo "         pull_policy ist unabhaengig davon bereits gesetzt (Schritt 2)." >&2
fi
