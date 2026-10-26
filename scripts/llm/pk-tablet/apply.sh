#!/usr/bin/env bash
# scripts/llm/pk-tablet/apply.sh
#
# Spielt das Geraete-Loadout (devmesh/pk-tablet/loadouts.json) vom
# Dev-Rechner aus auf PK-Tablet ein. Auf dem Tablet laeuft dafuer nichts
# ausser bash, curl und systemd — die argv rendert render.mjs hier.
# Runbook: docs/runbooks/pk-tablet-inference.md
#
#   apply.sh [--host pk-tablet] [--loadouts <pfad>] [--dry-run]
#   apply.sh --bootstrap [--ts-hostname pk-tablet-linux] [--host pk-tablet] [--dry-run]
#
# Ein Lauf ist idempotent: gepinnter llama.cpp-Build, fehlende Modelle laden
# (sha256-geprueft), nicht mehr referenzierte Modelle loeschen (kleine Platte),
# Units ein/aus, ufw-Ports nur auf tailscale0, dann /health je Loadout.
# Kein WireGuard: das Mesh 192.168.100.0/24 ist seit ADR-014 abgeschaltet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

HOST="pk-tablet"
LOADOUTS=""
TS_HOSTNAME="pk-tablet-linux"
DRY_RUN=0
BOOTSTRAP=0

die() { echo "apply: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)      HOST="$2";     shift 2 ;;
    --loadouts)  LOADOUTS="$2"; shift 2 ;;
    --ts-hostname) TS_HOSTNAME="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1;     shift ;;
    --bootstrap) BOOTSTRAP=1;   shift ;;
    -h|--help)   sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unbekanntes Flag: $1" ;;
  esac
done

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

