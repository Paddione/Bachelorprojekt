---
title: "devmesh-k3s-cluster — Implementation Plan"
ticket_id: T900117
domains: [infra, testing]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [devmesh-tailnet]
---

# devmesh-k3s-cluster — Implementation Plan

_Ticket: T900117 · Programm: T900115 (ADR-008, Nachtrag 2026-09-11) · blocked_by: T900116 (SP-1) · Design: `openspec/changes/devmesh-k3s-cluster/design.md` · Delta: `openspec/changes/devmesh-k3s-cluster/specs/local-dev-mesh.md`_

## File Structure

```
scripts/devmesh/k3s-install.sh                     NEU  Installation je Host nach Inventar-Rolle, DRY_RUN, idempotent, ufw
scripts/devmesh/preflight.sh                       NEU  Host-Pruefung (RAM, Swap, NTP, Ports, ROTA, Peers); Client- und --local-Modus
scripts/devmesh/kubeconfig.sh                      NEU  k3s.yaml holen, auf Tailnet-Namen umschreiben, als Context devmesh mergen (nur yq)
scripts/devmesh/status.sh                          NEU  Knoten, etcd-Mitglieder, Alter des juengsten etcd-Snapshots
taskfiles/Taskfile.devmesh.yml                     AEND Tasks preflight, install, kubeconfig, status (Datei und Include aus SP-1)
devmesh/inventory.yaml                             AEND k3s_version, je Server k3s_role und labels (Datei aus SP-1)
docs/agent-guide/registry/networks.yaml            AEND neue Eintraege devmesh-pod-cidr, devmesh-service-cidr; Gegenseite in home-lan.overlaps
docs/agent-guide/maps/networks-map.md              AEND generiert (task networks:map)
tests/spec/local-dev-mesh/fixtures/inventory.yaml  NEU  Test-Inventar mit erfundenen Tailnet-Namen
tests/spec/local-dev-mesh/k3s-install.bats         NEU
tests/spec/local-dev-mesh/preflight.bats           NEU
tests/spec/local-dev-mesh/kubeconfig.bats          NEU
tests/spec/local-dev-mesh/status.bats              NEU
tests/spec/local-dev-mesh/devmesh-networks.bats    NEU  Spec-Szenario "devmesh networks differ from fleet networks"
tests/spec/local-dev-mesh/devmesh-taskfile.bats    AEND neue @test-Faelle (Datei aus SP-1)
components/website/src/data/test-inventory.json    AEND regeneriert
```

**S1:** Keine Datei ist in `docs/code-quality/baseline.json` gebaselined (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json` liefert fuer alle `nicht-baselined`). Die vier neuen `.sh`-Dateien fallen unter das `.sh`-Limit aus `yq '.s1.limits' docs/code-quality/gates.yaml` (800) und bleiben mit je 90–170 Zeilen weit darunter. `taskfiles/Taskfile.devmesh.yml`, `devmesh/inventory.yaml`, `docs/agent-guide/registry/networks.yaml`, `docs/agent-guide/maps/networks-map.md` und die `.bats`-Dateien haben kein Extension-Limit (`.yml`, `.yaml`, `.md`, `.bats` fehlen in `s1.limits`). Kein Split noetig.

**S3:** Keine Brand-Domains. Tailnet-Namen stehen nur im Inventar, im Test-Fixture sind sie erfunden (`*.example-tailnet.ts.net`).

**S4:** Alle vier Skripte werden in Task 5 aus `taskfiles/Taskfile.devmesh.yml` referenziert.

**Vorbedingung vor Task 1:** SP-1 (`devmesh-tailnet`, T900116) ist nach `main` gemergt. SP-1 legt `taskfiles/Taskfile.devmesh.yml` (Task `tailnet:check`), den Include in `Taskfile.yml`, `devmesh/inventory.yaml` (`gpu_endpoint` plus `.peers[]` mit `name`, `role`, `tag`, `lan_ip`, `tailnet_name`) und `tests/spec/local-dev-mesh/devmesh-taskfile.bats` an. Dieser Plan erweitert diese Dateien nur. Fehlt eine davon auf `origin/main`, stoppen, statt sie hier anzulegen:

```bash
git fetch origin && git rebase origin/main
for f in taskfiles/Taskfile.devmesh.yml devmesh/inventory.yaml tests/spec/local-dev-mesh/devmesh-taskfile.bats; do
  git show "origin/main:$f" >/dev/null 2>&1 && echo "OK $f" || echo "FEHLT $f"
done
grep -nF 'Taskfile.devmesh.yml' Taskfile.yml
yq '.peers[0] | keys' devmesh/inventory.yaml
```

SP-1 aendert in `docs/agent-guide/registry/networks.yaml` den Eintrag `tailscale`. Dieser Plan fasst ihn nicht an. Er ergaenzt nur die zwei neuen devmesh-Eintraege und, weil `scripts/networks-check.mjs` jede Ueberschneidung von beiden Seiten erklaert verlangt, zwei `overlaps`-Zeilen im Eintrag `home-lan`.

SP-1 traegt kurze Tailnet-Namen ein (`gpu-metal`). Die Skripte uebernehmen den Wert unveraendert fuer `--tls-san` und als Kubeconfig-Server. Das Test-Fixture nutzt erfundene FQDNs, fuer die Skripte ist das gleichwertig.

## Risiken und Annahmen

- **R1** Plattentyp, belegte Ports und der Bindepunkt von `gpupod` (:8080) sind unbekannt, bis Task 7 sie misst. Rotierende etcd-Platte oder belegter k3s-Port stoppt den Plan vor der Installation.
- **R2** `ufw --force enable` sperrt jeden nicht freigegebenen Listener. Task 7 misst die Clients von `gpupod` und legt vor der Installation eine eigene Regel an.
- **R3** (entschieden) devmesh nutzt auf allen Servern `--cluster-cidr 10.52.0.0/16`, `--service-cidr 10.53.0.0/16` und `--cluster-dns 10.53.0.10`. Grund: fleet belegt `10.42.0.0/16` und `10.43.0.0/16`, und PK-Desktop routet die fleet-Pod-Netze ueber `wg-gpu`. Die devmesh-Bereiche liegen weiter im Heim-/8. Das wird in der Registry wie bei fleet beidseitig erklaert (Task 5). Ein spaeterer Wechsel verlangt eine Neuinstallation, deshalb stehen die Werte vor Task 8 fest.
- **R4** `status.sh` liest `.status.creationTime` der `ETCDSnapshotFile`-Ressourcen (k3s ≥ 1.27). Task 8 verifiziert das Feld live, bevor die Abnahme darauf baut.
- **R5** Knotennamen sind die Hostnamen. Task 6 prueft, dass sie den Inventar-Namen entsprechen.

---

### Task 1: Test-Inventar und Guards fuer `k3s-install.sh` (RED)

**Dateien:** `tests/spec/local-dev-mesh/fixtures/inventory.yaml` (neu), `tests/spec/local-dev-mesh/k3s-install.bats` (neu)

- [ ] **1.1** `tests/spec/local-dev-mesh/fixtures/inventory.yaml` anlegen:

```yaml
# Test-Fixture fuer tests/spec/local-dev-mesh/*.bats [T900117] — NICHT das echte Inventar.
# Tailnet-Namen sind erfunden; die echten Werte stehen in devmesh/inventory.yaml.
k3s_version: v1.36.1+k3s1
peers:
  - name: gpu-metal
    role: server
    tag: tag:devmesh
    lan_ip: 10.1.0.101
    tailnet_name: gpu-metal.example-tailnet.ts.net
    k3s_role: server-init
    labels: []
  - name: gpu-cluster
    role: server
    tag: tag:devmesh
    lan_ip: 10.10.10.2
    tailnet_name: gpu-cluster.example-tailnet.ts.net
    k3s_role: server-join
    labels: []
  - name: gpu-cluster2
    role: server
    tag: tag:devmesh
    lan_ip: 10.10.10.3
    tailnet_name: gpu-cluster2.example-tailnet.ts.net
    k3s_role: server-join
    labels: [storage=true]
  - name: pk-desktop
    role: client
    tag: tag:devclient
    lan_ip: 10.10.0.3
    tailnet_name: pk-desktop.example-tailnet.ts.net
```

- [ ] **1.2** `tests/spec/local-dev-mesh/k3s-install.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3s-install.bats — scripts/devmesh/k3s-install.sh [T900117]
#
# Pruefmodus: Output-Verifikation. DRY_RUN=1 gibt den Installationsbefehl als Zeile
# "command:" aus. Die Assertions zerlegen diese Zeile per eval in Argumente, damit sie an
# der Semantik der Flags haengen und nicht an der %q-Darstellung. Idempotenz und Token-Pfad
# laufen gegen einen ssh-Stub, der argv und stdin getrennt protokolliert.
#
# $0-Falle (tests/CLAUDE.md): keine Assertion liest den Gesamtoutput, alle lesen die Zeilen
# "command:" bzw. "unveraendert:" oder die Stub-Protokolle.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/k3s-install.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  STUB="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  export SSH_STDIN_LOG="${BATS_TEST_TMPDIR}/ssh-stdin.log"
  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  cat > "$STUB/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  "sudo -n true") exit 0 ;;
  *"k3s --version"*) if [ -n "${STUB_STATE_FILE:-}" ]; then cat "$STUB_STATE_FILE"; fi ;;
  *"/var/lib/rancher/k3s/server/token"*) printf '%s\n' "${STUB_TOKEN:-}" ;;
  "sudo -n bash -s") cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
EOF
  chmod +x "$STUB/ssh"
}

# Argumente hinter "sh -s - " aus der command:-Zeile, eines pro Zeile.
_args() {
  local line rest
  line="$(printf '%s\n' "$1" | grep '^command: ' | head -n1)"
  rest="${line#* sh -s - }"
  eval "set -- $rest"
  printf '%s\n' "$@"
}

# Erfolgreich, wenn in der Argumentliste $1 direkt von $2 gefolgt wird.
_pair() {
  printf '%s\n' "$1" | awk -v f="$2" -v v="$3" 'prev == f && $0 == v {found = 1} {prev = $0} END {exit !found}'
}

