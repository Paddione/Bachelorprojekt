#!/usr/bin/env bash
# scripts/wg-mesh-sync.sh
# T900083: reconcile + drift fuer das WireGuard-Mesh, auf EINEM gemeinsamen
# Renderer (scripts/hetzner/generate-wg-conf.sh --peers-only). wg-mesh-sync.sh
# ist per Konstruktion nicht in der Lage, eine andere Soll-Menge zu berechnen
# als der Reconcile herstellt — beide rufen denselben Modus desselben Skripts.
#
# Usage:
#   wg-mesh-sync.sh reconcile --env <env> [--dry-run] [--node <name>] [--prune]
#   wg-mesh-sync.sh drift     --env <env> [--node <name>]
#
# reconcile: fuer jeden Node der Umgebung wird die Soll-Peer-Menge (aus der
#   Registry gerendert) mit der Ist-Peer-Menge (`wg show <iface> peers`)
#   verglichen. Fehlende Peers werden per `wg set` ergaenzt (sofort wirksam)
#   UND als [Peer]-Block an /etc/wireguard/<iface>.conf angehaengt (idempotent
#   per grep gegen den bereits gelesenen Ist-Stand der Datei) — der bestehende
#   [Interface]-Block bleibt dabei UNANGETASTET. `wg showconf` waere hier ein
#   Datenverlust: es gibt im [Interface]-Block nur ListenPort und PrivateKey
#   aus, `Address` (wg-quick-Erweiterung) fehlt dort und ginge beim
#   Zurueckschreiben verloren — unbemerkt bis zum naechsten `wg-quick up`
#   (Reboot), wo das Interface dann ohne IP hochkaeme (auf wg-fleet bindet
#   dort flannel; ein clusterweiter Pod-Netzwerkausfall). Vor jeder Aenderung
#   wird eine Sicherung angelegt; schlaegt sie fehl, bricht der Node-Durchlauf
#   ab statt ungesichert weiterzumachen. Ueberzaehlige Peers werden NUR mit
#   --prune entfernt (gezielt der betroffene [Peer]-Block), damit ein
#   unvollstaendiger Registry-Stand keinen laufenden Tunnel abraeumt.
#   --dry-run zeigt nur die Differenz, aendert nichts (keine SSH-Aktion, die
#   den Zielzustand veraendert).
#
# drift: vergleicht Ist- gegen Soll-Peer-Menge je Node, ohne zu aendern.
#   Abweichung -> Exit != 0 mit namentlicher Nennung. Sind die Nodes nicht
#   erreichbar (ssh-Verbindung selbst scheitert, Exit 255), Exit 0 mit
#   Skip-Meldung — dasselbe Verhalten wie scripts/fleet-membership-check.sh,
#   damit das Gate ohne Cluster-/Node-Zugang nicht faelschlich rot wird. Steht
#   die ssh-Verbindung, scheitert aber der Remote-Befehl (z. B. fehlende
#   sudo-NOPASSWD-Regel), ist das KEIN Skip, sondern Exit != 0 — sonst waere
#   ein gruenes Gate nicht dasselbe wie ein tatsaechlich geprueftes Mesh.
#
# Der Interface-Name kommt aus dem `interface:`-Key des Umgebungsblocks in
# wireguard/wg-mesh-nodes.yaml. Fehlt er (aktuell: korczewski, nicht am
# laufenden Node verifiziert), lehnt dieses Skript die Umgebung mit klarer
# Meldung ab, statt einen Namen zu raten.
#
# Der SSH-Aufruf geht ueber WG_MESH_SYNC_SSH (Default: ssh), damit Tests jeden
# Remote-Aufruf stubben/protokollieren koennen, statt echte Nodes anzufassen.
#
# Registry-Override fuer Tests: WG_REGISTRY_FILE=<pfad>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REGISTRY_FILE="${WG_REGISTRY_FILE:-${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml}"
GEN_SCRIPT="${WG_MESH_SYNC_GEN_SCRIPT:-${SCRIPT_DIR}/hetzner/generate-wg-conf.sh}"
SSH_CMD="${WG_MESH_SYNC_SSH:-ssh}"
SSH_USER="${WG_MESH_SYNC_SSH_USER:-patrick}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)

