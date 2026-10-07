#!/usr/bin/env bats
# tests/unit/openclaw-taskfile.bats — Spec llm-local-dev, Requirement „Required Task Declarations" (T900538)
#
# Prüfmodus: Taskfiles per YAML-Parser, .env.example durch Einlesen in einer leeren Shell
# (env -i, set -a), .gitignore über `git check-ignore`. Nur die verbotenen opencode-Muster
# werden per grep -F auf die Datei geprüft, weil sich die Aussage ausschließlich im Dateitext zeigt.

setup() {
  cd "${BATS_TEST_DIRNAME}/../.."
  TF=taskfiles/Taskfile.openclaw.yml
}

@test "Taskfile.openclaw.yml parses as YAML" {
  run python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$TF"
  [ "$status" -eq 0 ]
}

@test "Alle Pflicht-Tasks sind vorhanden" {
  run python3 -c "
import yaml, sys
tasks = yaml.safe_load(open(sys.argv[1]))['tasks']
want = ['backup', 'install', 'configure', 'start', 'status', 'logs', 'restore', 'wipe']
missing = [t for t in want if t not in tasks]
print('missing: ' + ' '.join(missing) if missing else 'ok')
" "$TF"
  [ "$status" -eq 0 ]
  [ "$output" = "ok" ]
}

@test "Das Taskfile verwaltet kein opencode" {
  # Positiv-Anker: die Datei parst und deklariert install (sonst wäre „kein Treffer" vakuos).
  run python3 -c "import yaml,sys; print('install' in yaml.safe_load(open(sys.argv[1]))['tasks'])" "$TF"
  [ "$status" -eq 0 ]
  [ "$output" = "True" ]
  # Verboten ist Installieren, Deinstallieren, Erkennen und Konfigurieren von opencode.
  # Erlaubt bleibt das Lesen des Go-Keys aus ~/.local/share/opencode/auth.json.
  run grep -n -F -e 'npm install -g opencode' -e 'npm uninstall -g opencode' \
    -e 'command -v opencode' -e '.config/opencode' "$TF"
  echo "$output"
  [ "$status" -eq 1 ]
}

@test ".env.example lists all seven variables with empty secrets" {
  run env -i bash -c '
    set -a
    . ./openclaw/.env.example
    for v in OPENCLAW_GATEWAY_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPENCLAW_LOCAL_BASE_URL \
             OPENCODE_GO_API_KEY OPENCLAW_GO_SESSION OPENCLAW_LOG_LEVEL; do
      printf "%s=%s\n" "$v" "${!v-UNSET}"
    done'
  [ "$status" -eq 0 ]
  [ "$output" = "OPENCLAW_GATEWAY_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1919/v1
OPENCODE_GO_API_KEY=
OPENCLAW_GO_SESSION=
OPENCLAW_LOG_LEVEL=info" ]
}

@test "Root Taskfile.yml includes openclaw" {
  run python3 -c "
import yaml
inc = yaml.safe_load(open('Taskfile.yml'))['includes']['openclaw']
print(inc['taskfile'] if isinstance(inc, dict) else inc)
"
  [ "$status" -eq 0 ]
  [ "$output" = "./taskfiles/Taskfile.openclaw.yml" ]
}

@test ".gitignore excludes openclaw/.env" {
  # Positiv-Anker: die Vorlage selbst ist NICHT ignoriert (sonst ignoriert ein Wildcard alles).
  run git check-ignore -q openclaw/.env.example
  [ "$status" -eq 1 ]
  run git check-ignore -q openclaw/.env
  [ "$status" -eq 0 ]
}
