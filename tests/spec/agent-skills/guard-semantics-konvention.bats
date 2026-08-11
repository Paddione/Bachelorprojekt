#!/usr/bin/env bats
# tests/spec/agent-skills/guard-semantics-konvention.bats
# SSOT: openspec/changes/test-guard-semantics/specs/agent-skills.md  [T003796]
#
# Pruefmodus: MISCHMODUS, im Dateikopf begruendet (T002448-M4).
#
# Fall 1 und 2 sind COMMAND-OUTPUT-VERIFIKATION: sie fuehren grep/awk gegen
# Fixtures aus und messen Exit-Code und Zeilennummern. Sie belegen die Regeln
# aus T003108 (Options-Parsing) und T003104 (Positions-Guard) ausfuehrbar —
# nicht durch Source-Grep auf die Regel, sondern durch ihren Nachweis.
#
# Fall 3 ist der dokumentierte Ausnahmefall (T002448-M4): die Zusicherung
# manifestiert sich ausschliesslich im Text von CLAUDE.md (Konventionsdoku).
# Ein Verhaltenstest ist hier nicht moeglich — die Konvention ist der Text.
# Der Abgleich ist formatfrei (grep -qF, keine Zeilenanker, T002716).
#
# RED-Phase: Fall 3 MUSS fehlschlagen, solange CLAUDE.md die vier Spielarten
# von T002716 nicht nennt. Ist der Test gruen, bevor p1 die Konvention
# erweitert hat, ist das ein Befund am Test, kein "schon erfuellt" (T003548).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLAUDE_MD="$REPO/CLAUDE.md"
}

@test "T003796: grep -qF '--flag' endet mit Exit 2 (Options-Parsing), mit -e mit 0 (Positiv-Anker)" {
  # Negativfall (T003108): '--draft' wird als Option geparst, nicht als
  # Muster — GNU grep endet mit 2 (Werkzeugfehler), NICHT 1 (nicht gefunden).
  # In einer if-Bedingung sind beide ununterscheidbar. Es wird nur der
  # Exit-Code geprueft, nie der Meldungstext (T002716): ugrep und GNU grep
  # liefern beide 2, aber unterschiedlichen Wortlaut.
  run bash -c "printf '%s\n' 'text mit --draft drin' | grep -qF '--draft'"
  [ "$status" -eq 2 ]

  # Positiv-Anker (T002356-M1): mit -e wird dasselbe Muster gefunden.
  # Ohne diesen Anker bestuende der Test auch, wenn grep gar nicht liefe.
  run bash -c "printf '%s\n' 'text mit --draft drin' | grep -qF -e '--draft'"
  [ "$status" -eq 0 ]
}

@test "T003796: bereichsbeschraenkte Suche findet die gemeinte Regel, head -1 die falsche Zeile (Positions-Guard)" {
  # Fixture: der Suchbegriff steht zweimal — unter '## 3.' als unverwandter
  # Zufallstreffer, unter '## 4.' als die gemeinte Regel. Deterministische
  # Zeilennummern: 2 bzw. 4.
  FIXTURE="$BATS_TMPDIR/positions-guard-fixture.md"
  cat > "$FIXTURE" <<'FIX'
## 3.
hier steht dedup nur als Zufallstreffer
## 4.
hier steht die dedup-Regel die gemeint ist
FIX

  # Die gemeinte Stelle (bereichsbeschraenkt ab '## 4.'): findet die Regel.
  run bash -c "awk '/^## 4\\./{seen=1} seen && /dedup/{print NR; exit}' '$FIXTURE'"
  [ "$status" -eq 0 ]
  [ "$output" = "4" ]

  # Die dokumentweite head -1-Suche: liefert die falsche Zeilennummer (2).
  run bash -c "grep -n 'dedup' '$FIXTURE' | head -1"
  [ "$status" -eq 0 ]
  [ "${output%%:*}" = "2" ]
  [ "${output%%:*}" != "4" ]
}

@test "T003796: CLAUDE.md nennt alle vier Spielarten der Konvention (Drift-Schutz)" {
  # Textabgleich — bewusste Ausnahme (T002448-M4): die Konvention existiert
  # nur als Text. Formatfrei geprueft (T002716): inhaltstragende Begriffe
  # statt exaktem Wortlaut, keine Zeilenanker. Keiner der Begriffe beginnt
  # mit '-', Fall 1 (Options-Parsing) greift hier also nicht.
  for term in 'Dokumentposition' 'Options-Parsing' 'Konfiguration statt Laufzeit' 'Prozesslisten-Format'; do
    run bash -c "grep -qF -- '$term' '$CLAUDE_MD'"
    [ "$status" -eq 0 ] || {
      echo "CLAUDE.md nennt die Spielart '$term' nicht (T002716-Erweiterung fehlt)"
      return 1
    }
  done
}
