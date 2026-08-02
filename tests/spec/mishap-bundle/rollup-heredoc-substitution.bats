#!/usr/bin/env bats
# tests/spec/mishap-bundle/rollup-heredoc-substitution.bats — T002566
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Die Kommandosubstitutionen aus
# scripts/factory/mishap-rollup.sh werden tatsaechlich AUSGEFUEHRT und ihr
# Status/Output geprueft — es wird nicht der Quelltext nach einem Muster gegrept.
#
# Hintergrund: mishap-rollup.sh brach am 2026-08-02 zur Laufzeit ab mit
#   "command substitution: line 173: syntax error near unexpected token 'newline'"
# Ursache war $(date -u '+%Y-%m-%d %H:%M UTC)' — das schliessende Anfuehrungs-
# zeichen stand AUSSERHALB der Substitution statt innerhalb.
#
# Warum es dieser Test sein muss und `bash -n` NICHT genuegt: der Ausdruck steht
# in einem unquoted Heredoc und wird erst zur Laufzeit expandiert. Ein statischer
# Syntax-Check sieht ihn strukturell nicht — `bash -n` meldete die Datei als
# fehlerfrei, waehrend jeder Lauf scheiterte. Der Rollup-Pfad war dadurch seit
# dem 2026-07-31 unbemerkt tot: Batches liefen weiter ein, es kam nur nichts mehr
# heraus.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/factory/mishap-rollup.sh"
}

@test "T002566: mishap-rollup.sh existiert und ist ausfuehrbar" {
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
}

@test "T002566: jede date-Kommandosubstitution laesst sich fehlerfrei ausfuehren" {
  local -a exprs
  mapfile -t exprs < <(grep -o '\$(date[^)]*)' "$SCRIPT")

  # Positiv-Anker [T002356-M1]: Ohne mindestens einen gefundenen Ausdruck
  # prueft die Schleife unten nichts und der Test bestuende vakuos.
  [ "${#exprs[@]}" -ge 1 ]

  local e
  for e in "${exprs[@]}"; do
    # Ausfuehren, nicht inspizieren. Ein unbalanciertes Quote innerhalb der
    # Substitution laesst bash hier mit Syntaxfehler abbrechen — genau der
    # Fehler, den `bash -n` auf der Gesamtdatei nicht sehen kann.
    run bash -c "printf '%s' $e"
    [ "$status" -eq 0 ]
    [ -n "$output" ]
  done
}

@test "T002566: bash -n allein wuerde den Fehler NICHT fangen (Dokumentation der Fehlerklasse)" {
  # Die Gesamtdatei ist statisch gueltig — auch in der defekten Fassung war sie
  # das. Dieser Test haelt fest, warum der Test oben nicht durch `bash -n`
  # ersetzt werden darf: er ist gruen, ohne etwas ueber die Heredoc-Expansion
  # auszusagen.
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]

  # Positiv-Anker: es MUSS ueberhaupt ein unquoted Heredoc mit Substitution
  # geben, sonst beschreibt dieser Test eine Fehlerklasse, die es hier nicht
  # gibt, und die Begruendung oben liefe ins Leere.
  run grep -c 'cat <<PLANEOF' "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
