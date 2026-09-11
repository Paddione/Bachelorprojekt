#!/usr/bin/env bats
# tests/spec/local-dev-mesh/tailnet-check.bats
# T900116: scripts/devmesh/tailnet-check.sh — Pfadmeldung direct/relay und die Trennung
# Befund (Exit 1) / Vorbedingung (Exit 2); Inventar-Szenario ueber --list.
#
# Pruefmodus: Ausfuehrung. Die Tailscale-CLI ist per TAILSCALE_CLI durch einen Stub ersetzt,
# das Inventar ist synthetisch (DEVMESH_INVENTORY). Kein Test beruehrt das echte Tailnet.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/tailnet-check.sh"
  TMPDIR="$(mktemp -d)"
  command -v python3 >/dev/null 2>&1 || skip "python3 not installed"
  python3 -c 'import yaml' >/dev/null 2>&1 || skip "PyYAML not installed"

  cat > "$TMPDIR/inventory.yaml" <<'EOF'
peers:
  - name: srv-a
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.1.0.201
    tailnet_name: srv-a
  - name: srv-b
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.10.10.201
    tailnet_name: srv-b
  - name: cli-a
    role: client
    tag: "tag:devclient"
    lan_ip: null
    tailnet_name: cli-a
EOF

  # Stub der Tailscale-CLI. Steuerung ueber Umgebungsvariablen:
  #   STUB_STATE  BackendState fuer `status --json` (Default Running)
  #   STUB_RELAY  leerzeichengetrennte Namen, die nur ueber DERP antworten
  #   STUB_DOWN   leerzeichengetrennte Namen, die gar nicht antworten
  #   STUB_CRLF   1 = Ausgabe mit CRLF wie die Windows-CLI
  # Ein DERP-only-Ping endet wie die echte CLI mit Exit 1 ("direct connection not established").
  cat > "$TMPDIR/tailscale" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
eol=$'\n'; [[ "${STUB_CRLF:-0}" == 1 ]] && eol=$'\r\n'
case "$1" in
  status)
    printf '{"BackendState": "%s"}%s' "${STUB_STATE:-Running}" "$eol"
    exit 0 ;;
  ping)
    target="${*: -1}"
    if [[ " ${STUB_DOWN:-} " == *" $target "* ]]; then
      printf 'timeout waiting for ping reply%s' "$eol"; exit 1
    fi
    if [[ " ${STUB_RELAY:-} " == *" $target "* ]]; then
      printf 'pong from %s (100.64.0.9) via DERP(fra) in 41ms%s' "$target" "$eol"
      printf 'direct connection not established%s' "$eol"; exit 1
    fi
    printf 'pong from %s (100.64.0.9) via 10.1.0.201:41641 in 2ms%s' "$target" "$eol"
    exit 0 ;;
esac
exit 64
STUB
  chmod +x "$TMPDIR/tailscale"
  export STUB_LOG="$TMPDIR/calls.log"
  : > "$STUB_LOG"
  export DEVMESH_INVENTORY="$TMPDIR/inventory.yaml"
  export TAILSCALE_CLI="$TMPDIR/tailscale"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T900116: alle Server direkt erreichbar -> Exit 0, Clients werden nicht gepingt" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  # Positiv-Anker: beide Server wurden tatsaechlich gepingt.
  grep -qE '^ping .*srv-a$' "$STUB_LOG" || { echo "srv-a nie gepingt"; cat "$STUB_LOG"; return 1; }
  grep -qE '^ping .*srv-b$' "$STUB_LOG" || { echo "srv-b nie gepingt"; cat "$STUB_LOG"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
  local client_pings
  client_pings="$(grep -E '^ping .*cli-a$' "$STUB_LOG" || true)"
  [ -z "$client_pings" ] || { echo "Client wurde gepingt: $client_pings"; return 1; }
}

