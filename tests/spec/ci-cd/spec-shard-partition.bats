#!/usr/bin/env bats
#
# Guards fuer das Sharding der Spec-BATS-Suite [T002500].
#
# Pruefmodus (Konvention T002448-M4): GEMISCHT, und zwar bewusst.
#   - Die Tests zu scripts/spec-shard.sh pruefen echtes Laufzeitverhalten
#     (`run`, $output, $status) — das Skript hat beobachtbaren Output.
#   - Die Tests zur ci.yml-Struktur parsen die Workflow-Datei. Das ist der
#     zulaessige Ausnahmefall: die Aussage "der Required-Check-Name bleibt
#     erhalten" und "Step A steht vor Step B" manifestiert sich ausschliesslich
#     im Konfigurationstext; es gibt kein Kommando, dessen Ergebnis man messen
#     koennte, ohne GitHub Actions selbst laufen zu lassen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SHARD_SH="$REPO_ROOT/scripts/spec-shard.sh"
  CI_YML="$REPO_ROOT/.github/workflows/ci.yml"
}

_all_spec_files() {
  cd "$REPO_ROOT" && find tests/spec -name '*.bats' -type f | LC_ALL=C sort
}

@test "T002500: spec-shard.sh existiert und ist ausfuehrbar" {
  [ -f "$SHARD_SH" ]
  [ -x "$SHARD_SH" ]
}

@test "T002500: --verify meldet eine restlose, ueberschneidungsfreie Partition" {
  run bash -c "cd '$REPO_ROOT' && find tests/spec -name '*.bats' -type f | bash '$SHARD_SH' --verify --of 4"
  [ "$status" -eq 0 ]
  # Auf die konkrete Zeile einschraenken statt unqualifiziert im Gesamtoutput
  # zu suchen — der Gesamtoutput enthaelt Pfade, die den Worktree-Namen tragen.
  echo "$output" | grep -q '^spec-shard: OK'
}

@test "T002500: die Vereinigung aller Shards ist exakt die Eingabemenge" {
  input="$(_all_spec_files)"
  [ -n "$input" ]
  union=$(
    for s in 1 2 3 4; do
      printf '%s\n' "$input" | bash "$SHARD_SH" --shard "$s" --of 4
    done | LC_ALL=C sort
  )
  # Positiv-Anker zuerst (T002356-M1): die Union darf nicht leer sein, sonst
  # waere die folgende Gleichheit auch bei einem voellig kaputten Skript erfuellt,
  # falls die Eingabe je leer liefe.
  [ "$(printf '%s\n' "$union" | grep -c .)" -gt 100 ]
  [ "$(printf '%s\n' "$union")" = "$(printf '%s\n' "$input")" ]
}

@test "T002500: kein Shard enthaelt eine Datei doppelt oder aus einem anderen Shard" {
  input="$(_all_spec_files)"
  union_lines=$(
    for s in 1 2 3 4; do
      printf '%s\n' "$input" | bash "$SHARD_SH" --shard "$s" --of 4
    done | grep -c .
  )
  uniq_lines=$(
    for s in 1 2 3 4; do
      printf '%s\n' "$input" | bash "$SHARD_SH" --shard "$s" --of 4
    done | LC_ALL=C sort -u | grep -c .
  )
  [ "$union_lines" -gt 100 ]
  [ "$union_lines" -eq "$uniq_lines" ]
}

@test "T002500: die Partition ist deterministisch (zwei Laeufe, identisches Ergebnis)" {
  input="$(_all_spec_files)"
  a=$(printf '%s\n' "$input" | bash "$SHARD_SH" --shard 2 --of 4)
  b=$(printf '%s\n' "$input" | bash "$SHARD_SH" --shard 2 --of 4)
  [ -n "$a" ]
  [ "$a" = "$b" ]
}

