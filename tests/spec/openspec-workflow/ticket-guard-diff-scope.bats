#!/usr/bin/env bats
# tests/spec/openspec-workflow/ticket-guard-diff-scope.bats
# SSOT: openspec/specs/openspec-workflow.md
#   Requirement ".ticket-Guard laeuft im PR-Gate diff-gescoped, im Vollbestand periodisch"
#
# Pruefmodus: Output-Verifikation (T002448-M4). Der Test RUFT den Guard AUF und
#   prueft Exit-Status und Meldungstext — er greppt NICHT den Quelltext des Skripts.
#   Semantik statt Darstellung (T002716): geprueft werden Exit-Code und die
#   Nennung eines Slugs per 'grep -qF' ohne Zeilenanker, nicht das Ausgabeformat.
#
# Hintergrund (T002934): Der Bestandsguard
#   tests/spec/openspec-workflow/ticket-file-required.bats:30 iteriert ueber
#   "$REPO"/openspec/changes/*/ — also ueber den GESAMTBESTAND. Eine einzige
#   fehlende .ticket-Datei auf main faerbt damit JEDEN gleichzeitig offenen PR
#   rot, auch solche, die OpenSpec nicht beruehren (beobachtet 2026-08-09:
#   #3963, #3961, #3957). Der Fix zieht die Pruefung in ein aufrufbares Skript,
#   das im PR-Gate nur die geaenderten Change-Verzeichnisse prueft und den
#   Vollbestand nur im --all-Modus (main / periodischer Lauf) durchgeht.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO/scripts/openspec-ticket-guard.sh"

  FIX="$BATS_TEST_TMPDIR/fixture"
  mkdir -p "$FIX/changes"

  # Ein sauberer Change — traegt eine nicht-leere .ticket-Datei.
  mkdir -p "$FIX/changes/sauberer-change"
  echo "T000001" > "$FIX/changes/sauberer-change/.ticket"

  # Ein Change, der im PR ANGEFASST wird und dem die .ticket-Datei fehlt.
  mkdir -p "$FIX/changes/angefasste-luecke"

  # Eine Altlast auf main, die dieser PR NICHT beruehrt. Genau sie darf einen
  # fremden PR nicht mehr rot faerben — im Vollbestandslauf aber weiterhin.
  mkdir -p "$FIX/changes/fremde-luecke"

  # Leere Allowlist: der Altbestand ist fuer diesen Fixture-Lauf irrelevant.
  BACKLOG="$FIX/backlog.txt"
  : > "$BACKLOG"
}

@test "Guard-Skript existiert und ist ausfuehrbar" {
  [ -x "$GUARD" ]
}

@test "diff-gescoped: fremde Luecke faerbt den PR nicht rot" {
  # Positiv-Anker (T002356-M1) Teil 1: der gueltige Fall laeuft durch.
  # Ohne diese Zusicherung bestuende der Test vakuos, wenn das Skript aus
  # einem beliebigen anderen Grund (fehlendes Flag, Parse-Fehler) abbricht.
  run "$GUARD" --root "$FIX/changes" --backlog "$BACKLOG" --scope sauberer-change
  echo "exit=$status out=$output" >&3
  [ "$status" -eq 0 ]

  # Kern der Zusicherung: die unberuehrte Altlast wird im gescopeten Lauf
  # weder gemeldet noch fuehrt sie zum Fehlschlag.
  run bash -c 'echo "$1" | grep -qF fremde-luecke' _ "$output"
  [ "$status" -ne 0 ]
}

@test "diff-gescoped: Luecke IM geaenderten Change wird weiterhin gemeldet" {
  # Positiv-Anker (T002356-M1) Teil 2: die Negativ-Aussage oben darf nicht
  # dadurch entstehen, dass der Guard ueberhaupt nichts mehr meldet.
  run "$GUARD" --root "$FIX/changes" --backlog "$BACKLOG" --scope angefasste-luecke
  echo "exit=$status out=$output" >&3
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF "angefasste-luecke"
}

@test "Vollbestandsmodus --all meldet auch die unberuehrte Altlast" {
  # Der Bestand darf nicht unbemerkt verrotten: was der PR-Gate-Scope
  # auslaesst, faengt der periodische Vollbestandslauf.
  run "$GUARD" --root "$FIX/changes" --backlog "$BACKLOG" --all
  echo "exit=$status out=$output" >&3
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF "fremde-luecke"
  echo "$output" | grep -qF "angefasste-luecke"
}

@test "Allowlist-Eintraege werden auch im Vollbestandsmodus uebersprungen" {
  echo "fremde-luecke" > "$BACKLOG"
  echo "angefasste-luecke" >> "$BACKLOG"
  run "$GUARD" --root "$FIX/changes" --backlog "$BACKLOG" --all
  echo "exit=$status out=$output" >&3
  [ "$status" -eq 0 ]
}

@test "leerer Scope ist gruen und nicht stillschweigend leer" {
  # Ein PR ohne OpenSpec-Aenderung darf nicht am Guard scheitern — und der
  # Guard muss das sichtbar machen, statt wortlos zu enden.
  run "$GUARD" --root "$FIX/changes" --backlog "$BACKLOG" --scope ""
  echo "exit=$status out=$output" >&3
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}
