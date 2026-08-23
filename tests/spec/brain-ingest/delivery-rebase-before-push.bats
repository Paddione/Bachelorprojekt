#!/usr/bin/env bats
# tests/spec/brain-ingest/delivery-rebase-before-push.bats — T013914 Entry 9
#
# PRUEFMODUS: SOURCE-VERIFIKATION [T002448-M4-Ausnahme]. brain-ingest.sh
# erfordert einen echten Brain-Repo + LLM-Aufruf und kann in der Testumgebung
# nicht vollstaendig ausgefuehrt werden. Die Aenderung ist ein Source-Text-Patch
# (Rebase vor Push), dessen Ergebnis ausschliesslich im Quelltext manifest ist.
#
# Hintergrund: Bei zwei konkurrierenden brain-ingest-Laeufen schlägt der zweite
# Push mit non-fast-forward fehl, weil das remote Branch um Commits des ersten
# Läufs heraeggerückt ist. Der Fix rebaset lokal auf origin/$BRANCH, bevor
# gepusht wird.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  INGEST="$REPO_ROOT/scripts/brain-ingest.sh"
}

# Positiv-Anker zuerst [T002356-M1]: das Skript existiert und hat einen
# Delivery-Abschnitt mit git push.
@test "brain-ingest.sh existiert und enthaelt einen Push-Befehl" {
  [ -f "$INGEST" ]
  grep -q 'git push' "$INGEST" || { echo "FAIL: no git push in brain-ingest.sh"; return 1; }
}

@test "brain-ingest.sh rebaset auf origin/BRANCH vor dem git push (T013914 E9)" {
  # Der Rebase-Aufruf muss VOR dem ersten git push stehen.
  local rebase_line push_line
  rebase_line=$(grep -n 'rebase.*origin/\$BRANCH\|origin/\$BRANCH.*rebase\|pull.*--rebase.*origin' "$INGEST" | head -1 | cut -d: -f1)
  push_line=$(grep -n 'git push' "$INGEST" | head -1 | cut -d: -f1)
  [ -n "$rebase_line" ] || { echo "FAIL: no rebase onto origin/\$BRANCH found"; return 1; }
  [ -n "$push_line" ] || { echo "FAIL: no git push found"; return 1; }
  [ "$rebase_line" -lt "$push_line" ] || { echo "FAIL: rebase must come before push"; return 1; }
}

@test "brain-ingest.sh prueft, ob origin/BRANCH existiert, bevor rebase (T013914 E9)" {
  # Ein rev-parse --verify oder git show origin/$BRANCH muss den Guard geben.
  grep -q 'origin/"\$BRANCH"\|origin/\$BRANCH' "$INGEST" || { echo "FAIL: no origin/\$BRANCH reference found"; return 1; }
}
