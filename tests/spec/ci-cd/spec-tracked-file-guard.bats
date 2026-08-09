#!/usr/bin/env bats
# [T002779] Spec-Tests duerfen keine getrackten Dateien des Arbeitsbaums mutieren.
#
# Pruefmodus: command output verification [T002448-M4] — die Tests FUEHREN die
# betroffenen bats-Dateien bzw. das Guard-Skript AUS und messen den Effekt auf
# das Dateisystem (mtime der getrackten Artefakte, Exit-Code des Guards). Kein
# Grep auf die Testquelle: dass dort `MCP_REGISTRY` steht, belegt nicht, dass
# die getrackte Registry waehrend des Laufs unberuehrt bleibt.
#
# Befund (CI-Run 31286855491, PR #3892, Shard 4/4): zwei Tests in
# tests/spec/mcp-gateway/authenticated-http-headers.bats fielen ohne Bezug zum
# PR-Diff um. Ursache sind zwei Tests in tests/spec/mcp-tooling.bats, die
# waehrend des Laufs docs/agent-guide/registry/mcp.yaml bzw.
# scripts/llm/mcp-servers.json beschreiben und danach restaurieren.
# `task test:spec` startet bats mit `-j $(nproc)`; jede parallel laufende Datei,
# die eines dieser Artefakte liest, sieht den manipulierten Zustand.
#
# WARUM mtime und nicht `git status`: beide Tests stellen den Originalinhalt
# selbst wieder her. Nach dem Lauf ist der Arbeitsbaum sauber und der Hash
# identisch — ein Endzustands-Check meldete Erfolg fuer genau den Fehlermodus,
# gegen den geprueft wird. Die mtime ueberlebt die Wiederherstellung, weil `cp`
# ohne `-p` neu stempelt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BATS_BIN="$REPO_ROOT/tests/unit/lib/bats-core/bin/bats"
  GUARD="$REPO_ROOT/scripts/spec-tracked-file-guard.sh"
}

# Schnappschuss aus Pfad, mtime und Groesse fuer die Artefakte, die der
# gemeldete Fall beruehrt.
_stamp() {
  ( cd "$REPO_ROOT" && stat -c '%n %Y %s' \
      docs/agent-guide/registry/mcp.yaml \
      scripts/llm/mcp-servers.json \
      .mcp.json \
      .opencode/opencode.jsonc 2>/dev/null | sort )
}

@test "T002779: mcp-tooling.bats laesst die getrackte MCP-Registry unberuehrt" {
  local before after
  before="$(_stamp)"

  # Positiv-Anker: der Lauf muss ueberhaupt stattfinden und gruen sein. Waere
  # die Datei nicht ausfuehrbar, blieben die mtimes trivialerweise gleich und
  # die Aussage unten waere vakuos wahr.
  run "$BATS_BIN" "$REPO_ROOT/tests/spec/mcp-tooling.bats"
  [ "$status" -eq 0 ]

  after="$(_stamp)"
  [ "$before" = "$after" ]
}

@test "T002779: das Guard-Skript existiert und ist ausfuehrbar" {
  [ -f "$GUARD" ]
  run bash "$GUARD" --help
  [ "$status" -eq 0 ]
}

# Wegwerf-Repo fuer die Guard-Tests. Der Guard bezieht sich auf `git ls-files`
# im cwd; er darf deshalb gegen ein Sandbox-Repo laufen. Diese Tests duerfen den
# echten Arbeitsbaum NICHT anfassen — sie wuerden sonst genau das Verhalten
# zeigen, das sie verbieten, und unter `bats -j` dieselbe Race ausloesen.
_sandbox() {
  local dir="$BATS_TEST_TMPDIR/sandbox"
  mkdir -p "$dir"
  git -C "$dir" init -q
  printf 'original\n' > "$dir/tracked.txt"
  git -C "$dir" add tracked.txt
  git -C "$dir" -c user.email=t@t -c user.name=t commit -qm init
  printf '%s' "$dir"
}

@test "T002779: der Guard meldet eine beruehrte getrackte Datei mit Pfad" {
  local dir; dir="$(_sandbox)"
  local snap="$BATS_TEST_TMPDIR/snap"

  run bash -c "cd '$dir' && bash '$GUARD' snapshot '$snap'"
  [ "$status" -eq 0 ]

  # Genau das Muster aus mcp-tooling.bats: mutieren und restaurieren. Der Inhalt
  # ist danach wieder identisch, nur die mtime verraet den Zugriff.
  sleep 1
  printf 'mutiert\n' > "$dir/tracked.txt"
  printf 'original\n' > "$dir/tracked.txt"

  run bash -c "cd '$dir' && git status --porcelain"
  [ -z "$output" ]   # Belegt: ein git-status-Check waere hier blind.

  run bash -c "cd '$dir' && bash '$GUARD' verify '$snap'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"tracked.txt"* ]]
}

@test "T002779: der Guard bleibt gruen, wenn nichts angefasst wurde" {
  local dir; dir="$(_sandbox)"
  local snap="$BATS_TEST_TMPDIR/snap-clean"

  run bash -c "cd '$dir' && bash '$GUARD' snapshot '$snap'"
  [ "$status" -eq 0 ]

  run bash -c "cd '$dir' && bash '$GUARD' verify '$snap'"
  [ "$status" -eq 0 ]
}

@test "T002779: untracked-Dateien sind kein Verstoss" {
  local dir; dir="$(_sandbox)"
  local snap="$BATS_TEST_TMPDIR/snap-untracked"

  run bash -c "cd '$dir' && bash '$GUARD' snapshot '$snap'"
  [ "$status" -eq 0 ]

  sleep 1
  printf 'scratch\n' > "$dir/scratch.tmp"

  run bash -c "cd '$dir' && bash '$GUARD' verify '$snap'"
  [ "$status" -eq 0 ]
}

@test "T002779: task test:spec ruft den Guard auf" {
  # Querschnittspruefung der Verdrahtung — sie manifestiert sich
  # ausschliesslich in der Taskfile-Konfiguration, deshalb ist grep hier das
  # angemessene Mittel (Ausnahme nach T002448-M4).
  run grep -c 'spec-tracked-file-guard' "$REPO_ROOT/Taskfile.yml"
  [ "$status" -eq 0 ]
  # Beide Tasks — test:spec UND test:spec:changed — muessen den Guard fuehren.
  [ "$output" -ge 2 ]
}
