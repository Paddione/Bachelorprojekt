#!/usr/bin/env bats
# tests/spec/security/stray-secret-dump-guard.bats
# Pruefmodus: Output-Verifikation (T002448-M4) — fuehrt den Guard tatsaechlich
# gegen kontrollierte Zielverzeichnisse aus und prueft Exit-Code + Benennung
# der Funde; keine Source-Inspektion.
#
# Hintergrund: T900027 (security, major) — ein vollstaendiges Kubernetes
# Secret-Manifest (128 Keys) lag untracked im Repo-Root unter einem durch
# Windows-Pfad-Mangling zerbrochenen Dateinamen
# ("C<U+F03A>Users...AppDataLocalTempws-secret.json"). .gitignore / git
# check-ignore koennen den Namen nicht aufloesen ("outside repository"), und
# der lokal fail-open gitleaks-Hook feuerte mangels Binaer gar nicht. Dieser
# Guard ist die fail-closed Absicherung: er detektiert stray Secret-Dumps
# nach Dateinamen-Muster, unabhaengig von gitleaks.
#
# Hinweis: Testnamen ASCII-only (BATS encodiert Testnamen fuer die
# Datei-basierte Ausfuehrung; Nicht-ASCII brach die Ausfuehrung).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/stray-secret-dump-guard.sh"
}

@test "stray ws-secret dump in target dir -> guard fails and names the file" {
  # Positiv-Anker: der Guard MUSS einen stray Secret-Dump finden und melden.
  local scan_dir="${BATS_TEST_TMPDIR}/scan-secret"
  mkdir -p "$scan_dir"
  printf '%s' '{"apiVersion":"v1","kind":"Secret","data":{"ANTHROPIC_API_KEY":"c2stZmFrZQ=="}}' \
    > "$scan_dir/ws-secret.json"

  run bash "$GUARD" --dir "$scan_dir"
  [ "$status" -ne 0 ] || {
    echo "expected: FAIL (guard must detect the stray ws-secret.json dump)"
    exit 1
  }
  [[ "$output" == *"ws-secret.json"* ]] || {
    echo "expected: FAIL (guard should name the offending file)"
    exit 1
  }
}

@test "clean target dir -> guard exits 0" {
  # Positiv-Anker des Gegenteils: ohne stray Dump darf der Guard NICHT fehlschlagen.
  local clean_dir="${BATS_TEST_TMPDIR}/scan-clean"
  mkdir -p "$clean_dir"
  echo "no secret dump" > "$clean_dir/normal.txt"

  run bash "$GUARD" --dir "$clean_dir"
  [ "$status" -eq 0 ] || {
    echo "expected: FAIL (guard must let a clean dir pass)"
    exit 1
  }
}

@test "stray secret dump guard skips node_modules and .worktrees during scan" {
  local scan_dir="${BATS_TEST_TMPDIR}/scan-prune"
  mkdir -p "$scan_dir/node_modules" "$scan_dir/.worktrees/nested"
  printf '%s' '{"kind":"Secret"}' > "$scan_dir/node_modules/ws-secret.json"
  printf '%s' '{"kind":"Secret"}' > "$scan_dir/.worktrees/nested/ws-secret.json"
  echo "clean root" > "$scan_dir/normal.txt"

  run bash "$GUARD" --dir "$scan_dir"
  [ "$status" -eq 0 ] || {
    echo "expected: FAIL (node_modules and .worktrees must be pruned)"
    exit 1
  }
}