@test "server-join: node-ip aus dem Inventar, wireguard-native, Join gegen server-init, kein --cluster-init" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  line="$(printf '%s\n' "$output" | grep '^command: ')"
  # Spec-Szenario "Install flags for a joining server", woertlich
  printf '%s\n' "$line" | grep -qF -e '--node-ip 10.10.10.2'
  args="$(_args "$output")"
  [ "$(printf '%s\n' "$args" | head -n1)" = server ]
  printf '%s\n' "$args" | grep -qxF -e '--flannel-backend=wireguard-native'
  _pair "$args" --server https://10.1.0.101:6443
  # Alle Server tragen dieselben Cluster-Netze, sonst verweigert k3s den Join
  printf '%s\n' "$args" | grep -qxF -e '--cluster-cidr=10.52.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--service-cidr=10.53.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-dns=10.53.0.10'
  init="$(printf '%s\n' "$args" | grep -cxF -e '--cluster-init' || true)"
  [ "$init" -eq 0 ]
}

@test "server-init: --cluster-init, SANs aller Server, etcd-Snapshots alle 6h mit Retention 20" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  args="$(_args "$output")"
  printf '%s\n' "$args" | grep -qxF -e '--cluster-init'
  _pair "$args" --node-ip 10.1.0.101
  for san in 10.1.0.101 10.10.10.2 10.10.10.3 \
    gpu-metal.example-tailnet.ts.net gpu-cluster.example-tailnet.ts.net gpu-cluster2.example-tailnet.ts.net; do
    _pair "$args" --tls-san "$san"
  done
  [ "$(printf '%s\n' "$args" | grep -cxF -e '--tls-san')" -eq 6 ]
  printf '%s\n' "$args" | grep -qxF -e '--etcd-snapshot-schedule-cron=0 */6 * * *'
  printf '%s\n' "$args" | grep -qxF -e '--etcd-snapshot-retention=20'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-cidr=10.52.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--service-cidr=10.53.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-dns=10.53.0.10'
  # Keine fleet-Netze (Positiv-Anker: die drei devmesh-Netze oben)
  fleet="$(printf '%s\n' "$args" | grep -F -e '10.42.' -e '10.43.' || true)"
  [ -z "$fleet" ]
  # Der Client pk-desktop steht nicht im Zertifikat (Positiv-Anker: 6 SANs oben)
  client="$(printf '%s\n' "$args" | grep -F -e 'pk-desktop' -e '10.10.0.3' || true)"
  [ -z "$client" ]
}

@test "Versionspin aus dem Inventar steht im Befehl" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep '^command: ' | grep -qF 'INSTALL_K3S_VERSION=v1.36.1+k3s1'
}

@test "storage=true nur auf gpu-cluster2" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster2
  [ "$status" -eq 0 ]
  _pair "$(_args "$output")" --node-label storage=true

  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  args="$(_args "$output")"
  _pair "$args" --node-ip 10.10.10.2
  labels="$(printf '%s\n' "$args" | grep -cxF -e '--node-label' || true)"
  [ "$labels" -eq 0 ]
}

@test "unbekannter Host endet mit Exit 1 und nennt den Host" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-nirgendwo
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF 'gpu-nirgendwo'
}

@test "fehlender tailnet_name eines Servers endet mit Exit 1" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  broken="${BATS_TEST_TMPDIR}/inventory.yaml"
  cp "$DEVMESH_INVENTORY" "$broken"
  yq -i 'del(.peers[2].tailnet_name)' "$broken"
  run env DRY_RUN=1 DEVMESH_INVENTORY="$broken" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF 'gpu-cluster2'
}

@test "zweiter Lauf auf fertigem Knoten aendert nichts und endet mit 0" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  args_str="$(printf '%s\n' "$output" | sed -n 's/^command: .* sh -s - //p')"
  [ -n "$args_str" ]
  export STUB_STATE_FILE="${BATS_TEST_TMPDIR}/state"
  printf 'k3s version v1.36.1+k3s1 (0123abcd)\n---\n%s' "$args_str" > "$STUB_STATE_FILE"

  run env PATH="$STUB:$PATH" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^unveraendert: '
  # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt
  grep -q 'k3s --version' "$SSH_ARGV_LOG"
  [ ! -s "$SSH_STDIN_LOG" ]
  token_calls="$(grep -c 'server/token' "$SSH_ARGV_LOG" || true)"
  [ "$token_calls" -eq 0 ]
}

@test "Join-Installation: Token nur ueber stdin, nie in argv oder Ausgabe" {
  export STUB_STATE_FILE="${BATS_TEST_TMPDIR}/state"
  printf -- '---\n' > "$STUB_STATE_FILE"
  export STUB_TOKEN="test-token-nicht-geheim"

  run env PATH="$STUB:$PATH" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  # Positiv-Anker: das Installationsskript ging mit Token und Join-Flags raus
  grep -qF -e '--node-ip 10.10.10.2' "$SSH_STDIN_LOG"
  grep -qF "$STUB_TOKEN" "$SSH_STDIN_LOG"
  grep -qF '/etc/rancher/k3s/devmesh-install.args' "$SSH_STDIN_LOG"
  grep -qF 'ufw allow from 10.52.0.0/16' "$SSH_STDIN_LOG"
  grep -qF 'ufw allow from 10.53.0.0/16' "$SSH_STDIN_LOG"
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  leak="$(grep -F "$STUB_TOKEN" "$SSH_ARGV_LOG" || true)"
  [ -z "$leak" ]
  leak="$(printf '%s\n' "$output" | grep -F "$STUB_TOKEN" || true)"
  [ -z "$leak" ]
}
```

- [ ] **1.3** RED-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3s-install.bats
# expected: FAIL (scripts/devmesh/k3s-install.sh existiert noch nicht)
```

Ein Test, der hier gruen ist, ist ein Befund am Test (tests/CLAUDE.md, Spielart 3). Korrigieren, bevor Task 2 beginnt.

- [ ] **1.4** Commit: `test(infra): Guards fuer devmesh k3s-install (RED) [T900117]`

### Task 2: `scripts/devmesh/k3s-install.sh` (GREEN)

**Dateien:** `scripts/devmesh/k3s-install.sh` (neu)

- [ ] **2.1** Skript anlegen, `chmod +x`:

