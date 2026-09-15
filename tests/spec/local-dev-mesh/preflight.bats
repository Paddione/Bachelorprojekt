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
