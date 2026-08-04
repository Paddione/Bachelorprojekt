#!/usr/bin/env bats
# tests/spec/agent-skills/plugin-activation.bats — T002651
#
# Ein Plugin, das `.claude/settings.json` aktiviert, das aber maschinenlokal nicht
# installiert ist, laedt nicht — ohne Fehler, ohne Warnung, ohne jedes Signal.
# Genau so war `superpowers@claude-plugins-official` ueber laengere Zeit aktiviert
# und abwesend zugleich. Aktivierung (eingecheckt, Team-Wahrheit) und Installation
# (~/.claude/plugins/installed_plugins.json, Maschinenzustand) sind getrennte
# Zustaende, und nichts prueft ihre Schnittmenge.
#
# Pruefmodus [T002448-M4]: OUTPUT-VERIFIKATION. Jeder Doctor-Test FUEHRT
# scripts/plugin-doctor.sh aus und prueft $status und $output; keiner greppt die
# Implementierung. Moeglich wird das durch die Pfad-Overrides des Skripts — sie
# sind der Grund, warum CI den Guard ueberhaupt pruefen kann, ohne ein echtes
# ~/.claude zu besitzen.
#
# Bewusst KEIN `skip`, wenn ~/.claude fehlt: das waere der fail-open-Pfad, den
# CLAUDE.md am gitleaks-Fall bereits als Fallstrick fuehrt — in CI immer gruen,
# ohne je etwas geprueft zu haben. Die Fixtures ersetzen die Umgebung, statt die
# Pruefung auszusetzen.
#
# Fixture-Namensgebung: Plugin- und Marketplace-Namen sind bewusst so gewaehlt,
# dass sie in keinem Worktree-Pfad vorkommen koennen. Ein unqualifiziertes
# `[[ "$output" == *term* ]]` kann sonst vom eingebetteten $0 des Skripts erfuellt
# werden, wenn der Worktree-Name den Term enthaelt (dokumentierte BATS-Falle).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  DOCTOR="$REPO_ROOT/scripts/plugin-doctor.sh"

  FIX="$BATS_TEST_TMPDIR/fix"
  HOMEDIR="$FIX/claude-home"
  REPO_SETTINGS="$FIX/repo-settings.json"
  mkdir -p "$HOMEDIR/plugins"

  export PLUGIN_DOCTOR_CLAUDE_HOME="$HOMEDIR"
  export PLUGIN_DOCTOR_REPO_SETTINGS="$REPO_SETTINGS"
}

# Schreibt die drei Fixture-Dateien: Repo-Aktivierung, User-Aktivierung, Installation.
_fixture() {
  local repo_enabled="$1" user_enabled="$2" installed="$3"
  printf '{"enabledPlugins": %s}\n' "$repo_enabled" > "$REPO_SETTINGS"
  printf '{"enabledPlugins": %s}\n' "$user_enabled" > "$HOMEDIR/settings.json"
  printf '%s\n' "$installed" > "$HOMEDIR/plugins/installed_plugins.json"
}

@test "T002651: aktiviertes, nicht installiertes Plugin wird als Befund gemeldet" {
  _fixture \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{}'

  run bash "$DOCTOR"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'zeta-fixture-plugin'
}

@test "T002651: im Repo aktiviert, im User-Scope deaktiviert = Faehigkeitsverlust" {
  _fixture \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{"zeta-fixture-plugin@fixture-market": false}' \
    '{"zeta-fixture-plugin@fixture-market": {"version": "1.0.0"}}'

  run bash "$DOCTOR"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'zeta-fixture-plugin'
}

@test "T002651: im Repo aktiviert, im User-Scope gar nicht gefuehrt = Faehigkeitsverlust" {
  _fixture \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{}' \
    '{"zeta-fixture-plugin@fixture-market": {"version": "1.0.0"}}'

  run bash "$DOCTOR"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'zeta-fixture-plugin'
}

@test "T002651: zusaetzliche lokale Plugins sind kein Befund" {
  # Die Gegenrichtung kostet keine Faehigkeit. Wuerde sie warnen, traefe das jedes
  # probeweise installierte Plugin — und ein Guard, der bei harmlosen Zustaenden
  # anschlaegt, wird weggeklickt und schuetzt dann auch im Schadensfall nicht mehr.
  _fixture \
    '{}' \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{"zeta-fixture-plugin@fixture-market": {"version": "1.0.0"}}'

  run bash "$DOCTOR"
  [ "$status" -eq 0 ]
}