```bash
#!/usr/bin/env bash
# scripts/devmesh/k3s-install.sh — k3s auf einem devmesh-Host installieren [T900117]
#
# Usage: k3s-install.sh <host>
#   <host>  Name aus devmesh/inventory.yaml (peers[].name) mit k3s_role
#           server-init | server-join | agent
#
# Umgebung:
#   DRY_RUN=1          nur den Installationsbefehl ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Idempotent: laeuft auf dem Host bereits k3s_version mit identischen Argumenten, endet
# das Skript ohne Aenderung mit Exit 0. Das Join-Token geht nur ueber stdin, nie in argv.
# Exit 0 installiert/unveraendert, 1 Befund (Inventar, Installation), 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
ARGS_FILE=/etc/rancher/k3s/devmesh-install.args
SERVER_ROLES='.k3s_role == "server-init" or .k3s_role == "server-join"'
# Cluster-Netze, identisch auf allen Servern. Bewusst nicht 10.42/10.43: die belegt fleet,
# und PK-Desktop routet sie ueber wg-gpu. Registriert in docs/agent-guide/registry/networks.yaml.
CLUSTER_CIDR=10.52.0.0/16
SERVICE_CIDR=10.53.0.0/16
CLUSTER_DNS=10.53.0.10

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

[[ $# -eq 1 ]] || die "genau ein Argument erwartet: <host> (siehe Kopfkommentar)"
HOST="$1"
need yq
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

peer() { HOST="$HOST" yq -r ".peers[] | select(.name == strenv(HOST)) | .$1 // \"\"" "$INVENTORY"; }

VERSION="$(yq -r '.k3s_version // ""' "$INVENTORY")"
LAN_IP="$(peer lan_ip)"
ROLE="$(peer k3s_role)"
[[ -n "$LAN_IP" ]] || die "Host '$HOST' nicht im Inventar oder ohne lan_ip"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$ ]] || die "k3s_version '$VERSION' ungueltig (Form v1.36.1+k3s1)"
case "$ROLE" in
  server-init|server-join|agent) ;;
  *) die "k3s_role '$ROLE' fuer '$HOST' ungueltig (server-init|server-join|agent)" ;;
esac
[[ "$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | length' "$INVENTORY")" == 1 ]] \
  || die "Inventar braucht genau einen Host mit k3s_role server-init"
INIT_IP="$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | .[0].lan_ip // ""' "$INVENTORY")"
MISSING="$(yq -r "[.peers[] | select(($SERVER_ROLES) and ((.tailnet_name // \"\") == \"\"))] | map(.name) | join(\",\")" "$INVENTORY")"
[[ -z "$MISSING" ]] || die "tailnet_name fehlt fuer: $MISSING (wird fuer --tls-san gebraucht)"

# --- Argumente ----------------------------------------------------------------
args=()
case "$ROLE" in
  server-init) args+=(server --cluster-init) ;;
  server-join) args+=(server --server "https://${INIT_IP}:6443") ;;
  agent)       args+=(agent --server "https://${INIT_IP}:6443") ;;
esac
args+=(--node-ip "$LAN_IP")
while IFS= read -r label; do
  if [[ -n "$label" ]]; then args+=(--node-label "$label"); fi
done < <(HOST="$HOST" yq -r '.peers[] | select(.name == strenv(HOST)) | (.labels // []) | .[]' "$INVENTORY")
if [[ "$ROLE" != agent ]]; then
  args+=(--flannel-backend=wireguard-native)
  while IFS= read -r san; do
    args+=(--tls-san "$san")
  done < <(yq -r ".peers[] | select($SERVER_ROLES) | (.lan_ip, .tailnet_name)" "$INVENTORY")
  args+=("--etcd-snapshot-schedule-cron=0 */6 * * *" --etcd-snapshot-retention=20)
  args+=("--cluster-cidr=${CLUSTER_CIDR}" "--service-cidr=${SERVICE_CIDR}" "--cluster-dns=${CLUSTER_DNS}")
fi

ARGS_STR=""
for a in "${args[@]}"; do ARGS_STR+="$(printf '%q' "$a") "; done
ARGS_STR="${ARGS_STR% }"
CMD="curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$(printf '%q' "$VERSION") sh -s - ${ARGS_STR}"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "host:    $HOST ($ROLE, $LAN_IP)"
  if [[ "$ROLE" != server-init ]]; then
    echo "token:   aus ${INIT_IP}:/var/lib/rancher/k3s/server/token (wird nicht ausgegeben)"
  fi
  echo "command: $CMD"
  exit 0
fi

# --- Remote -------------------------------------------------------------------
need ssh
remote() {
  local ip="$1"; shift
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${ip}" "$@"
}

remote "$LAN_IP" "sudo -n true" \
  || { echo "Vorbedingung fehlt: SSH/sudo ohne Passwort auf ${SSH_USER}@${LAN_IP}" >&2; exit 2; }

STATE="$(remote "$LAN_IP" "sudo -n sh -c 'k3s --version 2>/dev/null | head -n1; echo ---; cat $ARGS_FILE 2>/dev/null; true'")"
CUR_VERSION="$(printf '%s\n' "$STATE" | head -n1)"
CUR_ARGS="$(printf '%s\n' "$STATE" | awk 'f {print} /^---$/ {f = 1}')"
if [[ "$CUR_VERSION" == *" $VERSION "* && "$CUR_ARGS" == "$ARGS_STR" ]]; then
  echo "unveraendert: $HOST laeuft k3s $VERSION mit identischen Argumenten"
  exit 0
fi

TOKEN=""
if [[ "$ROLE" != server-init ]]; then
  TOKEN="$(remote "$INIT_IP" "sudo -n cat /var/lib/rancher/k3s/server/token")" \
    || die "Token von ${INIT_IP} nicht lesbar (laeuft server-init schon?)"
  [[ -n "$TOKEN" ]] || die "Token von ${INIT_IP} ist leer"
fi

remote_body() {
  echo 'set -euo pipefail'
  if [[ -n "$TOKEN" ]]; then printf 'export K3S_TOKEN=%q\n' "$TOKEN"; fi
  echo 'command -v ufw >/dev/null || { echo "ufw fehlt auf $(hostname)" >&2; exit 1; }'
  cat <<'UFW'
ufw allow from 10.0.0.0/8    to any port 22        proto tcp comment 'devmesh ssh lan'
ufw allow from 100.64.0.0/10 to any port 22        proto tcp comment 'devmesh ssh tailnet'
ufw allow from 10.0.0.0/8    to any port 10250     proto tcp comment 'k3s kubelet'
ufw allow from 10.0.0.0/8    to any port 51820     proto udp comment 'k3s flannel wireguard'
UFW
  printf "ufw allow from %s comment 'devmesh pods'\n" "$CLUSTER_CIDR"
  printf "ufw allow from %s comment 'devmesh services'\n" "$SERVICE_CIDR"
  if [[ "$ROLE" != agent ]]; then
    cat <<'UFW'
ufw allow from 10.0.0.0/8    to any port 6443      proto tcp comment 'k3s api lan'
ufw allow from 100.64.0.0/10 to any port 6443      proto tcp comment 'k3s api tailnet'
ufw allow from 10.0.0.0/8    to any port 2379:2380 proto tcp comment 'k3s etcd'
ufw allow from 10.0.0.0/8    to any port 80        proto tcp comment 'traefik http'
ufw allow from 10.0.0.0/8    to any port 443       proto tcp comment 'traefik https lan'
ufw allow from 100.64.0.0/10 to any port 443       proto tcp comment 'traefik https tailnet'
UFW
  fi
  echo 'ufw --force enable'
  printf '%s\n' "$CMD"
  if [[ "$ROLE" == agent ]]; then
    echo 'systemctl is-active --quiet k3s-agent'
  else
    cat <<'WAIT'
for _ in $(seq 1 36); do k3s kubectl get node "$(hostname)" >/dev/null 2>&1 && break; sleep 5; done
k3s kubectl wait --for=condition=Ready "node/$(hostname)" --timeout=180s
WAIT
  fi
  # Argumente erst nach erfolgreicher Installation festhalten: ein abgebrochener Lauf
  # gilt beim naechsten Aufruf nicht als "unveraendert".
  printf 'printf %%s %q > %s\n' "$ARGS_STR" "$ARGS_FILE"
}

rc=0
remote_body | remote "$LAN_IP" "sudo -n bash -s" || rc=$?
(( rc == 0 )) || die "Installation auf $HOST fehlgeschlagen (Exit $rc)"
echo "installiert: $HOST ($ROLE) k3s $VERSION"
```

- [ ] **2.2** GREEN-Lauf, danach `wc -l scripts/devmesh/k3s-install.sh` (erwartet deutlich unter 800):

```bash
chmod +x scripts/devmesh/k3s-install.sh
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3s-install.bats
# expected: PASS (8/8)
```

- [ ] **2.3** Commit: `feat(infra): devmesh k3s-install.sh mit DRY_RUN und Idempotenz [T900117]`

### Task 3: Preflight (RED, dann GREEN)

**Dateien:** `tests/spec/local-dev-mesh/preflight.bats` (neu), `scripts/devmesh/preflight.sh` (neu)

- [ ] **3.1** `tests/spec/local-dev-mesh/preflight.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/preflight.bats — scripts/devmesh/preflight.sh [T900117]
#
# Pruefmodus: Output-Verifikation gegen gestubbte Systemwerkzeuge (ss, lsblk, findmnt,
# free, swapon, timedatectl, timeout). Der --local-Modus laeuft mit einem PATH, der NUR
# das Stub-Verzeichnis enthaelt, damit "ss fehlt" auch auf Maschinen mit iproute2
# messbar ist. Assertions haengen am Exit-Code und an der Zeile, die den Befund traegt.

_stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$BIN/$1"; chmod +x "$BIN/$1"; }

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/preflight.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  for t in bash env awk grep sed head cat dirname; do ln -s "$(command -v "$t")" "$BIN/$t"; done
  _stub ss 'case "$1" in *t*) cat "${STUB_SS_TCP:-/dev/null}" ;; *u*) cat "${STUB_SS_UDP:-/dev/null}" ;; esac'
  _stub free 'printf "               total        used        free\nMem:  %s  1000  1000\nSwap:  0  0  0\n" "${STUB_MEM_BYTES:-16700000000}"'
  _stub swapon 'if [ -n "${STUB_SWAP:-}" ]; then echo "$STUB_SWAP"; fi'
  _stub timedatectl 'echo "${STUB_NTP:-yes}"'
  _stub findmnt 'echo "${STUB_FINDMNT:-/dev/nvme0n1p2}"'
  _stub lsblk 'printf "%b" "${STUB_LSBLK:-nvme0n1p2 part 0\nnvme0n1 disk 0\n}"'
  _stub timeout 'if [ -n "${STUB_TIMEOUT_ERR:-}" ]; then echo "$STUB_TIMEOUT_ERR" >&2; fi; exit "${STUB_TIMEOUT_RC:-0}"'
  export DEVMESH_ETCD_PATH="${BATS_TEST_TMPDIR}/rancher"
  export STUB_SS_TCP="${BATS_TEST_TMPDIR}/ss-tcp"
  : > "$STUB_SS_TCP"
}

_run_local() { run env PATH="$BIN" "$BASH" "$SCRIPT" --local "$@"; }
_fails() { printf '%s\n' "$output" | grep '^FAIL' || true; }

@test "geeigneter Host: Exit 0 und keine FAIL-Zeile" {
  _run_local --peers 10.10.10.2
  [ "$status" -eq 0 ]
  # Positiv-Anker: jede Pruefgruppe hat tatsaechlich eine OK-Zeile geliefert
  printf '%s\n' "$output" | grep -q '^OK   RAM'
  printf '%s\n' "$output" | grep -q '^OK   Swap'
  printf '%s\n' "$output" | grep -q '^OK   Zeit'
  printf '%s\n' "$output" | grep -q '^OK   Port 6443/tcp'
  printf '%s\n' "$output" | grep -q '^OK   Port 51820/udp'
  printf '%s\n' "$output" | grep -q '^OK   etcd-Platte nvme0n1'
  printf '%s\n' "$output" | grep -q '^OK   10.10.10.2:2379'
  [ -z "$(_fails)" ]
}

@test "belegter k3s-Port: Exit 1, Befund nennt Port und Prozess" {
  printf 'LISTEN 0 4096 *:6443 *:* users:(("kube-apiserver",pid=4242,fd=7))\n' > "$STUB_SS_TCP"
  _run_local
  [ "$status" -eq 1 ]
  line="$(_fails | grep -F '6443')"
  printf '%s\n' "$line" | grep -qF 'kube-apiserver'
}

@test "rotierende etcd-Platte: Exit 1, Befund nennt die Platte" {
  export STUB_FINDMNT='/dev/mapper/ubuntu--vg-ubuntu--lv'
  export STUB_LSBLK='ubuntu--vg-ubuntu--lv lvm 1\nsda3 part 1\nsda disk 1\n'
  _run_local
  [ "$status" -eq 1 ]
  _fails | grep -qF 'sda'
}

@test "ss fehlt: Exit 2 statt 1" {
  _run_local
  [ "$status" -eq 0 ]
  rm "$BIN/ss"
  _run_local
  [ "$status" -eq 2 ]
}

@test "Swap aktiv: Exit 1" {
  export STUB_SWAP=/swap.img
  _run_local
  [ "$status" -eq 1 ]
  _fails | grep -qF '/swap.img'
}

@test "zu wenig RAM: Exit 1" {
  export STUB_MEM_BYTES=8000000000
  _run_local
  [ "$status" -eq 1 ]
  _fails | grep -qF 'RAM'
}

@test "Zeitsynchronisation aus: Exit 1" {
  export STUB_NTP=no
  _run_local
  [ "$status" -eq 1 ]
  _fails | grep -qiF 'zeit'
}

@test "gpupod auf 8080 ist INFO, kein Befund; Loopback-Listener bleiben ungenannt" {
  printf '%s\n' \
    'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("gpupod",pid=12,fd=3))' \
    'LISTEN 0 4096 127.0.0.1:6444 0.0.0.0:* users:(("irgendwas",pid=13,fd=3))' > "$STUB_SS_TCP"
  _run_local
  [ "$status" -eq 0 ]
  info="$(printf '%s\n' "$output" | grep '^INFO' | grep -F '8080')"
  printf '%s\n' "$info" | grep -qF 'gpupod'
  loop="$(printf '%s\n' "$output" | grep '^INFO' | grep -F '6444' || true)"
  [ -z "$loop" ]
}

@test "Peer ohne Antwort ist Befund, Connection refused gilt als erreichbar" {
  export STUB_TIMEOUT_RC=124
  _run_local --peers 10.10.10.2
  [ "$status" -eq 1 ]
  _fails | grep -qF '10.10.10.2:6443'

  export STUB_TIMEOUT_RC=1
  export STUB_TIMEOUT_ERR='bash: connect: Connection refused'
  _run_local --peers 10.10.10.2
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep '^OK' | grep -qF '10.10.10.2:6443'
}

@test "Client-Modus: SSH gegen lan_ip, uebrige Server als Peers; unbekannter Host ohne SSH" {
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  : > "$SSH_ARGV_LOG"
  _stub ssh 'printf "%s\n" "$*" >> "$SSH_ARGV_LOG"; cat > /dev/null; exit 0'

  run env PATH="$BIN:$PATH" "$BASH" "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  peers="$(sed -n "s/.*--peers '\([^']*\)'.*/\1/p" "$SSH_ARGV_LOG")"
  [ "$peers" = "10.10.10.2,10.10.10.3" ]

  : > "$SSH_ARGV_LOG"
  run env PATH="$BIN:$PATH" "$BASH" "$SCRIPT" gpu-nirgendwo
  [ "$status" -eq 1 ]
  [ ! -s "$SSH_ARGV_LOG" ]
}
```

