#!/usr/bin/env bats
# tests/spec/sdlc-isolation/kubelet-cert-guard.bats
# SSOT: openspec/changes/fix-k3d-kubelet-cert-T002999/tasks.md (T002999)
#
# Pruefmodus: command output verification [T002448-M4]. Die Tests fuehren
# scripts/sdlc/kubelet-cert-check.sh AUS und pruefen Exit-Code und Ausgabe.
# kubectl/docker/openssl werden per PATH-Stub bereitgestellt, damit der Test
# ohne laufenden k3d-Cluster und ohne Docker in CI laeuft [T002820] — er misst
# das Verhalten des Skripts, nicht die Ausstattung des Runners.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/kubelet-cert-guard.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  SCRIPT="${REPO_ROOT}/scripts/sdlc/kubelet-cert-check.sh"
  STUB_BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_BIN"
}

# _stub_cluster <node-ip> <cert-san-ip> — kubectl meldet <node-ip> als
# InternalIP, openssl meldet <cert-san-ip> im SAN des Kubelet-Zertifikats.
_stub_cluster() {
  local node_ip="$1" san_ip="$2"

  cat >"${STUB_BIN}/kubectl" <<EOF
#!/usr/bin/env bash
# nur der Node-Listen-Aufruf wird bedient; alles andere schlaegt fehl
case "\$*" in
  *"get nodes"*|*"get node"*) echo "k3d-mentolder-dev-server-0 ${node_ip}" ;;
  *) exit 1 ;;
esac
EOF

  cat >"${STUB_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
# docker exec <node> cat <crt> -> Platzhalter-PEM (openssl-Stub liest es nicht)
echo "-----BEGIN CERTIFICATE-----"
echo "stub"
echo "-----END CERTIFICATE-----"
EOF

  cat >"${STUB_BIN}/openssl" <<EOF
#!/usr/bin/env bash
cat >/dev/null
echo "        X509v3 Subject Alternative Name:"
echo "            DNS:k3d-mentolder-dev-server-0, DNS:localhost, IP Address:127.0.0.1, IP Address:${san_ip}"
EOF

  chmod +x "${STUB_BIN}/kubectl" "${STUB_BIN}/docker" "${STUB_BIN}/openssl"
}

@test "kubelet-cert-check.sh existiert und ist ausfuehrbar" {
  [ -x "$SCRIPT" ]
}

@test "--help nennt --repair als Reparaturweg" {
  run "$SCRIPT" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF -- '--repair'
}

# Positiv-Anker [T002356-M1]: passender SAN muss GRUEN sein, sonst ist die
# Negativ-Aussage darunter wertlos (ein immer-rotes Skript erfuellt sie auch).
@test "passender SAN: Exit 0" {
  _stub_cluster "172.23.0.4" "172.23.0.4"
  PATH="${STUB_BIN}:${PATH}" run "$SCRIPT" --context k3d-mentolder-dev
  [ "$status" -eq 0 ]
}

@test "veralteter SAN nach IP-Tausch: Exit ungleich 0" {
  _stub_cluster "172.23.0.4" "172.23.0.3"
  PATH="${STUB_BIN}:${PATH}" run "$SCRIPT" --context k3d-mentolder-dev
  [ "$status" -ne 0 ]
}

@test "veralteter SAN: Meldung nennt Node, beide IPs und den Reparaturweg" {
  _stub_cluster "172.23.0.4" "172.23.0.3"
  PATH="${STUB_BIN}:${PATH}" run "$SCRIPT" --context k3d-mentolder-dev
  echo "$output" | grep -qF 'k3d-mentolder-dev-server-0'
  echo "$output" | grep -qF '172.23.0.4'
  echo "$output" | grep -qF '172.23.0.3'
  echo "$output" | grep -qF -- '--repair'
}

@test "fehlendes openssl: Exit 2 (Vorbedingung), nicht Exit 1 (Befund)" {
  _stub_cluster "172.23.0.4" "172.23.0.3"
  rm -f "${STUB_BIN}/openssl"
  # PATH darf /usr/bin und /bin NICHT enthalten: dort liegt das echte openssl,
  # das den geloeschten Stub sonst ersetzt. Der Test prueft dann eine
  # Vorbedingung, die er nie hergestellt hat, und ist auf jeder Maschine mit
  # installiertem openssl rot — beobachtet in CI und lokal (T002999).
  #
  # bash muss trotzdem auffindbar bleiben: der Shebang ist `#!/usr/bin/env bash`,
  # und `env` sucht bash ueber PATH. Ohne diesen Symlink endet der Lauf mit 127
  # ('command not found') statt mit der geprueften 2 — gruen waere der Test dann
  # nie, aber aus dem falschen Grund rot.
  ln -sf "$(command -v bash)" "${STUB_BIN}/bash"
  PATH="${STUB_BIN}" run "$SCRIPT" --context k3d-mentolder-dev
  [ "$status" -eq 2 ]
  # Ohne diese Zusicherung wuerde der Test auch gruen, wenn Exit 2 aus einer
  # ANDEREN fehlenden Vorbedingung stammt (kubectl, docker, Kontext).
  echo "$output" | grep -qF 'openssl'
}

# ── Fehlerpfad-Hinweis im Ticket-Werkzeug ────────────────────────────────────
# Der x509-Fehler nennt psql und die Ticket-Tabelle und fuehrt damit in die
# falsche Richtung. Der gemeinsame Exec-Helfer muss ihn uebersetzen.

@test "kubelet-cert-hint uebersetzt den x509-Fehler in einen Kubelet-Hinweis" {
  local lib="${REPO_ROOT}/scripts/lib/kubelet-cert-hint.sh"
  [ -f "$lib" ]
  run bash -c "source '$lib'; _kubelet_cert_hint 'error: Internal error occurred: error sending request: Post \"https://172.23.0.4:10250/exec/workspace/shared-db-x/postgres\": tls: failed to verify certificate: x509: certificate is valid for 127.0.0.1, 172.23.0.3, not 172.23.0.4' 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qiF 'kubelet'
  echo "$output" | grep -qF 'kubelet-cert-check.sh'
}

@test "kubelet-cert-hint schweigt bei unverwandten Fehlern (Positiv-Anker oben)" {
  local lib="${REPO_ROOT}/scripts/lib/kubelet-cert-hint.sh"
  [ -f "$lib" ]
  run bash -c "source '$lib'; _kubelet_cert_hint 'ERROR: relation \"tickets\" does not exist' 2>&1"
  [ -z "$output" ]
}

@test "der gemeinsame Ticket-Exec-Helfer bindet den Hinweis ein" {
  run grep -c 'kubelet-cert-hint' "${REPO_ROOT}/scripts/vda/ticket/_ticket-core.sh"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
