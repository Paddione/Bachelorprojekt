#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Spec: agent-skills.md
# Feature: T900024 — worktree-write-guard in ALLEN Harnesses registriert
#
# WARUM DIESER GUARD:
# `scripts/hooks/worktree-write-guard.sh` ist harness-neutral, aber jede Harness
# muss ihn selbst aufrufen. Registriert war er vor T900024 nur in
# `.claude/settings.json`. Ein Guard, den nur eine von mehreren Harnesses
# ausfuehrt, schuetzt nicht — es reicht, dass die zweite Session unter opencode
# laeuft. Der Test prueft die Registrierung deshalb pro Harness und schlaegt
# auch dann fehl, wenn eine NEUE Harness-Konfiguration hinzukommt, ohne den
# Guard zu registrieren.

setup() {
  REPO_ROOT="$(pwd)"
  GUARD_REL="scripts/hooks/worktree-write-guard.sh"
}

# Gibt die in einer Claude-Code-kompatiblen hooks-Konfiguration unter
# PreToolUse registrierten Kommandos aus — echtes JSON-Parsing, damit eine
# kaputte Konfiguration hier auffliegt und nicht erst zur Laufzeit.
_pretooluse_commands() {  # <json-datei>
  python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    cfg = json.load(fh)
hooks = cfg.get("hooks", cfg)
for entry in hooks.get("PreToolUse", []):
    for hook in entry.get("hooks", []):
        print(entry.get("matcher", ""), "::", hook.get("command", ""))
PY
}

@test "Guard-Skript existiert unter dem geprueften Pfad" {
  run test -f "$REPO_ROOT/$GUARD_REL"
  [ "$status" -eq 0 ]
}

@test "Claude Code: worktree-write-guard als PreToolUse auf Write|Edit registriert" {
  run _pretooluse_commands "$REPO_ROOT/.claude/settings.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$GUARD_REL"* ]]
  [[ "$output" == *"Write"* ]]
  [[ "$output" == *"Edit"* ]]
}

@test "agy: worktree-write-guard als PreToolUse auf Write|Edit registriert" {
  run _pretooluse_commands "$REPO_ROOT/.agy/hooks.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$GUARD_REL"* ]]
  [[ "$output" == *"Write"* ]]
  [[ "$output" == *"Edit"* ]]
}

@test "opencode: Plugin ruft den Guard ueber tool.execute.before auf" {
  local plugin="$REPO_ROOT/.opencode/plugin/worktree-write-guard.ts"
  run test -f "$plugin"
  [ "$status" -eq 0 ]

  run grep -c "tool.execute.before" "$plugin"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c "$GUARD_REL" "$plugin"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "Codex: hooks.json registriert den Guard, sobald die Datei existiert" {
  # Codex hat in diesem Repo (Stand T900024) KEINE Konfiguration. Der Test
  # bleibt trotzdem stehen: sobald jemand `.codex/hooks.json` anlegt, muss der
  # Guard darin stehen — genau der stille Durchfall, den dieser Guard
  # verhindern soll.
  if [ ! -f "$REPO_ROOT/.codex/hooks.json" ]; then
    skip "keine .codex/hooks.json im Repo"
  fi
  run _pretooluse_commands "$REPO_ROOT/.codex/hooks.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$GUARD_REL"* ]]
}

@test "keine weitere Harness-hooks.json ohne Guard-Registrierung" {
  # Vollzaehligkeit statt Aufzaehlung: jede getrackte `hooks.json` unterhalb
  # eines Harness-Punktverzeichnisses muss den Guard nennen. Kommt eine neue
  # Harness dazu, faellt sie hier auf statt still durchzurutschen.
  local missing="" f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    grep -q "$GUARD_REL" "$REPO_ROOT/$f" || missing="$missing $f"
  done < <(cd "$REPO_ROOT" && git ls-files '.*/hooks.json')

  [ -z "$missing" ] || {
    echo "hooks.json ohne worktree-write-guard-Registrierung:$missing"
    false
  }
}