- [ ] **3.2** RED-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/preflight.bats
# expected: FAIL (scripts/devmesh/preflight.sh existiert noch nicht)
```

- [ ] **3.3** `scripts/devmesh/preflight.sh` anlegen, `chmod +x`:

```bash
#!/usr/bin/env bash
# scripts/devmesh/preflight.sh — devmesh-Host vor der k3s-Installation pruefen [T900117]
#
# Usage:
#   preflight.sh <host>                  vom Dev-Client: Host aus devmesh/inventory.yaml per SSH
#   preflight.sh --local [--peers a,b]   auf dem Host selbst (so ruft der Client-Modus es remote auf)
#
# Prueft: RAM >= 15 GiB, Swap aus, Zeitsynchronisation, freie k3s-Ports (6443, 2379, 2380,
# 10250, 80, 443 tcp; 51820 udp), Rotationsflag der Platte unter /var/lib/rancher und die
# Erreichbarkeit der anderen Server auf 6443 und 2379. Weitere Listener meldet es als INFO,
# weil ufw sie nach der Installation sperrt.
#
# Umgebung: DEVMESH_INVENTORY, DEVMESH_SSH_USER, DEVMESH_SSH_KEY,
#           DEVMESH_ETCD_PATH (Default /var/lib/rancher)
# Exit 0 geeignet, 1 mindestens ein Befund, 2 Vorbedingung fehlt (Werkzeug, SSH, Inventar).
set -euo pipefail

K3S_TCP_PORTS=(6443 2379 2380 10250 80 443)
K3S_UDP_PORTS=(51820)
MIN_MEM_BYTES=$((15 * 1024 * 1024 * 1024))
FAIL=0

need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }
ok()   { echo "OK   $*"; }
bad()  { echo "FAIL $*"; FAIL=1; }
info() { echo "INFO $*"; }

client_mode() {
  local host="$1" repo inventory ssh_user ssh_key lan peers rc=0
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  inventory="${DEVMESH_INVENTORY:-$repo/devmesh/inventory.yaml}"
  ssh_user="${DEVMESH_SSH_USER:-patrick}"
  ssh_key="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
  need yq
  need ssh
  [[ -f "$inventory" ]] || { echo "Vorbedingung fehlt: Inventar $inventory" >&2; exit 2; }
  lan="$(HOST="$host" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip // ""' "$inventory")"
  [[ -n "$lan" ]] || { echo "FAIL Host '$host' nicht im Inventar oder ohne lan_ip"; exit 1; }
  peers="$(HOST="$host" yq -r '[.peers[] | select((.k3s_role == "server-init" or .k3s_role == "server-join") and .name != strenv(HOST)) | .lan_ip] | join(",")' "$inventory")"
  ssh -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${ssh_user}@${lan}" "sudo -n bash -s -- --local --peers '${peers}'" < "${BASH_SOURCE[0]}" || rc=$?
  if (( rc == 255 )); then echo "Vorbedingung fehlt: SSH zu ${ssh_user}@${lan}" >&2; exit 2; fi
  exit "$rc"
}

# Eine Zeile "<port> <adresse> <prozess>" je Listener; $1 = t (tcp) oder u (udp).
listeners() {
  ss "-H${1}lnp" | awk '{
    n = split($4, a, ":"); port = a[n]
    addr = substr($4, 1, length($4) - length(port) - 1)
    proc = "unbekannt"
    if (match($0, /users:\(\("[^"]*"/)) proc = substr($0, RSTART + 9, RLENGTH - 10)
    print port, addr, proc
  }'
}

check_port() {
  local list="$1" port="$2" proto="$3" owner
  owner="$(printf '%s\n' "$list" | awk -v p="$port" '$1 == p {print $3; exit}')"
  if [[ -z "$owner" ]]; then ok "Port $port/$proto frei"; else bad "Port $port/$proto belegt von $owner"; fi
}

local_mode() {
  local peers="$1" etcd_path="${DEVMESH_ETCD_PATH:-/var/lib/rancher}"
  local t mem swaps tcp udp p port addr proc target src disks name rota ip err rc
  export LC_ALL=C
  for t in ss lsblk findmnt free swapon timedatectl timeout awk; do need "$t"; done

  mem="$(free -b | awk '$1 == "Mem:" {print $2}')"
  [[ "$mem" =~ ^[0-9]+$ ]] || { echo "Vorbedingung fehlt: free -b liefert keine Mem-Zeile" >&2; exit 2; }
  if (( mem >= MIN_MEM_BYTES )); then ok "RAM $((mem / 1024 / 1024 / 1024)) GiB"
  else bad "RAM $((mem / 1024 / 1024 / 1024)) GiB, verlangt >= 15 GiB"; fi

  swaps="$(swapon --show=NAME --noheadings)"
  if [[ -z "$swaps" ]]; then ok "Swap aus"; else bad "Swap aktiv: ${swaps//$'\n'/ }"; fi

  if [[ "$(timedatectl show -p NTPSynchronized --value)" == yes ]]; then ok "Zeit synchronisiert (NTP)"
  else bad "Zeitsynchronisation nicht aktiv (timedatectl NTPSynchronized != yes)"; fi

  tcp="$(listeners t)"
  udp="$(listeners u)"
  for p in "${K3S_TCP_PORTS[@]}"; do check_port "$tcp" "$p" tcp; done
  for p in "${K3S_UDP_PORTS[@]}"; do check_port "$udp" "$p" udp; done
  while read -r port addr proc; do
    if [[ -z "$port" ]]; then continue; fi
    case " 22 ${K3S_TCP_PORTS[*]} " in *" $port "*) continue ;; esac
    case "$addr" in 127.*|"[::1]") continue ;; esac
    info "Port $port/tcp belegt von $proc auf $addr (kein k3s-Port; nach ufw-Aktivierung nur mit eigener Regel erreichbar)"
  done <<<"$tcp"

  target="$etcd_path"
  while [[ ! -e "$target" ]]; do target="$(dirname "$target")"; done
  src="$(findmnt -n -o SOURCE --target "$target")"
  src="${src%%\[*}"
  disks="$(lsblk -n -s -r -o NAME,TYPE,ROTA "$src" | awk '$2 == "disk" {print $1, $3}')"
  if [[ -z "$disks" ]]; then
    bad "Platte unter $target nicht ermittelbar (Quelle ${src:-leer})"
  else
    while read -r name rota; do
      if [[ "$rota" == 1 ]]; then bad "etcd-Platte $name ist rotierend (ROTA=1) unter $target"
      else ok "etcd-Platte $name nicht rotierend"; fi
    done <<<"$disks"
  fi

  for ip in ${peers//,/ }; do
    for p in 6443 2379; do
      rc=0
      err="$(timeout 3 bash -c "exec 3<>/dev/tcp/${ip}/${p}" 2>&1)" || rc=$?
      if (( rc == 0 )); then ok "$ip:$p offen"
      elif (( rc == 124 )); then bad "$ip:$p keine Antwort in 3s (Router oder Firewall filtert)"
      elif [[ "$err" == *"Connection refused"* ]]; then ok "$ip:$p erreichbar (Port noch geschlossen)"
      else bad "$ip:$p nicht erreichbar: ${err:-Exit $rc}"; fi
    done
  done

  exit "$FAIL"
}

case "${1:-}" in
  --local)
    peers=""
    if [[ "${2:-}" == --peers ]]; then peers="${3:-}"; fi
    local_mode "$peers"
    ;;
  ""|-h|--help)
    echo "Usage: preflight.sh <host> | preflight.sh --local [--peers ip,ip]" >&2
    exit 1
    ;;
  *) client_mode "$1" ;;
