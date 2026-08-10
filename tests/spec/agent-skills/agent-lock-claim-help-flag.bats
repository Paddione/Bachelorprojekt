#!/usr/bin/env bats
# tests/spec/agent-skills/agent-lock-claim-help-flag.bats
# SSOT: openspec/changes/agent-lock-claim-help/specs/agent-skills.md  [T003107]
#
# Pruefmodus: Output-Verifikation (T002448-M4) — jeder Test FUEHRT
# scripts/agent-lock.sh AUS und misst Exit-Code plus den Zustand des
# Lock-Verzeichnisses. Kein Source-Grep.
#
# Die Zusicherung haengt an der SEMANTIK (Lock-Datei entsteht / entsteht nicht),
# nicht am Wortlaut der Hilfeausgabe (T002716) — geprueft wird lediglich, DASS
# ueberhaupt eine Optionszeile ausgegeben wird, nicht welche Formulierung.
#
# RED-Phase: beide Tests MUESSEN vor dem Fix fehlschlagen. Heute nimmt
# cmd_claim `--help` als Scope-Namen entgegen (`SCOPE="$1"`) und legt
# `--help__.json` an — ein Muell-Lock, den `reap` nie wieder entfernt.
#
# Isolation: strikt ueber AGENT_LOCK_DIR auf ein Temp-Verzeichnis. Ein Lauf
# gegen das echte .git/agent-locks/ wuerde die laufende Factory sabotieren.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  # Ambient-SID der Harness entfernen, damit die Session-Identitaet dieses
  # Tests deterministisch ist (Muster aus agent-lock-claim-persist.bats).
  unset CLAUDE_CODE_SESSION_ID
  unset AGENT_LOCK_SID
  export CLAUDE_SESSION_ID="claude-t003107-help-suite"
}

teardown() {
  [ -n "${AGENT_LOCK_DIR:-}" ] && rm -rf "$AGENT_LOCK_DIR"
  return 0
}

# Zaehlt die Lock-Dateien im isolierten Verzeichnis. Nur *.json sind Locks;
# .registry.lock und .last-fetch sind Verwaltungsdateien.
_lock_count() {
  find "$AGENT_LOCK_DIR" -maxdepth 1 -name '*.json' -type f | wc -l | tr -d ' '
}

@test "T003107: claim --help gibt Hilfe aus und legt keinen Lock an (Positiv-Anker: regulaerer claim legt einen an)" {
  # ── Positiv-Anker zuerst (T002356-M1) ────────────────────────────────────
  # Ohne ihn bestuende die Negativ-Aussage unten vakuos, sobald `claim` aus
  # irgendeinem anderen Grund gar nichts mehr schreibt.
  run bash "$LOCK" claim ticket T0031070 --label t003107-anchor
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T0031070.json" ]
  [ "$(_lock_count)" -eq 1 ]

  # ── Die eigentliche Zusicherung ──────────────────────────────────────────
  run bash "$LOCK" claim --help
  [ "$status" -eq 0 ]
  # KEINE zusaetzliche Lock-Datei. Der Anker-Lock von oben bleibt der einzige;
  # insbesondere entsteht kein Lock mit scope='--help'.
  [ ! -e "$AGENT_LOCK_DIR/--help__.json" ]
  [ "$(_lock_count)" -eq 1 ]
  # Es wird ueberhaupt eine Optionsliste ausgegeben — formatfrei geprueft:
  # irgendeine Zeile nennt ein Langflag. Kein Zeilenanker, kein Wortlaut.
  [ -n "$output" ]
  printf '%s\n' "$output" | grep -qE -- '--[a-z][a-z-]+'
}

@test "T003107: claim weist einen leeren oder mit '-' beginnenden Scope als Eingabefehler zurueck" {
  # Positiv-Anker (T002356-M1): ein gueltiger Scope laeuft durch.
  run bash "$LOCK" claim ticket T0031071 --label t003107-anchor2
  [ "$status" -eq 0 ]
  [ "$(_lock_count)" -eq 1 ]

  # Leerer Scope: Eingabefehler, kein Lock.
  run bash "$LOCK" claim "" T0031072
  [ "$status" -ne 0 ]
  [ "$(_lock_count)" -eq 1 ]

  # Scope, der wie ein Flag aussieht: Eingabefehler, kein Lock.
  run bash "$LOCK" claim --bogus-flag
  [ "$status" -ne 0 ]
  [ ! -e "$AGENT_LOCK_DIR/--bogus-flag__.json" ]
  [ "$(_lock_count)" -eq 1 ]
}
