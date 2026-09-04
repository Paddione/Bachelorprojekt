#!/usr/bin/env bats
# tests/spec/fleet-operations/wg-mesh-sync.bats
# T900083: wg:reconcile / wg:drift — ein gemeinsamer Renderer
# (generate-wg-conf.sh --peers-only) fuer beide Konsumenten.
#
# Pruefmodus: Ausfuehrung — Skripte werden mit synthetischer Registry und
# einem SSH-Stub (WG_MESH_SYNC_SSH) ausgefuehrt; kein Test fasst echte Nodes an.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GEN_SCRIPT="${REPO_ROOT}/scripts/hetzner/generate-wg-conf.sh"
  SYNC_SCRIPT="${REPO_ROOT}/scripts/wg-mesh-sync.sh"
  TMPDIR="$(mktemp -d)"

  command -v python3 >/dev/null 2>&1 || skip "python3 not installed"
  python3 -c 'import yaml' >/dev/null 2>&1 || skip "PyYAML not installed"
}

teardown() {
  rm -rf "$TMPDIR"
}

# ── --peers-only auf der echten Registry ────────────────────────────

@test "T900083: --peers-only gibt genau die Public Keys der uebrigen fleet-Teilnehmer aus" {
  # stdout und stderr getrennt erfasst (bats' `run` mischt beide in $output —
  # die SKIP-Meldung fuer terminal-sidekick geht bewusst nach stderr und darf
  # die stdout-Zeilenzaehlung nicht verfaelschen).
  local stdout
  stdout="$(bash "$GEN_SCRIPT" --env fleet --node-name pk-hetzner-4 --peers-only 2>"$TMPDIR/stderr.log")"
  local status=$?
  [ "$status" -eq 0 ] \
    || { echo "FAIL: exit=$status. stdout=$stdout"; return 1; }

  # Positiv-Anker: laeuft und findet die Umgebung.
  echo "$stdout" | grep -q . \
    || { echo "FAIL: leere Ausgabe."; return 1; }

  # Erwartete Menge dynamisch aus der Registry berechnen (Semantik statt
  # Darstellung, tests/CLAUDE.md T002716) statt eine Zahl zu hardcoden.
  local expected_count
  expected_count="$(python3 - "${REPO_ROOT}/wireguard/wg-mesh-nodes.yaml" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    mesh = yaml.safe_load(f)
env = mesh["fleet"]
cats = ("nodes", "gpu_hosts", "home_workers", "workers", "devc_servers", "laptops")
count = 0
for cat in cats:
    for node in env.get(cat) or []:
        if node["name"] == "pk-hetzner-4":
            continue
        if node.get("public_key"):
            count += 1
print(count)
PY
)"
  local actual_count
  actual_count="$(echo "$stdout" | grep -c .)"
  [ "$actual_count" = "$expected_count" ] \
    || { echo "FAIL: erwartet $expected_count Peer-Zeilen, erhalten $actual_count. stdout=$stdout"; return 1; }
}

@test "T900083: --peers-only enthaelt nicht den Node selbst" {
  run bash "$GEN_SCRIPT" --env fleet --node-name pk-hetzner-4 --peers-only
  [ "$status" -eq 0 ]
  # pk-hetzner-4's eigener Public Key darf nicht in der Ausgabe stehen.
  refute_pk4="tK3WzIcumUjACWqbXNgCqoSP9JhICAUHA+D8kSzMJ2o="
  echo "$output" | grep -qF "$refute_pk4" \
    && { echo "FAIL: Ausgabe enthaelt den Public Key von pk-hetzner-4 selbst."; return 1; }
  true
}

@test "T900083: --peers-only enthaelt keinen [Interface]-Block und kein PrivateKey" {
  run bash "$GEN_SCRIPT" --env fleet --node-name pk-hetzner-4 --peers-only
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '\[Interface\]' \
    && { echo "FAIL: Ausgabe enthaelt einen [Interface]-Block."; return 1; }
  echo "$output" | grep -qi 'PrivateKey' \
    && { echo "FAIL: Ausgabe enthaelt PrivateKey."; return 1; }
  true
}

@test "T900083: --peers-only ueberspringt Peers ohne public_key (stderr-Hinweis)" {
  local stdout
  stdout="$(bash "$GEN_SCRIPT" --env fleet --node-name pk-hetzner-4 --peers-only 2>"$TMPDIR/stderr.log")"
  [ $? -eq 0 ]
  echo "$stdout" | grep -qi 'terminal-sidekick' \
    && { echo "FAIL: terminal-sidekick (leerer public_key) landete in stdout. stdout=$stdout"; return 1; }
  # Positiv-Anker: der Hinweis MUSS auf stderr stehen, sonst verschwindet er stillschweigend.
  grep -qi 'terminal-sidekick' "$TMPDIR/stderr.log" \
    || { echo "FAIL: kein stderr-Hinweis auf das uebersprungene terminal-sidekick."; return 1; }
}