# --- Bootstrap (einmalig): Tailscale ---------------------------------------
# Erreichbar ist das Tablet nur ueber das Tailnet; ufw oeffnet die Inferenz-Ports
# ausschliesslich auf tailscale0. `tailscale up` gibt eine Login-URL aus.
if [[ "$BOOTSTRAP" -eq 1 ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "tailscale install"
    echo "tailscale up --hostname ${TS_HOSTNAME}"
    exit 0
  fi
  ssh -t "${SSH_OPTS[@]}" "$HOST" "set -e
    command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sudo sh
    sudo tailscale up --hostname ${TS_HOSTNAME}"
  echo "bootstrap ok: tailscale angemeldet als ${TS_HOSTNAME}"
  exit 0
fi

# --- Build-Pin --------------------------------------------------------------
BUILD="" BUILD_SHA=""
while read -r b s _; do
  [[ -z "$b" || "$b" == \#* ]] && continue
  BUILD="$b" BUILD_SHA="$s"; break
done < "${REPO_ROOT}/devmesh/pk-tablet/llama-build"
[[ -n "$BUILD" && ${#BUILD_SHA} -eq 64 ]] || die "devmesh/pk-tablet/llama-build: '<build> <sha256>' erwartet"

# --- Render -----------------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
render_args=(--out "${TMP}/render")
[[ -n "$LOADOUTS" ]] && render_args+=(--loadouts "$LOADOUTS")
node "${SCRIPT_DIR}/render.mjs" "${render_args[@]}" >&2 || die "render fehlgeschlagen"

declare -a SLUGS=() PORTS=()
while read -r s p; do SLUGS+=("$s"); PORTS+=("$p"); done < "${TMP}/render/ports.list"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "build ${BUILD}"
  while read -r rel _ _ bytes; do echo "model ensure ${rel} (${bytes} bytes)"; done < "${TMP}/render/models.list"
  echo "prune nicht referenzierte Modelle"
  for i in "${!SLUGS[@]}"; do echo "unit enable ${SLUGS[$i]} port ${PORTS[$i]}"; done
  echo "unit disable-others"
  for i in "${!SLUGS[@]}"; do echo "ufw allow ${PORTS[$i]} on tailscale0"; done
  for i in "${!SLUGS[@]}"; do echo "health ${SLUGS[$i]} ${PORTS[$i]}"; done
  exit 0
fi

# --- Einspielen -------------------------------------------------------------
ssh "${SSH_OPTS[@]}" "$HOST" 'rm -rf /tmp/pk-apply && mkdir -p /tmp/pk-apply'
scp -q -r "${SSH_OPTS[@]}" "${TMP}/render" "${SCRIPT_DIR}/run-loadout.sh" \
  "${SCRIPT_DIR}/llama-server@.service" "${SCRIPT_DIR}/cpu-performance.service" \
  "${HOST}:/tmp/pk-apply/"

# Eine Sitzung fuer alle Schritte, als root. Das Skript laeuft AUF dem Tablet.
ssh "${SSH_OPTS[@]}" "$HOST" "sudo BUILD='${BUILD}' BUILD_SHA='${BUILD_SHA}' bash -s" <<'REMOTE'
set -euo pipefail
shopt -s nullglob
cd /tmp/pk-apply
R=render
M=/var/lib/llama/models
fail() { echo "apply@tablet: $*" >&2; exit 1; }

# 1. llama.cpp-Build. Das Archiv enthaelt ein Verzeichnis llama-<build>/.
dir="/opt/llama/llama-${BUILD}"
if [[ ! -x "${dir}/llama-server" ]]; then
  curl -fL --retry 3 -o llama.tgz \
    "https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/llama-${BUILD}-bin-ubuntu-vulkan-x64.tar.gz"
  echo "${BUILD_SHA}  llama.tgz" | sha256sum -c --status - || fail "sha256 des llama.cpp-Archivs stimmt nicht"
  tar -xzf llama.tgz -C /opt/llama
fi
ln -sfn "$dir" /opt/llama/current
echo "build ${BUILD} ok"

# 2. Dateien und Units.
install -m 0755 run-loadout.sh /opt/llama/run-loadout.sh
install -m 0644 llama-server@.service cpu-performance.service /etc/systemd/system/
rm -f /etc/llama/*.argv
for f in "$R"/*.argv; do install -m 0644 "$f" /etc/llama/; done
systemctl daemon-reload
systemctl enable --now cpu-performance.service >/dev/null

# 3. Erst aufraeumen, dann laden: auf 32 GB entscheidet die Reihenfolge, ob
#    der Wechsel auf ein groesseres Modell ueberhaupt Platz findet.
awk '{print $1}' "$R/models.list" > keep.list
while IFS= read -r f; do
  rel="${f#"$M"/}"; rel="${rel%.part}"
  grep -qxF "$rel" keep.list || { rm -f "$f"; echo "prune ${rel}"; }
done < <(find "$M" -type f \( -name '*.gguf' -o -name '*.gguf.part' \))
find "$M" -mindepth 1 -type d -empty -delete

need=0
while read -r rel _ _ bytes; do
  [[ -f "$M/$rel" ]] || need=$(( need + bytes ))
done < "$R/models.list"
free=$(df --output=avail -B1 "$M" | tail -1)
(( need + 1073741824 < free )) || fail "zu wenig Platz: ${need} Bytes noetig, ${free} frei (1 GiB Reserve)"

while read -r rel sha url bytes; do
  f="$M/$rel"
  # Groesse statt sha256 fuer vorhandene Dateien: 6 GB bei jedem Lauf zu
  # hashen kostet auf der eMMC Minuten. Neu Geladenes wird voll geprueft.
  if [[ -f "$f" && $(stat -c %s "$f") -eq "$bytes" ]]; then echo "model keep ${rel}"; continue; fi
  install -d -o llama -g llama "$(dirname "$f")"
  curl -fL --retry 3 -C - -o "${f}.part" "$url"
  echo "${sha}  ${f}.part" | sha256sum -c --status - || { rm -f "${f}.part"; fail "sha256 von ${rel} stimmt nicht"; }
  mv "${f}.part" "$f"; chown llama:llama "$f"
  echo "model fetch ${rel}"
done < "$R/models.list"

# 4. Units: alles aus, was nicht im Loadout steht; den Rest (neu) starten.
for u in $( { systemctl list-units --all --plain --no-legend 'llama-server@*' | awk '{print $1}'
              ls /etc/systemd/system/multi-user.target.wants/ | grep '^llama-server@' || true; } | sort -u); do
  slug="${u#llama-server@}"; slug="${slug%.service}"
  grep -qxF "$slug" "$R/enabled.list" || { systemctl disable --now "$u" >/dev/null 2>&1 || true; echo "unit disable ${slug}"; }
done
while read -r slug; do
  systemctl enable "llama-server@${slug}.service" >/dev/null 2>&1
  systemctl restart "llama-server@${slug}.service"
  echo "unit enable ${slug}"
done < "$R/enabled.list"

# 5. Firewall: Inferenz-Ports nur ueber das Tailnet, nie ins LAN.
while n=$(ufw status numbered | awk -F'[][]' '/# llama-/ {print $2; exit}' | tr -d ' '); [[ -n "$n" ]]; do
  ufw --force delete "$n" >/dev/null
done
while read -r slug port; do
  ufw allow in on tailscale0 to any port "$port" proto tcp comment "llama-${slug}" >/dev/null
done < "$R/ports.list"

# 6. Health. Ein 6-GB-Modell von der eMMC laden dauert; 300 s Geduld.
rc=0
while read -r slug port; do
  ok=0
  for _ in $(seq 150); do
    curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && { ok=1; break; }
    sleep 2
  done
  if [[ "$ok" -eq 1 ]]; then echo "health ${slug} ${port} ok"; else
    echo "health ${slug} ${port} TIMEOUT" >&2
    journalctl -u "llama-server@${slug}" -n 50 --no-pager >&2 || true
    rc=1
  fi
done < "$R/ports.list"
exit "$rc"
REMOTE

echo "apply ok: ${SLUGS[*]}"
