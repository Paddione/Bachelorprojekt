#!/usr/bin/env bats
# Guard: scripts/preflight-pr-scope.sh muss ALLE Ticket-IDs im PR-Titel
# beruecksichtigen, nicht nur die erste. [T003103]
#
# Pruefmodus: Output-Verifikation (T002448-M4) — jeder Test RUFT das Skript AUF
# und prueft Exit-Code plus die semantiktragende Fehlerzeile. Kein Source-Grep.
# Semantik statt Darstellung (T002716): geprueft wird der Exit-Code und ein
# ankerfreier Substring der FATAL-Zeile, nicht das Layout der Gesamtausgabe.
#
# Achtung: preflight-pr-scope.sh gibt bei fehlendem Argument "$0" aus. Deshalb
# wird NIE unqualifiziert gegen "$output" gematcht — jede Zusicherung grenzt
# zuerst auf die FATAL-Zeile ein (CLAUDE.md, BATS-$output-Konvention).

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../../scripts/preflight-pr-scope.sh"
  TMP="$(mktemp -d)"
  # Isolierte Git-Fixture (wie tests/unit/preflight-pr-scope.bats): der Branch
  # traegt die Ticket-ID t003103 und ist bewusst KEIN feature/*|fix/*-Branch,
  # damit die Worktree-Erzwingung nicht mitprueft.
  git -C "$TMP" init -q -b work-t003103
  git -C "$TMP" config user.email "test@example.invalid"
  git -C "$TMP" config user.name "Test Fixture"
  git -C "$TMP" commit -q --allow-empty -m "fixture"
  cd "$TMP"
}

teardown() { rm -rf "$TMP"; }

# Liefert nur die FATAL-Zeile zum Ticket-ID/Branch-Abgleich.
_fatal_line() {
  printf '%s\n' "$output" | grep 'does not match current branch' || true
}

@test "preflight [T003103]: Positiv-Anker — Ein-ID-Titel passend zum Branch besteht weiterhin" {
  run bash "$HELPER" "fix(ops): einzelnes Ticket [T003103]"
  [ "$status" -eq 0 ]
}

@test "preflight [T003103]: Positiv-Anker — Ein-ID-Titel mit fremdem Ticket faellt weiterhin durch" {
  run bash "$HELPER" "fix(ops): fremdes Ticket [T003180]"
  [ "$status" -ne 0 ]
  [ -n "$(_fatal_line)" ]
}

@test "preflight [T003103]: Zwei-ID-Titel besteht, wenn die ZWEITE ID zum Branch passt" {
  # Der eigentliche Defekt: 'head -n 1' nimmt T003180 und meldet FATAL,
  # obwohl der Branch das im Titel ebenfalls genannte T003103 traegt.
  run bash "$HELPER" "fix(ops): loest T003180 mit [T003103]"
  [ "$status" -eq 0 ] || {
    echo "--- unerwarteter Exit $status ---"
    printf '%s\n' "$output"
    return 1
  }
}

@test "preflight [T003103]: Zwei-ID-Titel besteht, wenn die ERSTE ID zum Branch passt" {
  run bash "$HELPER" "fix(ops): [T003103] loest nebenbei T003180"
  [ "$status" -eq 0 ]
}

@test "preflight [T003103]: Zwei-ID-Titel ohne passende ID faellt durch und nennt beide IDs" {
  # Der Guard darf nicht aufweichen: passt KEINE der IDs zum Branch, bleibt es
  # ein FATAL. Die Meldung muss beide gefundenen IDs nennen, sonst schlaegt sie
  # weiter eine Umbenennung auf ein willkuerlich gewaehltes Ticket vor.
  run bash "$HELPER" "fix(ops): loest T003180 und [T003074]"
  [ "$status" -ne 0 ]
  line="$(_fatal_line)"
  [ -n "$line" ]
  printf '%s\n' "$line" | grep -qF 'T003180'
  printf '%s\n' "$line" | grep -qF 'T003074'
}