usage() {
  cat <<'EOF'
Usage:
  wg-mesh-sync.sh reconcile --env <env> [--dry-run] [--node <name>] [--prune]
  wg-mesh-sync.sh drift     --env <env> [--node <name>]
EOF
}

SUBCOMMAND="${1:-}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$SUBCOMMAND" in
  reconcile|drift) ;;
  *)
    echo "ERROR: Subkommando muss 'reconcile' oder 'drift' sein (erhalten: '${SUBCOMMAND}')" >&2
    usage >&2
    exit 1
    ;;
esac

ENV=""
DRY_RUN=false
PRUNE=false
NODE_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        ENV="$2";         shift 2 ;;
    --dry-run)    DRY_RUN=true;      shift ;;
    --prune)      PRUNE=true;        shift ;;
    --node)       NODE_FILTER="$2"; shift 2 ;;
    --mesh-file)  REGISTRY_FILE="$2"; shift 2 ;;
    *) echo "ERROR: unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -z "$ENV" ]] && { echo "ERROR: --env ist erforderlich" >&2; exit 1; }
[[ ! -f "$REGISTRY_FILE" ]] && { echo "ERROR: Registry nicht gefunden: $REGISTRY_FILE" >&2; exit 2; }

# ── Interface-Name aufloesen ────────────────────────────────────────
if ! INTERFACE="$(python3 - "$REGISTRY_FILE" "$ENV" <<'PY'
import sys, yaml

mesh_file, env = sys.argv[1:]
with open(mesh_file) as f:
    mesh = yaml.safe_load(f) or {}

if env not in mesh:
    print(f"ERROR: env '{env}' nicht in der Registry ({mesh_file}) gefunden.", file=sys.stderr)
    sys.exit(1)

iface = (mesh[env] or {}).get("interface")
if not iface:
    print(
        f"ERROR: env '{env}' hat keinen 'interface:'-Key in der Registry. "
        f"Der Interface-Name wurde fuer diese Umgebung noch nicht an einem "
        f"laufenden Node verifiziert (siehe Kommentar im Registry-Block) — "
        f"wg-mesh-sync.sh raet nicht, sondern bricht ab.",
        file=sys.stderr,
    )
    sys.exit(1)

print(iface)
PY
)"; then
  exit 1
fi

# Auch hier CR entfernen: ein \r im Interface-Namen wanderte sonst in jedes
# Remote-Kommando (sudo wg show <iface>\r peers) und liesse es scheitern.
INTERFACE="$(printf '%s' "$INTERFACE" | tr -d '\r')"

# ── Nodes der Umgebung auflisten: "<name>\t<host-oder-leer>" ───────
list_nodes() {
  # tr -d CR: Windows-Python schreibt CRLF. Ein Carriage-Return im Host laesst
  # ssh mit "hostname contains invalid characters" (rc=255) scheitern — das sah
  # hier wie ein toter Node aus, und drift endete faelschlich mit Exit 0.
  python3 - "$REGISTRY_FILE" "$ENV" "$NODE_FILTER" <<'PY' | tr -d '\r'
import sys, yaml

mesh_file, env, node_filter = sys.argv[1:]
with open(mesh_file) as f:
    mesh = yaml.safe_load(f) or {}

env_data = mesh.get(env) or {}
categories = ("nodes", "gpu_hosts", "home_workers", "workers", "devc_servers", "laptops")
for cat in categories:
    for node in env_data.get(cat) or []:
        name = node.get("name")
        if not name:
            continue
        if node_filter and name != node_filter:
            continue
        endpoint = node.get("endpoint") or ""
        host = endpoint.rsplit(":", 1)[0] if endpoint else ""
        print(f"{name}\t{host}")
PY
}

