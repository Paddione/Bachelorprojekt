#!/usr/bin/env bats
# T016595 — dev-flow-Guards duerfen POSIX- und Windows-Pfadformate nicht
# vermischen.
#
# WARUM: Unter Git-Bash liefern die beiden Welten denselben Ort in zwei
# Schreibweisen. git gibt Windows-Form aus, die Shell arbeitet in POSIX-Form:
#
#   git rev-parse --show-toplevel  -> C:/Users/.../Bachelorprojekt
#   pwd                            -> /c/Users/.../Bachelorprojekt
#
# Zwei Fehlerklassen folgen daraus, beide am 2026-08-28 belegt:
#
# 1) Ein Glob /* erkennt die Windows-Form nicht als absolut. plan-preflight.sh
#    behandelte sie deshalb als relativ und baute einen Pfad aus zwei
#    absoluten Pfaden:
#      cd: C:/.../<worktree>/C:/Users/.../.git: No such file or directory
#    Unter set -e endete das Skript dort — der Guard war unter Windows
#    grundsaetzlich nicht zu bestehen.
#
# 2) Node kann einen POSIX-Pfad wie /c/Users/... nicht aufloesen. In
#    validate-commit-msg.sh wurde er in einen require()-String interpoliert,
#    der Fehler von 2>/dev/null verschluckt, und die Scope-Allowlist blieb leer:
#      validate-commit-msg: could not load scopes from /c/Users/.../commitlint.config.cjs
#    preflight-pr-scope.sh konsumiert dieselbe Liste und brach fail-closed ab.
#
# ABGRENZUNG: [[ -d "C:/..." ]] funktioniert unter Git-Bash und ist KEIN
# Defekt. Es scheitert nur, wenn ein Skript unter WSL gegen einen
# Windows-Checkout laeuft (dort braucht es /mnt/c). Dieser Pfad entfaellt mit
# dem WSL-Exit und wird hier bewusst nicht abgesichert.
#
# PRUEFMODUS: Laufzeit fuer die ersten beiden Zusicherungen — sie fuehren die
# echten Skripte aus und pruefen ihr Ergebnis. Die dritte ist ein
# Quelltext-Anker gegen Rueckfall.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T016595: validate-commit-msg liefert eine nicht-leere Scope-Allowlist" {
  # Positiv-Anker zugleich: eine leere Liste ist genau der Defekt, und zwei
  # bekannte Scopes muessen darin vorkommen.
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" scopes
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"website"* ]]
  [[ "$output" == *"plans"* ]]
}

@test "T016595: plan-preflight baut keinen Pfad aus zwei absoluten Pfaden" {
  # Das Skript darf aus anderen Gruenden scheitern (fehlender Lock, falscher
  # Branch) — aber nie an einem doppelt zusammengesetzten Pfad. Geprueft wird
  # genau diese Signatur, nicht der Exit-Code.
  run bash "$REPO_ROOT/scripts/plan-preflight.sh" pre-commit --ticket T000000
  [[ "$output" != *"No such file or directory"* ]] || {
    echo "Pfad aus zwei absoluten Pfaden zusammengesetzt:"
    echo "$output"
    return 1
  }
}

@test "T016595: kein Absolutheits-Glob ignoriert Windows-Laufwerkspfade" {
  # Quelltext-Anker gegen Rueckfall: wer kuenftig auf Absolutheit prueft, muss
  # die Laufwerksform mitnehmen.
  run bash -c "grep -nE 'case[^;]*in[[:space:]]*/\\*\\)' '$REPO_ROOT/scripts/plan-preflight.sh' || true"
  [ -z "$output" ] || {
    echo "Absolutheits-Test ohne Laufwerksform gefunden:"
    echo "$output"
    return 1
  }
}
