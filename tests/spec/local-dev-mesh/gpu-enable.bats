#!/usr/bin/env bats
# tests/spec/local-dev-mesh/gpu-enable.bats — scripts/devmesh/gpu-enable.sh [T900179]
#
# Pruefmodus: Output-Verifikation. Das Skript laeuft gegen einen ssh-Stub, der argv und
# stdin getrennt protokolliert; bewertet werden Exit-Code, die Protokolle und einzelne
# Ausgabezeilen — nie der Quelltext des Skripts.
#
# Kein NVIDIA-Werkzeug und kein echter Host: in CI gibt es keinen GPU-Runner
# (grep -rn 'nvidia' .github/workflows/ -> keine Treffer). Die drei Akzeptanzstufen gegen
# die echte Karte laufen manuell, siehe Plan-Task P3.3.
#
# $0-Falle (tests/CLAUDE.md): das Arbeitsverzeichnis heisst hier selbst
# "devmesh-gpu-enable-T900179". Keine Assertion liest den Gesamtoutput ungefiltert; die
# Meldungstests filtern den Skriptpfad vorher heraus (_msg).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/gpu-enable.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  export SSH_STDIN_LOG="${BATS_TEST_TMPDIR}/ssh-stdin.log"
  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  cat > "$BIN/ssh" << 'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  *"sudo -n true"*) exit "${STUB_REACH_RC:-0}" ;;
  *"nvidia-ctk --version"*)
    if [ -n "${STUB_TOOLKIT:-}" ]; then printf '%s\n' "$STUB_TOOLKIT"; exit 0; fi
    exit 1 ;;
  *"bash -s"*) cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
STUB
  chmod +x "$BIN/ssh"
}

# Ausgabe ohne die Zeilen, die den Skriptpfad tragen (Usage/$0) — siehe Kopfkommentar.
_msg() { printf '%s\n' "$output" | grep -vF "$SCRIPT" || true; }

@test "Erstlauf: Toolkit-Installation, containerd-Konfiguration und k3s-Neustart gehen an den Host" {
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  grep -qF 'nvidia-container-toolkit' "$SSH_STDIN_LOG"
  grep -qF 'nvidia-ctk runtime configure --runtime=containerd' "$SSH_STDIN_LOG"
  grep -qF 'systemctl restart k3s' "$SSH_STDIN_LOG"
}

@test "zweiter Lauf gegen aktivierten Host: Exit 0, meldet das Toolkit, kein k3s-Neustart" {
  export STUB_TOOLKIT='NVIDIA Container Toolkit CLI version 1.17.8'
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^unveraendert: '
  # Positiv-Anker: der Zustand wurde tatsaechlich per ssh abgefragt
  grep -qF 'nvidia-ctk --version' "$SSH_ARGV_LOG"
  # ... und danach ging nichts mehr raus: kein Install-Skript, kein Neustart
  [ ! -s "$SSH_STDIN_LOG" ]
  restarts="$(grep -cF 'restart k3s' "$SSH_ARGV_LOG" || true)"
  [ "$restarts" -eq 0 ]
}

@test "fehlendes lokales Werkzeug: Exit 2, nennt yq, kein Kommando gegen den Host" {
  # Positiv-Anker: mit vollstaendigem PATH laeuft derselbe Aufruf durch und redet mit dem Host
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  [ -s "$SSH_ARGV_LOG" ]

  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  for t in bash env awk grep sed head tail cat cut tr sort dirname basename mktemp; do
    ln -sf "$(command -v "$t")" "$BIN/$t"
  done
  run env PATH="$BIN" "$BASH" "$SCRIPT" gpu-metal
  [ "$status" -eq 2 ]
  _msg | grep -qF 'yq'
  [ ! -s "$SSH_ARGV_LOG" ]
  [ ! -s "$SSH_STDIN_LOG" ]
}

@test "unerreichbarer Host: Exit 2, nennt den Host, keine Zustandsaenderung" {
  export STUB_REACH_RC=255
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 2 ]
  _msg | grep -qF 'gpu-metal'
  # Positiv-Anker: die Erreichbarkeitsprobe wurde abgesetzt, danach nichts mehr
  grep -qF 'sudo -n true' "$SSH_ARGV_LOG"
  [ ! -s "$SSH_STDIN_LOG" ]
}