@test "T002500: unsortierte Eingabe ergibt dieselbe Partition wie sortierte" {
  # find liefert Verzeichniseintraege in Inode-Reihenfolge; die kann zwischen
  # zwei Checkouts derselben SHA abweichen. Waere die Partition davon abhaengig,
  # liefen Dateien doppelt oder gar nicht — und der Lauf saehe gruen aus.
  input="$(_all_spec_files)"
  sorted=$(printf '%s\n' "$input" | bash "$SHARD_SH" --shard 3 --of 4)
  shuffled=$(printf '%s\n' "$input" | LC_ALL=C sort -r | bash "$SHARD_SH" --shard 3 --of 4)
  [ -n "$sorted" ]
  [ "$sorted" = "$shuffled" ]
}

@test "T002500: die Shards sind nach gemessener Laufzeit balanciert (schwerster <= 1.5x leichtester) [T003026]" {
  # Gewichtet wird seit T003026 nach gemessener Laufzeit aus
  # tests/spec/.spec-runtime.tsv, nicht nach @test-Anzahl. Die Anzahl ist ein
  # unzuverlaessiger Proxy: wenige lange Tests koennen mehr Zeit kosten als viele
  # kurze. Der Vorgaenger dieses Tests mass die Anzahl und wurde durch die
  # Umstellung rot, obwohl die Verteilung sich VERBESSERT hatte — gemessen am
  # 2026-08-09: Laufzeit-Balance 100 %, @test-Anzahl 652..1049 (Faktor 1.61).
  # Ein Guard, der die ersetzte Regel weiter festschreibt, meldet einen Defekt,
  # den es nicht gibt.
  #
  # Geprueft wird der von --verify SELBST gemeldete Wert, nicht eine im Test
  # nachgebaute Gewichtung: eine zweite Implementierung derselben Rechnung wuerde
  # bei der naechsten Aenderung erneut auseinanderlaufen. Gegriffen wird ohne
  # Zeilenanker (T002716), damit eine umformulierte Meldung den Test nicht kippt.
  run bash -c "cd '$REPO_ROOT' && find tests/spec -name '*.bats' -type f | bash '$SHARD_SH' --verify --of 4"
  [ "$status" -eq 0 ] || { echo "--verify schlug fehl (status=$status): $output"; false; }

  # Positiv-Anker 1: es wurde ueberhaupt Gewicht verteilt. Ohne diese Pruefung
  # liefe ein Lauf mit lauter Nullgewichten als perfekt balanciert durch.
  local shard1_weight
  shard1_weight=$(printf '%s\n' "$output" | grep -F 'shard 1:' | grep -oE 'Gewicht[[:space:]]+[0-9.]+' | grep -oE '[0-9.]+$')
  [ -n "$shard1_weight" ] \
    || { echo "--verify meldet kein Shard-Gewicht; Output: $output"; false; }
  awk -v w="$shard1_weight" 'BEGIN { exit !(w + 0 > 0) }' \
    || { echo "Shard 1 traegt Gewicht $shard1_weight, erwartet > 0"; false; }

  # Positiv-Anker 2: die Balance-Zeile existiert. Fehlt sie, waere $balance leer
  # und der Vergleich unten wuerde nicht messen, sondern nur nicht scheitern.
  local balance
  balance=$(printf '%s\n' "$output" | grep -F 'Balance' | grep -oE '[0-9]+' | head -1)
  [ -n "$balance" ] \
    || { echo "--verify meldet keine Balance-Zeile; Output: $output"; false; }

  # Zusicherung: min/max >= 67 % ist gleichbedeutend mit schwerster <= 1.5x leichtester.
  [ "$balance" -ge 67 ] \
    || { echo "Laufzeit-Balance nur ${balance}% (min/max), erwartet >= 67%"; false; }
}