esac
```

- [ ] **3.4** GREEN-Lauf:

```bash
chmod +x scripts/devmesh/preflight.sh
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/preflight.bats
# expected: PASS (10/10)
```

- [ ] **3.5** Commit: `feat(infra): devmesh preflight.sh mit Exit 0/1/2 [T900117]`

### Task 4: Kubeconfig-Merge und Status (RED, dann GREEN)

**Dateien:** `tests/spec/local-dev-mesh/kubeconfig.bats`, `tests/spec/local-dev-mesh/status.bats`, `scripts/devmesh/kubeconfig.sh`, `scripts/devmesh/status.sh` (alle neu)

- [ ] **4.1** `tests/spec/local-dev-mesh/kubeconfig.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/kubeconfig.bats — scripts/devmesh/kubeconfig.sh [T900117]
#
# Pruefmodus: Output-Verifikation am Ergebnis, der gemergten Kubeconfig-Datei (per yq
# gelesen). ssh ist gestubbt und liefert eine k3s.yaml-Fixture. kubectl wird nicht gebraucht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/kubeconfig.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  : > "$SSH_ARGV_LOG"
  export K3S_YAML="${BATS_TEST_TMPDIR}/k3s.yaml"
  cat > "$K3S_YAML" <<'EOF'
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: Q0E=
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
users:
- name: default
  user:
    client-certificate-data: Q0VSVA==
    client-key-data: S0VZ
EOF
  cat > "$BIN/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
if [ -n "${STUB_SSH_RC:-}" ]; then exit "$STUB_SSH_RC"; fi
cat "$K3S_YAML"
EOF
  chmod +x "$BIN/ssh"
  export KUBECONFIG_TARGET="${BATS_TEST_TMPDIR}/kube/config"
  mkdir -p "$(dirname "$KUBECONFIG_TARGET")"
  cat > "$KUBECONFIG_TARGET" <<'EOF'
apiVersion: v1
kind: Config
clusters:
  - name: fleet
    cluster: {server: "https://fleet.invalid:6443"}
  - name: devmesh
    cluster: {server: "https://stale.invalid:6443"}
users:
  - name: fleet
    user: {token: fleet-token}
  - name: devmesh
    user: {token: stale-token}
contexts:
  - name: fleet
    context: {cluster: fleet, user: fleet}
  - name: devmesh
    context: {cluster: devmesh, user: devmesh}
current-context: fleet
EOF
}

_run() { run env PATH="$BIN:$PATH" bash "$SCRIPT" "$@"; }
_count_ctx() { yq -r "[.contexts[] | select(.name == \"$1\")] | length" "$KUBECONFIG_TARGET"; }

@test "Default-Server: Context devmesh zeigt auf den Tailnet-Namen von gpu-metal, fleet bleibt" {
  _run
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  [ "$(_count_ctx devmesh)" -eq 1 ]
  [ "$(_count_ctx fleet)" -eq 1 ]
  [ "$(yq -r '.clusters[] | select(.name == "devmesh") | .cluster.server' "$KUBECONFIG_TARGET")" = "https://gpu-metal.example-tailnet.ts.net:6443" ]
  [ "$(yq -r '.users[] | select(.name == "devmesh") | .user."client-certificate-data"' "$KUBECONFIG_TARGET")" = "Q0VSVA==" ]
  [ "$(yq -r '.["current-context"]' "$KUBECONFIG_TARGET")" = fleet ]
}

@test "SERVER=gpu-cluster schaltet den Context auf gpu-cluster um" {
  _run gpu-cluster
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.10.10.2' "$SSH_ARGV_LOG"
  [ "$(yq -r '.clusters[] | select(.name == "devmesh") | .cluster.server' "$KUBECONFIG_TARGET")" = "https://gpu-cluster.example-tailnet.ts.net:6443" ]
}

@test "fehlende Ziel-Datei wird angelegt, current-context ist dann devmesh" {
  rm "$KUBECONFIG_TARGET"
  _run
  [ "$status" -eq 0 ]
  [ "$(_count_ctx devmesh)" -eq 1 ]
  [ "$(yq -r '.["current-context"]' "$KUBECONFIG_TARGET")" = devmesh ]
}

@test "Client statt Server: Exit 1, kein SSH, Ziel-Datei unveraendert" {
  before="$(cksum < "$KUBECONFIG_TARGET")"
  [ "$(_count_ctx fleet)" -eq 1 ]
  _run pk-desktop
  [ "$status" -eq 1 ]
  [ ! -s "$SSH_ARGV_LOG" ]
  [ "$(cksum < "$KUBECONFIG_TARGET")" = "$before" ]
}

@test "SSH nicht erreichbar: Exit 2, Ziel-Datei unveraendert" {
  before="$(cksum < "$KUBECONFIG_TARGET")"
  export STUB_SSH_RC=255
  _run
  [ "$status" -eq 2 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  [ "$(cksum < "$KUBECONFIG_TARGET")" = "$before" ]
}
```

- [ ] **4.2** `tests/spec/local-dev-mesh/status.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/status.bats — scripts/devmesh/status.sh [T900117]
#
# Pruefmodus: Output-Verifikation gegen einen kubectl-Stub. Snapshot-Zeitstempel werden
# relativ zur Testlaufzeit erzeugt (GNU date), damit das Alter deterministisch ist.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/status.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  for t in bash env date grep sort tail cat; do ln -s "$(command -v "$t")" "$BIN/$t"; done
  export KUBECTL_ARGV_LOG="${BATS_TEST_TMPDIR}/kubectl-argv.log"
  : > "$KUBECTL_ARGV_LOG"
  export STUB_NODES="${BATS_TEST_TMPDIR}/nodes"
  export STUB_SNAPS="${BATS_TEST_TMPDIR}/snaps"
  printf 'gpu-metal True true\ngpu-cluster True true\ngpu-cluster2 True true\n' > "$STUB_NODES"
  _snaps 1
  cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KUBECTL_ARGV_LOG"
case "$*" in
  *"get nodes"*) if [ -n "${STUB_NODES_RC:-}" ]; then exit "$STUB_NODES_RC"; fi; cat "$STUB_NODES" ;;
  *etcdsnapshotfiles*) cat "$STUB_SNAPS" ;;
  *) echo "kubectl-Stub: unerwartet: $*" >&2; exit 99 ;;
esac
EOF
  chmod +x "$BIN/kubectl"
}

# Schreibt je Argument einen Snapshot, der so viele Stunden alt ist.
_snaps() {
  : > "$STUB_SNAPS"
  local h
  for h in "$@"; do
    date -u -d "@$(( $(date +%s) - h * 3600 ))" +%Y-%m-%dT%H:%M:%SZ >> "$STUB_SNAPS"
  done
}

_run() { run env PATH="$BIN" "$BASH" "$SCRIPT"; }

@test "gesunder Cluster: Exit 0, drei Knoten und drei etcd-Mitglieder Ready, Context devmesh" {
  _snaps 30 1
  _run
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'Knoten: 3/3 Ready'
  printf '%s\n' "$output" | grep -qF 'etcd-Mitglieder: 3/3 Ready'
  printf '%s\n' "$output" | grep '^OK' | grep -qF '1h'
  grep -qF -e '--context devmesh' "$KUBECTL_ARGV_LOG"
}

@test "Snapshot 13 Stunden alt: Exit ungleich 0, Alter wird genannt" {
  _snaps 13
  _run
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF '13h'
}

@test "kein Snapshot: Exit 1" {
  : > "$STUB_SNAPS"
  _run
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q '^FAIL'
}

@test "Knoten nicht Ready: Exit 1, Knoten wird genannt" {
  printf 'gpu-metal True true\ngpu-cluster Unknown true\ngpu-cluster2 True true\n' > "$STUB_NODES"
  _run
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF 'gpu-cluster'
  printf '%s\n' "$output" | grep -qF 'etcd-Mitglieder: 2/3 Ready'
}

@test "kubectl fehlt: Exit 2" {
  _run
  [ "$status" -eq 0 ]
  rm "$BIN/kubectl"
  _run
  [ "$status" -eq 2 ]
}

@test "Context nicht erreichbar: Exit 2" {
  export STUB_NODES_RC=1
  _run
  [ "$status" -eq 2 ]
}
```

- [ ] **4.3** RED-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/kubeconfig.bats tests/spec/local-dev-mesh/status.bats
# expected: FAIL (kubeconfig.sh und status.sh existieren noch nicht)
```

- [ ] **4.4** `scripts/devmesh/kubeconfig.sh` anlegen, `chmod +x`:

```bash
#!/usr/bin/env bash
# scripts/devmesh/kubeconfig.sh — Admin-Kubeconfig eines devmesh-Servers als Context "devmesh" mergen [T900117]
#
# Usage: kubeconfig.sh [<server>]
#   <server>  Name aus devmesh/inventory.yaml mit k3s_role server-init|server-join
#             (Default: der server-init-Host). Faellt dieser aus, auf einen anderen Server umschalten.
#
# Der API-Server im Context ist der Tailnet-Name des Servers (design.md D3): zu Hause direkter
# Pfad, unterwegs DERP. Andere Contexts und current-context bleiben unangetastet.
#
# Umgebung: DEVMESH_INVENTORY, DEVMESH_SSH_USER, DEVMESH_SSH_KEY,
#           KUBECONFIG_TARGET (Default: erster Eintrag aus $KUBECONFIG, sonst ~/.kube/config)
# Exit 0 gemerged, 1 Befund, 2 Vorbedingung fehlt (yq, ssh, SSH-Zugang, Inventar).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

need yq
need ssh
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

SERVER="${1:-$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | .[0].name // ""' "$INVENTORY")}"
[[ -n "$SERVER" ]] || die "kein server-init im Inventar"
peer() { HOST="$SERVER" yq -r ".peers[] | select(.name == strenv(HOST)) | .$1 // \"\"" "$INVENTORY"; }
ROLE="$(peer k3s_role)"
LAN_IP="$(peer lan_ip)"
TAILNET="$(peer tailnet_name)"
case "$ROLE" in
  server-init|server-join) ;;
  *) die "'$SERVER' ist kein devmesh-Server (k3s_role '${ROLE}')" ;;
esac
[[ -n "$LAN_IP" && -n "$TAILNET" ]] || die "lan_ip oder tailnet_name fehlt fuer '$SERVER'"

TARGET="${KUBECONFIG_TARGET:-${KUBECONFIG:-$HOME/.kube/config}}"
TARGET="${TARGET%%:*}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rc=0
ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "${SSH_USER}@${LAN_IP}" "sudo -n cat /etc/rancher/k3s/k3s.yaml" > "$TMP/devmesh.yaml" || rc=$?
if (( rc == 255 )); then echo "Vorbedingung fehlt: SSH zu ${SSH_USER}@${LAN_IP}" >&2; exit 2; fi
(( rc == 0 )) || die "k3s.yaml auf $SERVER nicht lesbar (Exit $rc)"
[[ "$(yq -r '.clusters | length' "$TMP/devmesh.yaml" 2>/dev/null)" == 1 ]] \
  || die "Antwort von $SERVER ist keine k3s-Kubeconfig mit genau einem Cluster"

SERVER_URL="https://${TAILNET}:6443" yq -i '
  .clusters[0].name = "devmesh" |
  .clusters[0].cluster.server = strenv(SERVER_URL) |
  .users[0].name = "devmesh" |
  .contexts[0].name = "devmesh" |
  .contexts[0].context.cluster = "devmesh" |
  .contexts[0].context.user = "devmesh" |
  .["current-context"] = "devmesh"' "$TMP/devmesh.yaml"

if [[ -s "$TARGET" ]]; then
  cp "$TARGET" "$TMP/merged.yaml"
else
  printf 'apiVersion: v1\nkind: Config\nclusters: []\nusers: []\ncontexts: []\n' > "$TMP/merged.yaml"
fi
NEW="$TMP/devmesh.yaml" yq -i '
  .clusters = ((.clusters // []) | map(select(.name != "devmesh"))) + load(strenv(NEW)).clusters |
  .users    = ((.users // [])    | map(select(.name != "devmesh"))) + load(strenv(NEW)).users |
  .contexts = ((.contexts // [])  | map(select(.name != "devmesh"))) + load(strenv(NEW)).contexts |
  .["current-context"] = (.["current-context"] // "devmesh")' "$TMP/merged.yaml"
[[ "$(yq -r '[.contexts[] | select(.name == "devmesh")] | length' "$TMP/merged.yaml")" == 1 ]] \
  || die "Merge ergab nicht genau einen Context devmesh"

mkdir -p "$(dirname "$TARGET")"
install -m 0600 "$TMP/merged.yaml" "$TARGET"
echo "Context devmesh -> https://${TAILNET}:6443 (${SERVER})"
```

