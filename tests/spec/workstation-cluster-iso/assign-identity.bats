#!/usr/bin/env bats
# Pruefmodus: command output verification.
# Fuehrt scripts/iso/autoinstall/assign-identity.sh gegen ein Fake-/target aus
# und prueft das RESULTAT (geschriebene /etc/hostname, /etc/hosts), nicht den
# Quelltext.
#
# Diese Zuordnung ist der Grund, warum ein einziges ISO fuer drei Maschinen
# reicht. Faellt sie aus, heissen alle drei Nodes gleich und k3s haelt sie
# beim Join nicht auseinander.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  ASSIGN="${REPO_ROOT}/scripts/iso/autoinstall/assign-identity.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR}/assign-id.XXXXXX")"
  TARGET="${TMP}/target"
  mkdir -p "${TARGET}/etc" "${TARGET}/var/log"
  printf '127.0.0.1\tlocalhost\n127.0.1.1\tws-node\n' > "${TARGET}/etc/hosts"
  printf 'ws-node\n' > "${TARGET}/etc/hostname"

  cat > "${TMP}/node-map" <<'MAP'
# Kommentarzeile muss ignoriert werden
aa:bb:cc:dd:ee:01  ws-node-1
AA:BB:CC:DD:EE:02  ws-node-2
MAP
  export ASSIGN_IDENTITY_LOG="${TMP}/assign.log"
}

teardown() {
  rm -rf "$TMP"
}

@test "assign-identity: MAC aus der node-map setzt den zugeordneten Hostnamen" {
  NODE_MAP="${TMP}/node-map" ASSIGN_IDENTITY_MACS="aa:bb:cc:dd:ee:01" \
    run bash "$ASSIGN" "$TARGET"
  [ "$status" -eq 0 ]
  [ "$(cat "${TARGET}/etc/hostname")" = "ws-node-1" ]
  grep -q '^127\.0\.1\.1[[:space:]]*ws-node-1$' "${TARGET}/etc/hosts"
}

@test "assign-identity: Gross-/Kleinschreibung der MAC ist egal" {
  NODE_MAP="${TMP}/node-map" ASSIGN_IDENTITY_MACS="AA:BB:CC:DD:EE:02" \
    run bash "$ASSIGN" "$TARGET"
  [ "$status" -eq 0 ]
  [ "$(cat "${TARGET}/etc/hostname")" = "ws-node-2" ]
}

@test "assign-identity: unbekannte MAC ergibt einen eindeutigen Fallback-Namen" {
  NODE_MAP="${TMP}/node-map" ASSIGN_IDENTITY_MACS="11:22:33:44:55:66" \
    run bash "$ASSIGN" "$TARGET"
  [ "$status" -eq 0 ]
  # Fallback = ws- plus die letzten drei Oktette, damit zwei unbekannte
  # Maschinen nicht denselben Namen bekommen.
  [ "$(cat "${TARGET}/etc/hostname")" = "ws-445566" ]
}

@test "assign-identity: zwei MACs, Treffer gewinnt gegen Nicht-Treffer" {
  # Realer Fall: Board mit zwei NICs, nur eine steht in der Tabelle.
  NODE_MAP="${TMP}/node-map" ASSIGN_IDENTITY_MACS="99:99:99:99:99:99 aa:bb:cc:dd:ee:01" \
    run bash "$ASSIGN" "$TARGET"
  [ "$status" -eq 0 ]
  [ "$(cat "${TARGET}/etc/hostname")" = "ws-node-1" ]
}

@test "assign-identity: cloud-init darf den Hostnamen beim ersten Boot nicht ueberschreiben" {
  NODE_MAP="${TMP}/node-map" ASSIGN_IDENTITY_MACS="aa:bb:cc:dd:ee:01" \
    run bash "$ASSIGN" "$TARGET"
  [ "$status" -eq 0 ]
  grep -q 'preserve_hostname: true' \
    "${TARGET}/etc/cloud/cloud.cfg.d/99-preserve-hostname.cfg"
}

@test "assign-identity: fehlende node-map bricht die Installation nicht ab" {
  NODE_MAP="${TMP}/gibt-es-nicht" ASSIGN_IDENTITY_MACS="aa:bb:cc:dd:ee:01" \
    run bash "$ASSIGN" "$TARGET"
  # Exit 0 ist hier Absicht: ein late-command mit Exit != 0 laesst den
  # gesamten Autoinstall-Lauf scheitern. Ein schlecht benannter Node ist
  # besser als eine abgebrochene Installation.
  [ "$status" -eq 0 ]
  [ "$(cat "${TARGET}/etc/hostname")" = "ws-445566" ] || \
    [ "$(cat "${TARGET}/etc/hostname")" = "ws-ddee01" ]
}