@test "T900116: Server nur ueber DERP erreichbar -> relay und Exit 0 trotz Ping-Exit 1" {
  STUB_RELAY="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'relay' || { echo "srv-b nicht relay: $output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
}

@test "T900116: ein Server antwortet nicht -> Exit 1 und nennt ihn" {
  STUB_DOWN="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 1 ] || { echo "exit=$status, erwartet 1. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'unerreichbar' || { echo "srv-b nicht genannt: $output"; return 1; }
  # Positiv-Anker: der andere Server wurde weiterhin geprueft (Schleife bricht nicht ab).
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a fehlt: $output"; return 1; }
}

@test "T900116: Dienst im Zustand NoState -> Exit 2, kein Peer als unerreichbar gemeldet" {
  STUB_STATE="NoState" run bash "$SCRIPT"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt und wird genannt.
  grep -q '^status' "$STUB_LOG" || { echo "status nie abgefragt"; return 1; }
  printf '%s\n' "$output" | grep -qF 'NoState' || { echo "Zustand nicht genannt: $output"; return 1; }
  local pings peer_lines
  pings="$(grep '^ping' "$STUB_LOG" || true)"
  [ -z "$pings" ] || { echo "trotz NoState gepingt: $pings"; return 1; }
  peer_lines="$(printf '%s\n' "$output" | grep -F 'srv-' || true)"
  [ -z "$peer_lines" ] || { echo "Peer statt Dienstzustand gemeldet: $peer_lines"; return 1; }
}

@test "T900116: Tailscale-CLI fehlt -> Exit 2" {
  TAILSCALE_CLI="$TMPDIR/gibt-es-nicht" run bash "$SCRIPT"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'Tailscale-CLI' || { echo "fehlende CLI nicht genannt: $output"; return 1; }
}

@test "T900116: CRLF-Ausgabe der Windows-CLI wird korrekt gelesen" {
  STUB_CRLF=1 STUB_RELAY="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'relay' || { echo "srv-b nicht relay: $output"; return 1; }
}

@test "T900116: Server mit Client-Tag -> Inventar ungueltig, Exit 2 ohne Ping" {
  cat > "$TMPDIR/bad.yaml" <<'EOF'
peers:
  - name: srv-x
    role: server
    tag: "tag:devclient"
    lan_ip: 10.1.0.202
    tailnet_name: srv-x
EOF
  run bash "$SCRIPT" --inventory "$TMPDIR/bad.yaml"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-x' | grep -qF 'tag:devmesh' || { echo "Tag-Fehler nicht benannt: $output"; return 1; }
  local pings
  pings="$(grep '^ping' "$STUB_LOG" || true)"
  [ -z "$pings" ] || { echo "trotz ungueltigem Inventar gepingt: $pings"; return 1; }
}

@test "T900116: echtes Inventar — Server tragen tag:devmesh, Clients tag:devclient" {
  run bash "$SCRIPT" --inventory "${REPO_ROOT}/devmesh/inventory.yaml" --list
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  local servers clients wrong
  servers="$(printf '%s\n' "$output" | awk -F'\t' '$2=="server"' | wc -l)"
  clients="$(printf '%s\n' "$output" | awk -F'\t' '$2=="client"' | wc -l)"
  # Positiv-Anker: das Inventar liefert ueberhaupt Server und Clients.
  [ "$servers" -ge 1 ] && [ "$clients" -ge 1 ] || { echo "servers=$servers clients=$clients: $output"; return 1; }
  wrong="$(printf '%s\n' "$output" | awk -F'\t' '($2=="server" && $3!="tag:devmesh") || ($2=="client" && $3!="tag:devclient")')"
  [ -z "$wrong" ] || { echo "falscher Tag: $wrong"; return 1; }
  # --list braucht keine Tailscale-CLI.
  [ ! -s "$STUB_LOG" ] || { echo "--list rief die CLI auf"; cat "$STUB_LOG"; return 1; }
}