# Soll-Peer-Menge eines Nodes: Zeilen "<public_key> <allowed_ips>".
want_peers() {
  local node_name="$1"
  bash "$GEN_SCRIPT" --env "$ENV" --node-name "$node_name" --peers-only --mesh-file "$REGISTRY_FILE" | tr -d '\r'
}

# Ist-Peer-Menge eines Nodes ueber SSH: eine Public-Key-Zeile je Peer (Format
# von `wg show <iface> peers`).
#
# Rueckgabe unterscheidet ZWEI Fehlerarten, die vorher nicht zu unterscheiden
# waren (Review-Befund PR #5489): eine SSH-Verbindung, die gar nicht zustande
# kommt (Timeout, Refused, DNS) beendet den ssh-Client selbst mit Exit 255 —
# das ist ein legitimer Skip (Node nicht erreichbar). Jeder ANDERE
# Nicht-Null-Exit bedeutet: die Verbindung stand, aber der Remote-Befehl
# scheiterte (z. B. fehlende NOPASSWD-Regel fuer sudo) — das ist eine echte
# Stoerung und darf nicht als "offline" durchgehen, sonst ist ein gruenes
# `drift`-Gate nicht dasselbe wie ein tatsaechlich geprueftes Mesh.
#
# Gibt die Ist-Peer-Menge auf stdout aus und propagiert den echten Exit-Code
# des ssh-Aufrufs als eigenen Rueckgabewert (255 = ssh selbst gescheitert,
# jeder andere Nicht-Null-Wert = Verbindung stand, Remote-Befehl scheiterte).
# WICHTIG: dieser Code wird per $(...) im Aufrufer verwendet — Variablen, die
# HIER gesetzt werden, ueberleben die Subshell-Grenze von $(...) nicht; nur
# der Exit-Code (return/$?) tut das, deshalb wird ausschliesslich darueber
# kommuniziert.
have_peers() {
  local host="$1"
  local err_file out rc
  err_file="$(mktemp)"
  out="$("$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" "sudo wg show ${INTERFACE} peers" 2>"$err_file")"
  rc=$?
  if [[ $rc -ne 0 ]]; then
    if [[ $rc -ne 255 ]]; then
      echo "STDERR ${host}: $(cat "$err_file")" >&2
    fi
    rm -f "$err_file"
    return "$rc"
  fi
  rm -f "$err_file"
  printf '%s' "$out"
  return 0
}

NODE_LIST="$(list_nodes)"
if [[ -z "$NODE_LIST" ]]; then
  echo "ERROR: env '$ENV' hat keine Nodes in der Registry (oder --node trifft keinen)." >&2
  exit 2
fi

ANY_REACHABLE=false
REMOTE_ERROR=false
DRIFT_FOUND=false
DRIFT_REPORT=()