- [ ] **4.5** `scripts/devmesh/status.sh` anlegen, `chmod +x`:

```bash
#!/usr/bin/env bash
# scripts/devmesh/status.sh — Knoten, etcd-Mitglieder und juengster etcd-Snapshot im Context devmesh [T900117]
#
# Usage: status.sh
# Umgebung: DEVMESH_CONTEXT (Default devmesh), DEVMESH_SNAPSHOT_MAX_AGE_H (Default 12)
#
# etcd-Mitglieder = Knoten mit Label node-role.kubernetes.io/etcd=true. Snapshot-Alter aus
# .status.creationTime der ETCDSnapshotFile-Ressourcen (k3s >= 1.27).
# Exit 0 gesund, 1 Befund (Knoten nicht Ready, Snapshot fehlt oder zu alt), 2 Vorbedingung fehlt.
set -euo pipefail

CTX="${DEVMESH_CONTEXT:-devmesh}"
MAX_AGE_H="${DEVMESH_SNAPSHOT_MAX_AGE_H:-12}"
FAIL=0

command -v kubectl >/dev/null 2>&1 || { echo "Vorbedingung fehlt: kubectl nicht im PATH" >&2; exit 2; }
K=(kubectl --context "$CTX" --request-timeout=15s)

nodes="$("${K[@]}" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.conditions[?(@.type=="Ready")].status}{" "}{.metadata.labels.node-role\.kubernetes\.io/etcd}{"\n"}{end}')" \
  || { echo "Vorbedingung fehlt: Context $CTX nicht erreichbar" >&2; exit 2; }
if [[ -z "$nodes" ]]; then echo "FAIL keine Knoten im Context $CTX"; exit 1; fi

total=0; ready=0; etcd_total=0; etcd_ready=0
while read -r name st etcd; do
  if [[ -z "$name" ]]; then continue; fi
  total=$((total + 1))
  if [[ "$st" == True ]]; then ready=$((ready + 1)); else echo "FAIL Knoten $name nicht Ready ($st)"; FAIL=1; fi
  if [[ "$etcd" == true ]]; then
    etcd_total=$((etcd_total + 1))
    if [[ "$st" == True ]]; then etcd_ready=$((etcd_ready + 1)); fi
  fi
done <<<"$nodes"
echo "Knoten: $ready/$total Ready"
echo "etcd-Mitglieder: $etcd_ready/$etcd_total Ready"

snaps="$("${K[@]}" get etcdsnapshotfiles.k3s.cattle.io -o jsonpath='{range .items[*]}{.status.creationTime}{"\n"}{end}')" \
  || { echo "Vorbedingung fehlt: ETCDSnapshotFile-API im Context $CTX nicht lesbar" >&2; exit 2; }
newest="$(printf '%s\n' "$snaps" | grep -E '^[0-9]{4}-' | sort | tail -n1 || true)"
if [[ -z "$newest" ]]; then
  echo "FAIL kein etcd-Snapshot vorhanden"
  FAIL=1
else
  age_s=$(( $(date +%s) - $(date -d "$newest" +%s) ))
  if (( age_s > MAX_AGE_H * 3600 )); then
    echo "FAIL juengster etcd-Snapshot ist $((age_s / 3600))h alt ($newest), Grenze ${MAX_AGE_H}h"
    FAIL=1
  else
    echo "OK   juengster etcd-Snapshot $((age_s / 3600))h alt ($newest)"
  fi
fi
exit "$FAIL"
```

- [ ] **4.6** GREEN-Lauf:

```bash
chmod +x scripts/devmesh/kubeconfig.sh scripts/devmesh/status.sh
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/kubeconfig.bats tests/spec/local-dev-mesh/status.bats
# expected: PASS (5/5 + 6/6)
```

- [ ] **4.7** Commit: `feat(infra): devmesh kubeconfig.sh und status.sh [T900117]`

### Task 5: Inventar, Taskfile-Tasks und Netz-Registry

**Dateien:** `tests/spec/local-dev-mesh/devmesh-taskfile.bats` (Erweiterung, Datei aus SP-1), `tests/spec/local-dev-mesh/devmesh-networks.bats` (neu), `devmesh/inventory.yaml`, `taskfiles/Taskfile.devmesh.yml`, `docs/agent-guide/registry/networks.yaml`

- [ ] **5.1** An `tests/spec/local-dev-mesh/devmesh-taskfile.bats` diese `@test`-Bloecke am Dateiende anhaengen. `setup()` und die SP-1-Tests bleiben unveraendert. Den Kopfkommentar um eine Zeile ergaenzen: `# T900117: devmesh:install reicht HOST/DRY_RUN durch; k3s-Felder im Inventar (yq, die Datei ist das Resultat).`

```bash
@test "T900117: task devmesh:install reicht HOST und DRY_RUN an k3s-install.sh durch" {
  run task --dir "$REPO_ROOT" devmesh:install HOST=gpu-cluster DRY_RUN=1
  [ "$status" -eq 0 ]
  line="$(printf '%s\n' "$output" | grep '^command: ')"
  printf '%s\n' "$line" | grep -qF -e '--node-ip 10.10.10.2'
  printf '%s\n' "$line" | grep -qF 'INSTALL_K3S_VERSION=v'
  init="$(printf '%s\n' "$line" | grep -cF -e '--cluster-init' || true)"
  [ "$init" -eq 0 ]
}

@test "T900117: Inventar mit gpu-metal server-init, zwei server-join, storage=true nur auf gpu-cluster2, Version gepinnt" {
  INV="${REPO_ROOT}/devmesh/inventory.yaml"
  [ "$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | map(.name) | join(",")' "$INV")" = gpu-metal ]
  [ "$(yq -r '[.peers[] | select(.k3s_role == "server-join")] | map(.name) | sort | join(",")' "$INV")" = "gpu-cluster,gpu-cluster2" ]
  [ "$(yq -r '[.peers[] | select(((.labels // []) | map(select(. == "storage=true")) | length) > 0)] | map(.name) | join(",")' "$INV")" = gpu-cluster2 ]
  yq -r '.k3s_version' "$INV" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$'
}

@test "T900117: kein Client traegt eine k3s-Rolle (PK-Desktop ist kein Knoten)" {
  INV="${REPO_ROOT}/devmesh/inventory.yaml"
  # Positiv-Anker: genau drei Hosts haben eine k3s-Rolle
  [ "$(yq -r '[.peers[] | select((.k3s_role // "") != "")] | length' "$INV")" -eq 3 ]
  roles="$(yq -r '.peers[] | select(.role == "client") | .k3s_role // ""' "$INV" | grep -v '^$' || true)"
  [ -z "$roles" ]
}
```

- [ ] **5.2** `tests/spec/local-dev-mesh/devmesh-networks.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/devmesh-networks.bats — devmesh-Cluster-Netze in der Registry [T900117]
#
# Pruefmodus: Output-Verifikation von scripts/networks-check.mjs gegen die echte Registry plus
# yq-Lesen der Registry (die Datei ist das Resultat). networks-check verlangt jede Ueberschneidung
# von beiden Seiten erklaert. Besteht der Check und nennt kein devmesh-Eintrag die fleet-Netze
# unter overlaps, ueberschneiden sich devmesh- und fleet-Netze nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REG="${REPO_ROOT}/docs/agent-guide/registry/networks.yaml"
}

_cidr() { yq -r ".networks[] | select(.id == \"$1\") | .cidr" "$REG"; }

@test "devmesh-Netze stehen mit 10.52.0.0/16 und 10.53.0.0/16 in der Registry" {
  [ "$(_cidr devmesh-pod-cidr)" = "10.52.0.0/16" ]
  [ "$(_cidr devmesh-service-cidr)" = "10.53.0.0/16" ]
}

@test "devmesh-Netze ueberschneiden weder pod-cidr-fleet noch service-cidr-fleet" {
  # Positiv-Anker: die fleet-Eintraege existieren, und der Registry-Check besteht
  [ "$(_cidr pod-cidr-fleet)" = "10.42.0.0/16" ]
  [ "$(_cidr service-cidr-fleet)" = "10.43.0.0/16" ]
  run bash -c "cd '$REPO_ROOT' && node scripts/networks-check.mjs"
  [ "$status" -eq 0 ]
  named="$(yq -r '.networks[] | select(.id == "devmesh-pod-cidr" or .id == "devmesh-service-cidr") | (.overlaps // [])[] | .with' "$REG")"
  printf '%s\n' "$named" | grep -qxF home-lan
  fleet="$(printf '%s\n' "$named" | grep -xF -e pod-cidr-fleet -e service-cidr-fleet || true)"
  [ -z "$fleet" ]
}
```