# ── wg-mesh-sync.sh — Grundgeruest ──────────────────────────────────

@test "T900083: wg-mesh-sync.sh existiert und ist ausfuehrbar" {
  [ -f "$SYNC_SCRIPT" ] || { echo "MISSING: $SYNC_SCRIPT"; return 1; }
  [ -x "$SYNC_SCRIPT" ] || { echo "NOT executable: $SYNC_SCRIPT"; return 1; }
}

@test "T900083: reconcile --env korczewski lehnt fehlenden interface-Key ab (Exit != 0)" {
  run bash "$SYNC_SCRIPT" reconcile --env korczewski
  [ "$status" -ne 0 ] \
    || { echo "FAIL: exit=$status, erwartet != 0 fuer korczewski ohne interface-Key."; return 1; }
  echo "$output" | grep -qi 'interface' \
    || { echo "FAIL: Fehlermeldung nennt nicht den fehlenden interface-Key. output=$output"; return 1; }
}

@test "T900083: drift --env fleet ohne erreichbare Nodes endet mit Exit 0 (Skip)" {
  # SSH-Stub, der jeden Aufruf als nicht erreichbar behandelt.
  cat > "$TMPDIR/ssh" <<'SSHSTUB'
#!/usr/bin/env bash
echo "ssh $*" >> "${SSH_LOG:-/dev/null}"
exit 255
SSHSTUB
  chmod +x "$TMPDIR/ssh"
  SSH_LOG="$TMPDIR/ssh.log" WG_MESH_SYNC_SSH="$TMPDIR/ssh" \
    run bash "$SYNC_SCRIPT" drift --env fleet
  [ "$status" -eq 0 ] \
    || { echo "FAIL: exit=$status, erwartet 0 (Skip) ohne erreichbare Nodes. output=$output"; return 1; }
  echo "$output" | grep -qi 'skip\|uebersprungen\|nicht erreichbar' \
    || { echo "FAIL: keine Skip-Meldung. output=$output"; return 1; }
}

@test "T900083: reconcile --env fleet --dry-run listet Aenderungen ohne wg set/syncconf auszufuehren" {
  # Synthetische Registry: zwei Nodes, einer hat einen fehlenden Peer.
  cat > "$TMPDIR/registry.yaml" <<'EOF'
fleet:
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  interface: "wg-fleet"
  nodes:
    - name: node-a
      endpoint: "10.0.0.1:51820"
      wg_ip: "10.20.0.1"
      public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    - name: node-b
      endpoint: "10.0.0.2:51820"
      wg_ip: "10.20.0.2"
      public_key: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
EOF

  # Stub: wg show <iface> peers liefert auf node-a KEINEN Peer (node-b fehlt).
  cat > "$TMPDIR/ssh" <<'SSHSTUB'
#!/usr/bin/env bash
echo "ssh $*" >> "${SSH_LOG:-/dev/null}"
# Letztes Argument ist das Remote-Kommando.
cmd="${*: -1}"
if [[ "$cmd" == *"wg show"* ]]; then
  exit 0   # keine Peers -> stdout bleibt leer
fi
echo "STUB-CALLED: $cmd" >> "${SSH_LOG:-/dev/null}"
exit 0
SSHSTUB
  chmod +x "$TMPDIR/ssh"

  SSH_LOG="$TMPDIR/ssh.log" WG_MESH_SYNC_SSH="$TMPDIR/ssh" WG_REGISTRY_FILE="$TMPDIR/registry.yaml" \
    run bash "$SYNC_SCRIPT" reconcile --env fleet --dry-run

  [ "$status" -eq 0 ] \
    || { echo "FAIL: exit=$status bei --dry-run. output=$output"; return 1; }
  echo "$output" | grep -qi 'node-a\|node-b\|BBBB\|AAAA' \
    || { echo "FAIL: keine Aenderungsliste in der Ausgabe. output=$output"; return 1; }

  # Kein 'wg set'/'wg syncconf' darf in den protokollierten SSH-Aufrufen stehen.
  if [ -f "$TMPDIR/ssh.log" ]; then
    grep -qi 'wg set\|wg syncconf' "$TMPDIR/ssh.log" \
      && { echo "FAIL: --dry-run hat eine mutierende wg-Aktion ausgeloest. log:"; cat "$TMPDIR/ssh.log"; return 1; }
  fi
  true
}
