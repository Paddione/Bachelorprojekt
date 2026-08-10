#!/usr/bin/env bats
# Guard: die Diagnose fuer einen abgelehnten Commit-Scope nennt die Quelle der
# Wahrheit und den Weg, die gueltigen Scopes aufzulisten [T003139].
#
# Pruefmodus: Output-Verifikation (T002448-M4). Jeder Test RUFT
# `scripts/validate-commit-msg.sh message <datei>` auf und prueft dessen
# Ausgabe/Exit-Code — kein grep auf den Skript-Quelltext.
#
# Warum kein temporaeres Repo: der `message`-Modus liest eine Textdatei und
# erzeugt KEINEN Commit; er kann den Haupt-Checkout nicht veraendern. Die
# Message-Dateien liegen in `$BATS_TEST_TMPDIR`, das Repo bleibt unberuehrt.
# Ein kopiertes Skript zu testen waere schlechter: der Guard soll das reale
# Artefakt pruefen, nicht eine driftende Kopie.
#
# Semantik statt Darstellung (T002716): geprueft wird, DASS die Quelle
# (`commitlint.config.cjs`) und der Auflistungsbefehl (`scopes`) im Text
# vorkommen — per `grep -qF` ohne Zeilenanker, ohne festen Wortlaut der
# Meldung und ohne Annahme ueber die Reihenfolge der Hinweiszeilen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  VALIDATOR="$REPO_ROOT/scripts/validate-commit-msg.sh"
  [ -x "$VALIDATOR" ] || [ -f "$VALIDATOR" ] || {
    echo "validator fehlt: $VALIDATOR" >&2
    return 1
  }
}

# Schreibt $1 als Subject in eine temporaere Datei und validiert sie.
run_subject() {
  local subject="$1"
  local msg="$BATS_TEST_TMPDIR/msg.txt"
  printf '%s\n' "$subject" >"$msg"
  run bash "$VALIDATOR" message "$msg"
}

@test "T003139 (Positiv-Anker): ein gueltiger Scope wird weiterhin akzeptiert" {
  # Ohne diesen Anker bestuenden die Negativ-Aussagen vakuos: ein Hook, der
  # gar nichts mehr prueft, wuerde jede Zusicherung ueber Ablehnungen
  # trivialerweise erfuellen.
  run_subject "chore(plans): archive a merged change [T003139]"
  [ "$status" -eq 0 ] || {
    echo "gueltiger Scope 'plans' wurde abgelehnt (exit $status):" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T003139 (Positiv-Anker): ein wirklich ungueltiger Scope wird weiterhin abgelehnt" {
  # Der Gegenpol zum Anker oben: die Loesung darf nicht darin bestehen, die
  # Scope-Pruefung aufzuweichen. 'zzzunbekannt' ist in keiner Liste,
  # in keiner Alias-Map und trifft kein dynamisches Muster.
  run_subject "chore(zzzunbekannt): irgendwas [T003139]"
  [ "$status" -ne 0 ] || {
    echo "ungueltiger Scope 'zzzunbekannt' wurde akzeptiert — Pruefung aufgeweicht" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T003139: die Ablehnung nennt die Datei, in der die Scopes gepflegt werden" {
  run_subject "chore(openspec): 54 gemergte Changes archivieren [T003139]"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'commitlint.config.cjs' || {
    echo "Diagnose nennt die SSOT-Datei nicht:" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T003139: die Ablehnung nennt den Befehl, der alle gueltigen Scopes auflistet" {
  run_subject "chore(openspec): 54 gemergte Changes archivieren [T003139]"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'validate-commit-msg.sh scopes' || {
    echo "Diagnose nennt den Auflistungsbefehl nicht:" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T003139: der Hinweis gilt fuer jeden abgelehnten Scope, nicht nur fuer 'openspec'" {
  # Die eigentliche Begruendung der Wahl 'besser erklaeren statt Liste
  # aufweichen': der Zusatz muss auch dort erscheinen, wo es keinen Alias
  # gibt und suggest_scope nichts findet.
  run_subject "chore(zzzunbekannt): irgendwas [T003139]"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'commitlint.config.cjs' || {
    echo "Diagnose ohne Alias-Treffer nennt die SSOT-Datei nicht:" >&2
    echo "$output" >&2
    return 1
  }
  echo "$output" | grep -qF 'validate-commit-msg.sh scopes' || {
    echo "Diagnose ohne Alias-Treffer nennt den Auflistungsbefehl nicht:" >&2
    echo "$output" >&2
    return 1
  }
}

@test "T003139 (Regression): die bestehende Alias-Auskunft bleibt erhalten" {
  # Der Zusatz darf die vorhandene, praezisere Zeile aus T002328 nicht
  # verdraengen — sie nennt den Zielnamen und ist das Wertvollste an der
  # Meldung.
  run_subject "chore(openspec): 54 gemergte Changes archivieren [T003139]"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF "'plans'" || {
    echo "Alias-Auskunft openspec -> plans fehlt:" >&2
    echo "$output" >&2
    return 1
  }
}