- [ ] **5.3** RED-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/devmesh-taskfile.bats tests/spec/local-dev-mesh/devmesh-networks.bats
# expected: FAIL (Task devmesh:install fehlt, Inventar ohne k3s_role/k3s_version, Registry ohne devmesh-Netze)
```

  Die zwei SP-1-Tests in `devmesh-taskfile.bats` bleiben dabei gruen.

- [ ] **5.4** k3s-Version von fleet messen. Beide Befehle samt Ausgabe gehoeren in den Ticket-Kommentar (Mess-Konvention T002717):

```bash
# Alle Knoten muessen dieselbe Version tragen, sonst Stopp und Rueckfrage im Ticket
kubectl --context fleet get nodes -o jsonpath='{range .items[*]}{.status.nodeInfo.kubeletVersion}{"\n"}{end}' | sort -u
# Wert fuer das Inventar
kubectl --context fleet get nodes -o jsonpath='{.items[0].status.nodeInfo.kubeletVersion}'
```

- [ ] **5.5** k3s-Felder im Inventar aus SP-1 setzen:

```bash
V="$(kubectl --context fleet get nodes -o jsonpath='{.items[0].status.nodeInfo.kubeletVersion}')"
[[ "$V" =~ ^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$ ]] || { echo "unerwartete Version: '$V'"; exit 1; }
V="$V" yq -i '.k3s_version = strenv(V)' devmesh/inventory.yaml
yq -i '
  (.peers[] | select(.name == "gpu-metal")).k3s_role = "server-init" |
  (.peers[] | select(.name == "gpu-metal")).labels = [] |
  (.peers[] | select(.name == "gpu-cluster")).k3s_role = "server-join" |
  (.peers[] | select(.name == "gpu-cluster")).labels = [] |
  (.peers[] | select(.name == "gpu-cluster2")).k3s_role = "server-join" |
  (.peers[] | select(.name == "gpu-cluster2")).labels = ["storage=true"]' devmesh/inventory.yaml