@test "T002500: ungueltige --shard/--of-Werte werden abgewiesen" {
  run bash -c "echo tests/spec/ci-cd.bats | bash '$SHARD_SH' --shard 5 --of 4"
  [ "$status" -ne 0 ]
  run bash -c "echo tests/spec/ci-cd.bats | bash '$SHARD_SH' --shard 0 --of 4"
  [ "$status" -ne 0 ]
  run bash -c "echo tests/spec/ci-cd.bats | bash '$SHARD_SH' --shard 1 --of 0"
  [ "$status" -ne 0 ]
  # Positiv-Anker (T002356-M1): der gueltige Fall MUSS durchlaufen, sonst waeren
  # die drei Ablehnungen oben auch bei einem Skript erfuellt, das immer scheitert.
  run bash -c "echo tests/spec/ci-cd.bats | bash '$SHARD_SH' --shard 1 --of 1"
  [ "$status" -eq 0 ]
}

@test "T002500: ci.yml behaelt den Required-Check-Namen 'Factory + OpenSpec + Guards'" {
  # Genau dieser String haengt in der Branch Protection von main. Eine nackte
  # Matrix haette ihn in "… (1)".."… (4)" umbenannt und jeden PR blockiert.
  run python3 -c "
import yaml, sys
wf = yaml.safe_load(open('$CI_YML'))
names = [j.get('name') for j in wf['jobs'].values()]
assert 'Factory + OpenSpec + Guards' in names, 'Required-Check-Name fehlt: %r' % (names,)
agg = wf['jobs']['test-factory']
assert agg['name'] == 'Factory + OpenSpec + Guards', agg['name']
assert 'strategy' not in agg, 'Aggregator darf keine Matrix haben (wuerde den Namen suffixen)'
print('OK')
"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'OK'
}

@test "T002500: der Aggregator ist fail-closed (always() + needs + Result-Pruefung)" {
  # Ohne always() wuerde er bei fehlgeschlagenen needs UEBERSPRUNGEN — und ein
  # uebersprungener Required Check zaehlt in der Branch Protection als bestanden.
  run python3 -c "
import yaml
wf = yaml.safe_load(open('$CI_YML'))
agg = wf['jobs']['test-factory']
cond = str(agg.get('if', ''))
assert 'always()' in cond, 'if fehlt always(): %r' % cond
needs = agg['needs']
assert 'test-factory-shard' in needs and 'test-factory-openspec' in needs, needs
body = ' '.join(str(s.get('run', '')) for s in agg['steps'])
assert 'exit 1' in body, 'Aggregator scheitert nie'
for var in ('OPENSPEC_RESULT', 'SHARDS_RESULT'):
    assert var in body, 'Result %s wird nicht geprueft' % var
print('OK')
"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'OK'
}

@test "T002500: PyYAML wird VOR der Spec-BATS-Suite installiert" {
  # tests/spec/ci-cd.bats macht `import yaml`. Bis T002500 stand der Install-Step
  # dahinter und trug nichts bei — dass es trotzdem lief, lag allein an der
  # Vorinstallation auf ubuntu-latest.
  run python3 -c "
import yaml
wf = yaml.safe_load(open('$CI_YML'))
steps = wf['jobs']['test-factory-shard']['steps']
names = [str(s.get('name', '')) for s in steps]
pyyaml = next(i for i, n in enumerate(names) if 'PyYAML' in n)
suite  = next(i for i, n in enumerate(names) if 'Spec BATS suite' in n)
assert pyyaml < suite, 'PyYAML (%d) steht hinter der Suite (%d)' % (pyyaml, suite)
print('OK')
"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'OK'
}

@test "T002500: der Shard-Job reicht SPEC_SHARD/SPEC_SHARDS passend zur Matrix durch" {
  run python3 -c "
import yaml
wf = yaml.safe_load(open('$CI_YML'))
job = wf['jobs']['test-factory-shard']
shards = job['strategy']['matrix']['shard']
assert len(shards) > 1, shards
assert job['strategy'].get('fail-fast') is False, 'fail-fast muss false sein'
env = job['env']
assert int(env['SPEC_SHARDS']) == len(shards), (env['SPEC_SHARDS'], shards)
assert 'matrix.shard' in str(env['SPEC_SHARD']), env['SPEC_SHARD']
print('OK')
"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'OK'
}