@test "T002651: sauberer Zustand meldet keinen Befund" {
  _fixture \
    '{"zeta-fixture-plugin@fixture-market": true, "andere@fixture-market": false}' \
    '{"zeta-fixture-plugin@fixture-market": true, "andere@fixture-market": false}' \
    '{"zeta-fixture-plugin@fixture-market": {"version": "1.0.0"}}'

  run bash "$DOCTOR"
  [ "$status" -eq 0 ]
}

@test "T002651: fehlendes Claude-Home ist kein Fehlschlag" {
  # Fremde Maschine oder CI-Runner: die maschinenlokale Pruefung hat nichts zu
  # sagen. Ein Rot waere hier eine Falschaussage, kein Schutz.
  printf '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n' > "$REPO_SETTINGS"
  export PLUGIN_DOCTOR_CLAUDE_HOME="$BATS_TEST_TMPDIR/gibt-es-nicht"

  run bash "$DOCTOR"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qiE 'nicht anwendbar|not applicable|kein Claude-Home'
}

@test "T002651: kaputtes JSON ist Exit 2, nicht Exit 0 oder 1" {
  # Getrennt vom Befund-Exit, damit der Hook 'kaputt' nicht als 'sauber' liest.
  _fixture '{"zeta-fixture-plugin@fixture-market": true}' '{}' '{}'
  printf '{ das ist kein json\n' > "$HOMEDIR/plugins/installed_plugins.json"

  run bash "$DOCTOR"
  [ "$status" -eq 2 ]
}

@test "T002651: --json liefert maschinenlesbare Befunde" {
  _fixture \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{"zeta-fixture-plugin@fixture-market": true}' \
    '{}'

  run bash "$DOCTOR" --json
  [ "$status" -eq 1 ]
  echo "$output" | python3 -c "import sys, json; json.load(sys.stdin)"
}

# ── Repo-Fakten: in CI ohne jedes ~/.claude pruefbar, fail-closed ──────────────

@test "T002651: jeder enabledPlugins-Key hat die Form <plugin>@<marketplace>" {
  cd "$REPO_ROOT"
  run python3 -c "
import json, re, sys
d = json.load(open('.claude/settings.json')).get('enabledPlugins', {})
if len(d) < 1:
    print('ANCHOR_FAIL: enabledPlugins ist leer')
    sys.exit(1)
bad = [k for k in d if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*', k)]
if bad:
    print('MALFORMED: ' + ' '.join(bad))
    sys.exit(1)
print('OK: %d keys' % len(d))
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

@test "T002651: kein enabledPlugins-Key erscheint doppelt" {
  cd "$REPO_ROOT"
  # json.load dedupliziert still — deshalb auf der Rohdatei zaehlen.
  run python3 -c "
import json, re, sys, collections
raw = open('.claude/settings.json').read()
d = json.loads(raw).get('enabledPlugins', {})
if not d:
    print('ANCHOR_FAIL: enabledPlugins ist leer')
    sys.exit(1)
block = re.search(r'\"enabledPlugins\"\s*:\s*\{(.*?)\n\s*\}', raw, re.S)
if not block:
    print('ANCHOR_FAIL: enabledPlugins-Block nicht gefunden')
    sys.exit(1)
keys = re.findall(r'\"([^\"]+)\"\s*:', block.group(1))
dupes = [k for k, n in collections.Counter(keys).items() if n > 1]
if dupes:
    print('DUPLICATE: ' + ' '.join(dupes))
    sys.exit(1)
print('OK: %d keys' % len(keys))
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

@test "T002651: jedes Marketplace-Segment ist ein bekanntes Marketplace" {
  cd "$REPO_ROOT"
  run python3 -c "
import json, sys
KNOWN = {'claude-plugins-official', 'superpowers-marketplace', 'braintrust-claude-plugin'}
d = json.load(open('.claude/settings.json')).get('enabledPlugins', {})
if not d:
    print('ANCHOR_FAIL: enabledPlugins ist leer')
    sys.exit(1)
unknown = sorted({k.split('@', 1)[1] for k in d if '@' in k} - KNOWN)
if unknown:
    print('UNKNOWN_MARKETPLACE: ' + ' '.join(unknown))
    sys.exit(1)
print('OK: %d keys' % len(d))
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}