git diff devmesh/inventory.yaml
```

  Pruefen, dass `yq -i` die Kopfkommentare und `gpu_endpoint` aus SP-1 erhalten hat. Den Kopfkommentar um zwei Zeilen zu `k3s_version` und `k3s_role`/`labels` (gelesen von `scripts/devmesh/*.sh`) ergaenzen.

- [ ] **5.6** `taskfiles/Taskfile.devmesh.yml` (aus SP-1) erweitern. Im Kopfkommentar unter `Usage:` ergaenzen:

```yaml
#   task devmesh:preflight HOST=<name>            # Host pruefen (Exit 0/1/2)
#   task devmesh:install HOST=<name> [DRY_RUN=1]  # k3s in der Inventar-Rolle installieren
#   task devmesh:kubeconfig [SERVER=<name>]       # Context devmesh mergen
#   task devmesh:status                           # Knoten, etcd, juengster Snapshot
```

  Unter `tasks:` nach `tailnet:check` anhaengen:

```yaml
  preflight:
    desc: "devmesh: Host vor der k3s-Installation pruefen (HOST=<name aus devmesh/inventory.yaml>; Exit 1 = Befund, 2 = Vorbedingung)"
    requires:
      vars: [HOST]
    cmds:
      - bash scripts/devmesh/preflight.sh {{.HOST}}

  install:
    desc: "devmesh: k3s auf HOST in seiner Inventar-Rolle installieren (DRY_RUN=1 zeigt nur den Befehl)"
    requires:
      vars: [HOST]
    env:
      DRY_RUN: '{{.DRY_RUN | default "0"}}'
    cmds:
      - bash scripts/devmesh/k3s-install.sh {{.HOST}}

  kubeconfig:
    desc: "devmesh: Admin-Kubeconfig als Context devmesh mergen (SERVER=<name>, Default: server-init)"
    cmds:
      - bash scripts/devmesh/kubeconfig.sh {{.SERVER}}

  status:
    desc: "devmesh: Knoten, etcd-Mitglieder und juengsten etcd-Snapshot melden (Exit != 0 ab 12h Snapshot-Alter)"
    cmds:
      - bash scripts/devmesh/status.sh
```

  Der Include in `Taskfile.yml` kommt aus SP-1 und bleibt unveraendert.

- [ ] **5.7** `docs/agent-guide/registry/networks.yaml` erweitern. Den Eintrag `tailscale` (von SP-1 geaendert) nicht anfassen.

  a) Im Eintrag `home-lan` die Liste `overlaps` nach dem Block `- with: service-cidr-fleet` (endet vor `- id: korczewski-mesh`) um die Gegenseite ergaenzen:

```yaml
      - with: devmesh-pod-cidr
        reason: Das /8 umfasst 10.52.0.0/16 vollständig.
        mitigation: >-
          Kein LAN-Host liegt in 10.52.0.0/16. Pod-Verkehr läuft über flannel-wg
          zwischen den devmesh-Knoten und wird nie vom LAN aus adressiert.
      - with: devmesh-service-cidr
        reason: Das /8 umfasst 10.53.0.0/16 vollständig.
        mitigation: >-
          Service-Adressen werden nie vom Host aus adressiert, nur clusterintern
          über kube-proxy.
```

  b) Direkt nach dem Eintrag `service-cidr-fleet` (vor `- id: tailscale`) einfuegen:

```yaml
  - id: devmesh-pod-cidr
    cidr: 10.52.0.0/16
    owner: devmesh-Cluster (ADR-008)
    purpose: Pod-Netz; k3s vergibt daraus je Knoten ein /24 (--cluster-cidr)
    status: active
    source: scripts/devmesh/k3s-install.sh (CLUSTER_CIDR)
    notes: >-
      Bewusst nicht 10.42.0.0/16. PK-Desktop routet das Pod-Netz von fleet über
      wg-gpu, gleiche Adressen aus devmesh liefen dort in den falschen Tunnel.
    overlaps:
      - with: home-lan
        reason: Liegt vollständig im /8 des Heimnetzes.
        mitigation: Kein LAN-Host liegt im Bereich; Pod-Verkehr läuft über flannel-wg zwischen den Knoten.
  - id: devmesh-service-cidr
    cidr: 10.53.0.0/16
    owner: devmesh-Cluster (ADR-008)
    purpose: Service-Netz (ClusterIP), kubernetes.default auf 10.53.0.1, CoreDNS auf 10.53.0.10
    status: active
    source: scripts/devmesh/k3s-install.sh (SERVICE_CIDR, CLUSTER_DNS)
    overlaps:
      - with: home-lan
        reason: Liegt vollständig im /8 des Heimnetzes.
        mitigation: Clusterintern über kube-proxy, nie vom Host adressiert.
```

  `status` kennt nur `active` und `retired` (`scripts/networks-check.mjs`). Die Bereiche gelten ab dem Merge als vergeben, deshalb `active`.

- [ ] **5.8** GREEN-Lauf fuer die ganze Suite, Registry-Guard und Include-Guard:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh tests/spec/network-address-plan tests/spec/ci-cd/taskfiles-dir-convention.bats
# expected: PASS
task networks:check
task networks:map
task --list | grep -F 'devmesh:'
```

- [ ] **5.9** Commit: `feat(infra): devmesh-Tasks, Inventar-k3s-Felder und Cluster-Netze in der Registry [T900117]`

### Task 6: Live-Gate — SSH-Zugang und Hostnamen

Ab hier wirken die Schritte auf echte Hosts. Voraussetzung ist der Operator-Bootstrap aus `proposal.md` (Benutzer `patrick`, Key-Login mit `patrick_ed25519`, `sudo` ohne Passwort).

- [ ] **6.1** Positiv-Signal pro Host verlangen. Ein fehlendes `OK` ist ein Stopp, kein Weitermachen:

```bash
for h in gpu-metal gpu-cluster gpu-cluster2; do
  ip="$(HOST="$h" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip' devmesh/inventory.yaml)"
  if ssh -i ~/.ssh/patrick_ed25519 -o BatchMode=yes -o ConnectTimeout=10 \
       -o StrictHostKeyChecking=accept-new "patrick@$ip" sudo -n true; then
    remote_name="$(ssh -i ~/.ssh/patrick_ed25519 -o BatchMode=yes "patrick@$ip" hostname)"
    echo "OK $h $ip hostname=$remote_name"
  else
    echo "FAIL $h $ip rc=$?"
  fi
done
```

Erwartet: drei `OK`-Zeilen, `hostname` jeweils gleich dem Inventar-Namen.

- [ ] **6.2** Bei `FAIL` oder abweichendem Hostnamen: stoppen und Kommentar schreiben, dann auf den Operator warten:

```bash
bash scripts/ticket.sh add-comment --id T900117 --body "Live-Gate SSH gescheitert: <Ausgabe von 6.1>. Operator-Bootstrap (patrick, patrick_ed25519, NOPASSWD sudo) bzw. Hostname fehlt."
```

### Task 7: Live-Preflight und Abhilfe

- [ ] **7.1** Preflight fuer alle drei Server, Ausgabe festhalten:

```bash
for h in gpu-metal gpu-cluster gpu-cluster2; do
  echo "== $h"; task devmesh:preflight HOST="$h"; echo "exit=$?"
done 2>&1 | tee /tmp/devmesh-preflight-$(date +%Y%m%d).txt
```

- [ ] **7.2** Abhilfe nur fuer diese Befunde, danach 7.1 wiederholen:
  - Swap aktiv:

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@<lan_ip> 'sudo -n swapoff -a && sudo -n sed -i.devmesh-bak -E "s|^([^#].*[[:space:]]swap[[:space:]].*)$|# devmesh T900117: \1|" /etc/fstab && swapon --show --noheadings | wc -l'
# erwartet: 0
```

  - Zeitsynchronisation aus:

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@<lan_ip> 'sudo -n timedatectl set-ntp true; sleep 20; timedatectl show -p NTPSynchronized --value'
# erwartet: yes
```

  - Rotierende etcd-Platte oder belegter k3s-Port: stoppen, Befund per `bash scripts/ticket.sh add-comment --id T900117 --body "…"` melden, Operator-Entscheidung abwarten (R1). Keine automatische Abhilfe.

- [ ] **7.3** Listener, die der Preflight als `INFO` meldet (bekannt: `gpupod` auf :8080 bei `gpu-metal`), vor der Installation einordnen, weil ufw sie danach sperrt (R2):

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@10.1.0.101 "sudo -n ss -Htlnp 'sport = :8080'; echo ---; sudo -n ss -Htn 'sport = :8080'; echo ---; sudo -n ufw status verbose"
```

  Entscheidungsregel: Bindeadresse `127.0.0.1` → keine Regel. Sonst je beobachtetem Quellnetz eine Regel, z. B. Quellen in `10.0.0.0/8`:

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@10.1.0.101 "sudo -n ufw allow from 10.0.0.0/8 to any port 8080 proto tcp comment 'gpupod'"
```

  Keine Verbindung beobachtet und Bindeadresse nicht Loopback: Clients von `gpupod` im Ticket erfragen, bevor Task 8 beginnt.

- [ ] **7.4** Endstand ins Ticket: alle drei Preflights Exit 0, Plattentyp je Host, getroffene Abhilfen, mit den Befehlen aus 7.1–7.3.

### Task 8: Live-Installation

- [ ] **8.1** `gpu-metal` initialisieren:

```bash
task devmesh:install HOST=gpu-metal DRY_RUN=1      # Befehl pruefen
task devmesh:install HOST=gpu-metal
ssh -i ~/.ssh/patrick_ed25519 patrick@10.1.0.101 'sudo -n k3s kubectl get nodes -o wide'
task devmesh:kubeconfig
kubectl --context devmesh get nodes -o wide
```

- [ ] **8.2** Joins direkt nacheinander (zwei etcd-Mitglieder sind kurzzeitig quorum-empfindlich). Vor jedem Join den Preflight wiederholen, jetzt muss `10.1.0.101:6443` als `offen` erscheinen (R4):

```bash
for h in gpu-cluster gpu-cluster2; do
  task devmesh:preflight HOST="$h" && task devmesh:install HOST="$h" || { echo "STOPP bei $h"; break; }
  kubectl --context devmesh get nodes -o wide
done
```

- [ ] **8.3** Idempotenz live belegen:

```bash
ts() { ssh -i ~/.ssh/patrick_ed25519 patrick@10.10.10.2 'systemctl show k3s -p ActiveEnterTimestamp --value'; }
before="$(ts)"
task devmesh:install HOST=gpu-cluster         # erwartet: Zeile "unveraendert: ..."
after="$(ts)"
[ -n "$before" ] && [ "$before" = "$after" ] && echo IDEMPOTENT || echo "GEAENDERT ($before -> $after)"
```

- [ ] **8.4** Ersten Snapshot erzeugen und das Feld aus R4 verifizieren:

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@10.1.0.101 'sudo -n k3s etcd-snapshot save --name devmesh-initial'
kubectl --context devmesh get etcdsnapshotfiles.k3s.cattle.io \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.creationTime}{"\n"}{end}'
task devmesh:status
```

  Erwartet: mindestens eine Zeile mit Zeitstempel, `task devmesh:status` Exit 0. Ist `creationTime` leer, das Feld per `kubectl --context devmesh explain etcdsnapshotfile.status` bestimmen, `scripts/devmesh/status.sh` und die Fixture in `tests/spec/local-dev-mesh/status.bats` in diesem PR anpassen und Task 4.6 wiederholen.

### Task 9: Live-Abnahme

- [ ] **9.1** Knoten, Adressen und Version gegen das Inventar:

```bash
diff <(kubectl --context devmesh get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' | sort) \
     <(yq -r '.peers[] | select((.k3s_role // "") != "") | .name + " " + .lan_ip' devmesh/inventory.yaml | sort) \
  && echo "NODES=INVENTAR"
kubectl --context devmesh get nodes -o jsonpath='{range .items[*]}{.status.nodeInfo.kubeletVersion}{"\n"}{end}' | sort -u
yq -r '.k3s_version' devmesh/inventory.yaml
task devmesh:status
kubectl --context devmesh get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.podCIDR}{"\n"}{end}'
kubectl --context devmesh get svc kubernetes -n default -o jsonpath='{.spec.clusterIP}{"\n"}'
kubectl --context devmesh get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}{"\n"}'
```

  Erwartet: `NODES=INVENTAR`, eine Versionszeile gleich `k3s_version`, jede `podCIDR` in `10.52.0.0/16`, ClusterIPs `10.53.0.1` und `10.53.0.10`, Status meldet `Knoten: 3/3 Ready` und `etcd-Mitglieder: 3/3 Ready`.

- [ ] **9.2** Storage-Label (Spec-Szenario), mit Positiv-Anker auf beiden Seiten:

```bash
live="$(kubectl --context devmesh get nodes -l storage=true -o name | sed 's|^node/||' | sort)"
soll="$(yq -r '.peers[] | select(((.labels // []) | map(select(. == "storage=true")) | length) > 0) | .name' devmesh/inventory.yaml | sort)"
echo "live=[$live] soll=[$soll]"; [ -n "$live" ] && [ "$live" = "$soll" ] && echo STORAGE-OK
kubectl --context devmesh get storageclass
```

- [ ] **9.3** Flannel `wireguard-native`, ufw und TLS-SANs:

```bash
for ip in 10.1.0.101 10.10.10.2 10.10.10.3; do
  ssh -i ~/.ssh/patrick_ed25519 patrick@$ip 'echo "$(hostname): $(ip -br link show flannel-wg) | $(sudo -n ufw status | head -n1)"'
done
TN="$(yq -r '.peers[] | select(.name == "gpu-metal") | .tailnet_name' devmesh/inventory.yaml)"
echo | openssl s_client -connect "${TN}:6443" -servername "$TN" 2>/dev/null | openssl x509 -noout -ext subjectAltName
```

  Erwartet: drei Zeilen mit Interface `flannel-wg` und `Status: active`; die SAN-Liste enthaelt alle drei LAN-Adressen und Tailnet-Namen der Server.

- [ ] **9.4** PK-Desktop ist kein Knoten (Positiv-Anker: drei Adresszeilen):

```bash
addrs="$(kubectl --context devmesh get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.addresses[*].address}{"\n"}{end}')"
printf '%s\n' "$addrs" | grep -c .
pk_ts="$("/mnt/c/Program Files/Tailscale/tailscale.exe" ip -4 | tr -d '\r')"
hit="$(printf '%s\n' "$addrs" | grep -i -F -e 'pk-desktop' -e '10.10.0.3' -e "$pk_ts" || true)"
[ -z "$hit" ] && echo "PK-DESKTOP-KEIN-KNOTEN"
```

- [ ] **9.5** Ausfall eines Servers (Spec-Szenario). `gpu-cluster` stoppen, API und etcd-Gesundheit messen, dann zurueckholen:

```bash
ssh -i ~/.ssh/patrick_ed25519 patrick@10.10.10.2 'sudo -n systemctl stop k3s'
sleep 30
kubectl --context devmesh get nodes
ssh -i ~/.ssh/patrick_ed25519 patrick@10.1.0.101 'sudo -n bash -s' <<'EOF'
D=/var/lib/rancher/k3s/server/tls/etcd
C=(--cacert "$D/server-ca.crt" --cert "$D/client.crt" --key "$D/client.key" -s --max-time 3)
echo "members=$(curl "${C[@]}" -X POST -d '{}' https://127.0.0.1:2379/v3/cluster/member/list | grep -o '"clientURLs"' | wc -l)"
for ip in 10.1.0.101 10.10.10.2 10.10.10.3; do
  echo "$ip $(curl "${C[@]}" "https://$ip:2379/health" || echo unreachable)"
done
EOF
ssh -i ~/.ssh/patrick_ed25519 patrick@10.10.10.2 'sudo -n systemctl start k3s'
kubectl --context devmesh wait --for=condition=Ready node/gpu-cluster --timeout=180s
```

  Erwartet: `kubectl get nodes` antwortet waehrend des Ausfalls, `members=3`, zwei Zeilen mit `"health":"true"`, eine `unreachable`. Danach wieder drei `Ready`.

- [ ] **9.6** Context-Umschaltung (design.md D3) und Tailnet-Pfad:

```bash
task devmesh:kubeconfig SERVER=gpu-cluster && kubectl --context devmesh get nodes
task devmesh:kubeconfig && kubectl --context devmesh get nodes
"/mnt/c/Program Files/Tailscale/tailscale.exe" ping gpu-metal
```

  Optional von PK-L-1 ausserhalb des Heimnetzes: `kubectl --context devmesh get nodes` nach `task devmesh:kubeconfig`. Ergebnis mit Pfad (`direct`/`relay`) festhalten.

- [ ] **9.7** Abnahme ins Ticket: Ausgaben aus 9.1–9.6 mit den jeweiligen Befehlen.

```bash
bash scripts/ticket.sh add-comment --id T900117 --body "Live-Abnahme devmesh-k3s-cluster: <Ausgaben und Befehle aus Task 9>"
```

### Task 10: Verifikation

- [ ] **10.1** Suite komplett (beide Formen nach tests/CLAUDE.md T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh*
```

- [ ] **10.2** Test-Inventar regenerieren und `components/website/src/data/test-inventory.json` mitcommitten:

```bash
task test:inventory
```

- [ ] **10.3** Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

  `task test:changed` meldet bei fehlendem GNU `parallel` `Executed 0 instead of expected N`. Das ist kein Testergebnis (tests/CLAUDE.md, T900093).

- [ ] **10.4** OpenSpec-Gate:

```bash
bash scripts/openspec.sh validate
```

- [ ] **10.5** Commit: `chore(infra): Test-Inventar und Freshness fuer devmesh-k3s-cluster [T900117]`