# fd 3 statt stdin: jedes ssh in der Schleife wuerde sonst die restliche
# Node-Liste als eigenen stdin verschlucken — die Schleife braeche nach dem
# ERSTEN Node ab und das Gate meldete Gruen fuer ungeprueftes Mesh.
while IFS=$'\t' read -r -u 3 name host; do
  [[ -z "$name" ]] && continue

  if [[ -z "$host" ]]; then
    echo "SKIP ${name}: kein endpoint in der Registry — nicht per SSH erreichbar." >&2
    continue
  fi

  if have_out="$(have_peers "$host")"; then
    have_rc=0
  else
    have_rc=$?
  fi
  if [[ "$have_rc" -ne 0 ]]; then
    if [[ "$have_rc" -eq 255 ]]; then
      echo "SKIP ${name} (${host}): nicht erreichbar (SSH-Verbindung fehlgeschlagen)." >&2
    else
      echo "ERROR ${name} (${host}): Remote-Befehl fehlgeschlagen (Exit ${have_rc}) — ssh-Verbindung stand, 'sudo wg show' scheiterte (fehlende NOPASSWD-Regel?). Siehe STDERR-Zeile oben." >&2
      REMOTE_ERROR=true
    fi
    continue
  fi
  ANY_REACHABLE=true

  want_out="$(want_peers "$name")"
  want_keys="$(printf '%s\n' "$want_out" | awk 'NF{print $1}' | sort -u)"
  have_keys="$(printf '%s\n' "$have_out" | awk 'NF{print $1}' | sort -u)"

  missing="$(comm -23 <(printf '%s\n' "$want_keys") <(printf '%s\n' "$have_keys"))"
  extra="$(comm -13 <(printf '%s\n' "$want_keys") <(printf '%s\n' "$have_keys"))"

  if [[ -z "$missing" && -z "$extra" ]]; then
    echo "OK ${name} (${host}): Ist-Peer-Menge entspricht der Soll-Menge."
    continue
  fi

  DRIFT_FOUND=true
  DRIFT_REPORT+=("${name} (${host}):")
  if [[ -n "$missing" ]]; then
    DRIFT_REPORT+=("  fehlend (in Registry, nicht auf dem Node):")
    while read -r k; do [[ -n "$k" ]] && DRIFT_REPORT+=("    ${k}"); done <<<"$missing"
  fi
  if [[ -n "$extra" ]]; then
    DRIFT_REPORT+=("  ueberzaehlig (auf dem Node, nicht in Registry):")
    while read -r k; do [[ -n "$k" ]] && DRIFT_REPORT+=("    ${k}"); done <<<"$extra"
  fi

  if [[ "$SUBCOMMAND" == "reconcile" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRY-RUN ${name} (${host}): wuerde $(printf '%s\n' "$missing" | grep -c . 2>/dev/null || true) Peer(s) ergaenzen"
      [[ "$PRUNE" == true ]] && echo "DRY-RUN ${name} (${host}): wuerde $(printf '%s\n' "$extra" | grep -c . 2>/dev/null || true) Peer(s) entfernen (--prune)"
      continue
    fi

    # `wg showconf` gibt im [Interface]-Block NUR ListenPort und PrivateKey
    # aus — `Address` ist eine wg-quick-Erweiterung und fehlt dort (verifiziert
    # 2026-09-04 gegen pk-hetzner-4, PR #5489 Review). Ein Rueckschreiben ueber
    # `wg showconf | tee <iface>.conf` haette also bei jedem reconcile die
    # Address-Zeile gelöscht — der laufende Tunnel haette es nicht bemerkt,
    # aber der naechste `wg-quick up` (Reboot, Service-Restart) waere ohne IP
    # hochgekommen. Auf wg-fleet bindet dort flannel via
    # --flannel-iface=wg-fleet — ein clusterweiter Pod-Netzwerkausfall.
    #
    # Deshalb: der bestehende [Interface]-Block bleibt UNANGETASTET. Fehlende
    # Peers werden als [Peer]-Bloecke an die vorhandene Datei angehaengt
    # (idempotent per grep -qF <pubkey> gegen den bereits gelesenen Ist-Stand
    # der Datei), analog zu dem, was in T900082 von Hand gemacht wurde.
    existing_conf="$("$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" "sudo cat /etc/wireguard/${INTERFACE}.conf" 2>/dev/null)"
    if [[ -z "$existing_conf" ]]; then
      echo "ERROR ${name} (${host}): /etc/wireguard/${INTERFACE}.conf konnte nicht gelesen werden — abgebrochen, keine Aenderung." >&2
      REMOTE_ERROR=true
      continue
    fi

    # Sicherung der laufenden Config VOR jeder Aenderung. Bricht ab, wenn die
    # Sicherung fehlschlaegt — sonst ueberschreibt eine fehlgeschlagene
    # Sicherung stillschweigend weder Original noch Backup, aber der Rest des
    # Laufs wuerde ohne Netz weitermachen (Review-Befund #2).
    if ! "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
        "sudo cp /etc/wireguard/${INTERFACE}.conf /etc/wireguard/${INTERFACE}.conf.bak.\$(date +%Y%m%d%H%M%S)"; then
      echo "ERROR ${name} (${host}): Sicherung von ${INTERFACE}.conf fehlgeschlagen — abgebrochen, keine Aenderung." >&2
      REMOTE_ERROR=true
      continue
    fi

    append_text=""
    while read -r pubkey; do
      [[ -z "$pubkey" ]] && continue
      if printf '%s\n' "$existing_conf" | grep -qF "$pubkey"; then
        continue  # bereits in der Datei — idempotent, nichts zu tun
      fi
      allowed="$(printf '%s\n' "$want_out" | awk -v k="$pubkey" '$1==k{ $1=""; sub(/^ /,""); print }')"
      echo "APPLY ${name} (${host}): ergaenze Peer ${pubkey}"
      "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
        "sudo wg set ${INTERFACE} peer ${pubkey} allowed-ips ${allowed}"
      append_text+=$'\n'"[Peer]"$'\n'"PublicKey = ${pubkey}"$'\n'"AllowedIPs = ${allowed}"$'\n'
    done <<<"$missing"

    if [[ -n "$append_text" ]]; then
      printf '%s' "$append_text" | "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
        "sudo tee -a /etc/wireguard/${INTERFACE}.conf > /dev/null"
    fi

    if [[ "$PRUNE" == true ]]; then
      while read -r pubkey; do
        [[ -z "$pubkey" ]] && continue
        echo "APPLY ${name} (${host}): entferne ueberzaehligen Peer ${pubkey} (--prune)"
        "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
          "sudo wg set ${INTERFACE} peer ${pubkey} remove"
        # Nur den [Peer]-Block dieses Keys aus der Datei entfernen — der
        # [Interface]-Block und alle anderen [Peer]-Bloecke bleiben stehen.
        "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" "
          key='PublicKey = ${pubkey}'
          tmp=\$(mktemp)
          sudo awk -v key=\"\$key\" '
            /^\[Peer\]/ { if (buf != \"\" && buf !~ key) printf \"%s\", buf; buf=\$0 ORS; next }
            { buf = buf \$0 ORS }
            END { if (buf !~ key) printf \"%s\", buf }
          ' /etc/wireguard/${INTERFACE}.conf | sudo tee \"\$tmp\" > /dev/null &&
          sudo mv \"\$tmp\" /etc/wireguard/${INTERFACE}.conf
        "
      done <<<"$extra"
    fi
  fi
done 3<<<"$NODE_LIST"

# Ein Node, dessen ssh-Verbindung stand, aber dessen Remote-Befehl scheiterte
# (z. B. fehlende sudo-NOPASSWD-Regel), ist NICHT "nicht erreichbar" und darf
# das Gate nicht gruen durchlassen — sonst ist ein gruenes drift/reconcile
# nicht dasselbe wie ein tatsaechlich geprueftes Mesh (Review-Befund #3).
if [[ "$REMOTE_ERROR" == true ]]; then
  echo "wg-mesh-sync ${SUBCOMMAND}: mindestens ein Remote-Befehl ist fehlgeschlagen (siehe ERROR-Zeilen oben) — kein Skip, das ist eine echte Stoerung." >&2
  exit 1
fi

if [[ "$ANY_REACHABLE" == false ]]; then
  echo "wg-mesh-sync ${SUBCOMMAND}: keine Node(s) von env '${ENV}' erreichbar — uebersprungen."
  exit 0
fi

if [[ "$SUBCOMMAND" == "drift" ]]; then
  if [[ "$DRIFT_FOUND" == true ]]; then
    echo "wg-mesh-sync drift: DRIFT in env '${ENV}' (interface ${INTERFACE})" >&2
    printf '%s\n' "${DRIFT_REPORT[@]}" >&2
    exit 1
  fi
  echo "wg-mesh-sync drift: OK — env '${ENV}' (interface ${INTERFACE}) ist deckungsgleich."
  exit 0
fi

# reconcile: nach erfolgreicher Anwendung (oder --dry-run) Exit 0, es sei denn
# es blieb unloesbare Drift (kann bei diesem Skript nicht auftreten, da jede
# fehlende Zeile behandelt wird) — defensiv trotzdem geprueft.
exit 0
