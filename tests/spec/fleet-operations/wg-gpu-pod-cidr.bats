#!/usr/bin/env bats
# wg-gpu-pod-cidr.bats — Guard fuer T002491.
#
# PRUEFMODUS: Ergebnis-basiert. Jeder Test ruft generate-wg-conf.sh auf und
# prueft dessen tatsaechliche Ausgabe ($output), nicht Muster im Quelltext.
#
# HINTERGRUND (2026-08-01): Der GPU-Host erreichte drei von fuenf fleet-Nodes
# nicht. Ursache war NICHT ein toter Tunnel — der Handshake war frisch —, sondern
# unvollstaendige AllowedIPs. In WireGuard ist AllowedIPs zugleich Routing-Tabelle
# UND Eingangsfilter: fehlt das Pod-CIDR eines Nodes, verwirft der Host dessen
# Pod-Pakete lautlos. Kein Fehler, keine Meldung, nur Stille.
#
# Der Generator kannte Pod-CIDRs ueberhaupt nicht (er schrieb nur wg_ip/32), und
# die drei Control-Plane-Nodes fehlten im wg-gpu-Mesh (env `mentolder`) komplett.
# Weil Pods nicht auf Nodes gepinnt sind, haing die Erreichbarkeit davon ab, wo ein
# Pod zufaellig landete — intermittierend ohne Muster und darum monatelang unentdeckt.

setup() {
  PROJECT_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${PROJECT_DIR}/scripts/hetzner/generate-wg-conf.sh"
  DUMMY_KEY="0000000000000000000000000000000000000000000="
  GPU_HOST="wsl2-gpu-mentolder"
}

# Positiv-Anker fuer alle folgenden Tests: der Generator laeuft ueberhaupt und
# erzeugt Peers. Ohne diesen Anker wuerden die AllowedIPs-Zusicherungen unten
# vakuos bestehen, sobald das Skript gar nichts ausgibt.
@test "generator emits a usable wg-gpu config for the GPU host" {
  run bash "$SCRIPT" --env mentolder --node-name "$GPU_HOST" --private-key "$DUMMY_KEY"
  [ "$status" -eq 0 ]
  [[ "$output" == *"[Interface]"* ]]
  [ "$(grep -c '^\[Peer\]' <<<"$output")" -ge 3 ]
}

@test "GPU host config lists every fleet control-plane node as a peer" {
  run bash "$SCRIPT" --env mentolder --node-name "$GPU_HOST" --private-key "$DUMMY_KEY"
  [ "$status" -eq 0 ]
  for node in pk-hetzner-4 pk-hetzner-6 pk-hetzner-8; do
    [[ "$output" == *"# ${node}"* ]] || {
      echo "control-plane node ${node} missing from GPU host peer list" >&2
      return 1
    }
  done
}

@test "GPU host config carries the pod CIDR of every kubernetes peer" {
  run bash "$SCRIPT" --env mentolder --node-name "$GPU_HOST" --private-key "$DUMMY_KEY"
  [ "$status" -eq 0 ]
  # wg_ip -> pod_cidr, wie im Cluster vergeben (kubectl get nodes -o ...podCIDR).
  local pairs=(
    "192.168.100.33 10.42.0.0/24"
    "192.168.100.34 10.42.1.0/24"
    "192.168.100.35 10.42.2.0/24"
    "192.168.100.32 10.42.3.0/24"
    "192.168.100.31 10.42.5.0/24"
  )
  local entry wg cidr
  for entry in "${pairs[@]}"; do
    wg="${entry%% *}"; cidr="${entry##* }"
    [[ "$output" == *"AllowedIPs = ${wg}/32, ${cidr}"* ]] || {
      echo "missing combined AllowedIPs for ${wg} (want pod CIDR ${cidr})" >&2
      echo "--- generated ---" >&2; echo "$output" >&2
      return 1
    }
  done
}

# Die Pod-CIDRs gehoeren AUSSCHLIESSLICH in die Konfiguration des GPU-Hosts.
# Traegt ein k8s-Node sie fuer seine Geschwister ein, konkurriert WireGuard mit
# dem Cluster-eigenen Pod-Routing (flannel ueber wg-fleet) — deshalb hier ein
# Negativtest MIT Positiv-Anker in derselben Pruefung.
@test "kubernetes node config keeps plain /32 AllowedIPs (no pod CIDR)" {
  run bash "$SCRIPT" --env mentolder --node-name pk-hetzner-4 --private-key "$DUMMY_KEY"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der GPU-Host ist als Peer vorhanden ...
  [[ "$output" == *"AllowedIPs = 192.168.100.10/32"* ]]
  # ... und KEINE Zeile dieser Konfiguration nennt ein Pod-CIDR.
  [ "$(grep -c '10\.42\.' <<<"$output")" -eq 0 ]
}
