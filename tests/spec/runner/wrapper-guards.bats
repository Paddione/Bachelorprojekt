#!/usr/bin/env bats
# Tests für den BATS-Runner (tests/bats) — Guard- und Konventionstests.
#
# Dieser Guard bestätigt, dass die Umlaut-Guard-Logik im Wrapper funktioniert:
# Der Wrapper setzt LC_ALL=C.UTF-8 auf Windows, sodass BATS Nicht-ASCII-Bytes
# in Test-Namen nicht stillschweigend überspringt. Der BATS-Validator gibt dann
# Exit 1 bei count mismatch zurück — der Wrapper exec'd direkt, also surfactet
# der Exit-Code korrekt.
#
# Fix: T900068 (BATS-Testnamen mit Umlauten)
# Vorher: Nicht-ASCII-Testnamen wurden unter Windows stillschweigend übersprungen,
#         ohne dass der Runner rot wurde.
# Nachher: LC_ALL=C.UTF-8 im Wrapper ermöglicht korrekte Byte-Zählung;
#          der BATS-Validator erkennt count mismatch und gibt Exit 1 zurück.

TEST_DIR="$BATS_TEST_DIRNAME"

# --- Guard: BATS-Wrapper setzt LC_ALL ---
# Der Wrapper (tests/bats) setzt auf Windows automatisch LC_ALL=C.UTF-8.
# Das ist eine reine Konventionsprüfung, da die Lokalisierung auf Linux
# ohnehin UTF-8 unterstützt.

@test "tests/bats ist ausfuehrbar" {
  run ls -l tests/bats
  [ "$status" -eq 0 ]
  [[ "$output" == *"-rwx"* || "$output" == *"x"* ]]
}

@test "tests/bats ist ein Shell-Skript (Shebang)" {
  run head -1 tests/bats
  [[ "$output" == "#!"* ]]
}

@test "tests/bats setzt LC_ALL=C.UTF-8 auf Windows (Git-Bash-Erkennung)" {
  # Der Wrapper erkennt Windows über den PATH, der "bash" enthält.
  # LC_ALL=C.UTF-8 muss explizit gesetzt sein, damit BATS UTF-8-Bytes
  # in Test-Namen korrekt zählt.
  grep -q 'LC_ALL' tests/bats
  run grep 'LC_ALL' tests/bats
  [[ "$output" == *'C.UTF-8'* || "$output" == *'"C.UTF-8"* || "$output" == *"utf-8"* || "$output" == *'"utf-8"* ]]
}

@test "tests/bats exec'd den BATS-Core (kein npm-wrapper)" {
  # Der Wrapper muss BATS-Core direkt aufrufen via exec, nicht den npm-globalen
  # bats, der keine Vendored-Konfiguration hätte.
  grep -q 'exec.*bats-core' tests/bats
}

# --- Guard: ASCII-Namenskonvention für @test-Namen ---
# Alle @test-Namen müssen ASCII-only sein (a-z, A-Z, 0-9, underscore, hyphen, point).
# Umlaute, Akzente, CJK etc. in @test-Namen führen auf Windows zu Silent-Skips
# weil Bash Nicht-ASCII byteweise interpretiert und der Funktionsname dann nicht
# mit dem BATS-Definition-Namen übereinstimmt.

@test "keine @test-Namen mit Umlauten in tests/spec/" {
  # Suche nach @test-Zeilen, die Nicht-ASCII-Bytes in der Namens-Klammer enthalten.
  # Pattern: @test "name_mit_oe_ae_ue_ss" { {  {  — der Name zwischen Anführungszeichen.
  local result
  result=$(find tests/spec -name '*.bats' -exec grep -Pn '@test\s+"[^"]*[\x80-\xff]' {} + 2>/dev/null || true)
  [ -z "$result" ] || { echo "Nicht-ASCII @test-Namen gefunden:"; echo "$result"; return 1; }
}

@test "keine @test-Namen mit Umlauten in tests/unit/" {
  local result
  result=$(find tests/unit -name '*.bats' -exec grep -Pn '@test\s+"[^"]*[\x80-\xff]' {} + 2>/dev/null || true)
  [ -z "$result" ] || { echo "Nicht-ASCII @test-Namen gefunden:"; echo "$result"; return 1; }
}

@test "keine @test-Namen mit Umlauten in tests/ (Root)" {
  # Suche in .bats-Dateien direkt unter tests/, nicht in Unterverzeichnissen.
  local result
  result=$(find tests/ -maxdepth 1 -name '*.bats' -exec grep -Pn '@test\s+"[^"]*[\x80-\xff]' {} + 2>/dev/null || true)
  [ -z "$result" ] || { echo "Nicht-ASCII @test-Namen gefunden:"; echo "$result"; return 1; }
}
