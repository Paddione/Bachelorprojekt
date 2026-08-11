#!/usr/bin/env bats
# tests/spec/software-factory/opencode-exec-binary-resolution.bats
# [T003275] opencode-exec.sh muss das opencode-Binary selbst aufloesen, statt
# 127 durchzureichen, wenn systemd-PATH das npm-global-Bin-Verzeichnis nicht kennt.
#
# Pruefmodus: Output-Verifikation (T002448-M4) — das Skript wird AUSGEFUEHRT.
# Semantik statt Darstellung (T002716): Exit-Codes + Stub-Reichweite, kein Ausgabe-Grep.
# Negativfall traegt Positiv-Anker (T002356-M1). Der Orchestrator wird gestubbt —
# kein echter opencode-Aufruf, kein Modell, kein Netz.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"

  # Wegwerf-Worktree als LAUNCH_DIR.
  LAUNCH="$BATS_TEST_TMPDIR/launch"
  mkdir -p "$LAUNCH"
  git -C "$LAUNCH" init -q -b main
  git -C "$LAUNCH" config user.email t@example.invalid
  git -C "$LAUNCH" config user.name Test
  echo base > "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "base"

  # Stub-Verzeichnis + registriert im opencode-Stub.
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"

  # phase_event offline (schreibt sonst in die Ticket-DB; `|| true` genuegt nicht
  # fuer eine saubere Messung).
  export TICKET_OFFLINE=1
}

_stub_opencode() { # <dir>  legt einen opencode-Stub an, der einen Commit erzeugt und 0 endet
  local dir="$1"
  mkdir -p "$dir"
  cat > "$dir/opencode" <<'EOF'
#!/usr/bin/env bash
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implemented [T003275]"
exit 0
EOF
  chmod +x "$dir/opencode"
}

@test "T003275 Negativ: Binary fehlt ueberall -> Exit != 0 und != 127 mit Diagnose" {
  # Restriktiver PATH ohne opencode; npm-global-Fallback wird im Test neutralisiert.
  run env PATH="/usr/bin:/bin" HOME="$BATS_TEST_TMPDIR/empty-home" \
    bash "$EXEC" T009275 "$LAUNCH" main openspec/changes/x/tasks.md
  [[ "$status" -ne 0 ]]
  [[ "$status" -ne 127 ]]
  [[ "$output" == *"opencode"* ]]
}

@test "T003275 npm-global-Fallback: Binary in \$HOME/.npm-global/bin -> Lauf erreicht Stub" {
  local npmbin="$BATS_TEST_TMPDIR/home/.npm-global/bin"
  mkdir -p "$npmbin"
  # Andere Kommandos, die das Skript ruft (jq, git, ticket.sh) kommen weiter aus dem
  # System-PATH; der opencode-Stub liegt nur im npm-global-Fallback.
  cat > "$npmbin/opencode" <<'EOF'
#!/usr/bin/env bash
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implemented [T003275]"
exit 0
EOF
  chmod +x "$npmbin/opencode"

  run env PATH="/usr/bin:/bin" HOME="$BATS_TEST_TMPDIR/home" \
    bash "$EXEC" T009275 "$LAUNCH" main openspec/changes/x/tasks.md

  [[ "$status" -eq 0 ]]
  git -C "$LAUNCH" rev-parse HEAD >/dev/null 2>&1
  # Der Stub wurde erreicht: es gibt einen zweiten Commit gegenueber base.
  [[ "$(git -C "$LAUNCH" rev-list --count HEAD)" -eq 2 ]]
}

@test "T003275 Positiv-Anker: Binary im PATH -> regulaerer Pfad erreicht Stub" {
  _stub_opencode "$STUB_BIN"
  run bash "$EXEC" T009275 "$LAUNCH" main openspec/changes/x/tasks.md
  [[ "$status" -eq 0 ]]
  [[ "$(git -C "$LAUNCH" rev-list --count HEAD)" -eq 2 ]]
}
