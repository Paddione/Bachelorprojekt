#!/usr/bin/env bats
# T012310 — awk-Regexe im Repo duerfen keine Intervall-Ausdruecke ({n,m})
# enthalten.
#
# WARUM: In den CI-Images (debian/ubuntu) zeigt /usr/bin/awk ueber
# /etc/alternatives/awk auf **mawk**. mawk kennt keine Intervall-Ausdruecke und
# matcht /^#{2,3}/ schlicht nie — ohne Fehlermeldung. Lokal laeuft gawk, das
# beides beherrscht. Ein solcher Ausdruck ist deshalb lokal unsichtbar defekt
# und faellt erst in CI auf — und dort als leeres Ergebnis, nicht als Fehler.
#
# Belegt (2026-08-18): scripts/lib/ticket-grill.sh nutzte /^#{2,3}[ \t]+/ fuer
# Markdown-Ueberschriften. Unter mawk lieferte der Parser
# {"answers":{},"questions":[]} — der zugehoerige Test war die letzte rote
# Zusicherung im GitLab-Job bats-unit.
#
#   docker run --rm node:22 bash -c 'printf "## X\n" | awk "/^#{2,3}[ \t]+/{print \"MATCH\"}"'
#   # -> keine Ausgabe (mawk 1.3.4)
#   printf '## X\n' | awk '/^#{2,3}[ \t]+/{print "MATCH"}'
#   # -> MATCH (gawk 5.2.1)
#
# PRUEFMODUS: Quelltext-Scan. Die Zusicherung ist eine Portabilitaetsaussage
# ueber den Quelltext selbst; ein Laufzeitbeweis braeuchte mawk auf dem
# pruefenden Rechner, was nicht vorausgesetzt werden kann.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T012310: der Scan findet ueberhaupt awk-Regexe (Positiv-Anker)" {
  # Ohne diesen Anker bestuende der Negativtest unten vakuos, sobald das
  # Suchmuster oder die Verzeichnisse nicht mehr passen: eine leere
  # Kandidatenmenge erfuellt "kein Treffer" trivial.
  run bash -c "grep -rlE '(~ */|sub\\(/|gsub\\(/)' --include=*.sh '$REPO_ROOT/scripts' | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "T012310: kein awk-Regex im Repo nutzt einen Intervall-Ausdruck" {
  run bash -c "grep -rnE '(~ */|sub\\(/|gsub\\(/|match\\(.*/)[^/]*\\{[0-9]+,[0-9]*\\}' --include=*.sh '$REPO_ROOT/scripts' '$REPO_ROOT/tests' || true"
  [ -z "$output" ] || {
    echo "Intervall-Ausdruck in einem awk-Regex gefunden (mawk matcht ihn nie):"
    echo "$output"
    return 1
  }
}

@test "T012310: ticket-grill erkennt ## -Ueberschriften mit einem mawk-tauglichen Muster" {
  # Gezielter Anker auf den konkreten Fall: die Ueberschriften-Zeile muss die
  # portable Form tragen, nicht die Intervall-Form.
  run grep -cF -e '/^###?[' "$REPO_ROOT/scripts/lib/ticket-grill.sh"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
