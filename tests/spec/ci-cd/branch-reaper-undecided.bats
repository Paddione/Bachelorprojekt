#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-undecided.bats — nicht entscheidbare Kandidaten [T900787]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION gegen ein Wegwerf-Repo (bare Remote in
# BATS_TEST_TMPDIR), nie gegen das echte Repo.
#
# Befund 2026-09-28: vier Sweep-Laeufe lieferten 4/1/0/5 REAP-Kandidaten bei stabilen
# Eingangssignalen; ein echter Sweep endete mit "keine verwaisten Branches gefunden", obwohl
# fuenf reapbare Branches remote lagen. Zugesichert wird hier:
#   1. Ein fehlender/veralteter lokaler Tracking-Ref (Fetch gescheitert) wird nicht still als
#      "Commits ausserhalb main (T900096)" verbucht, sondern als nicht entscheidbar.
#   2. Ein gescheiterter Fetch ist in der Ausgabe sichtbar.
#   3. Die Schlusszeile unterscheidet "nichts verwaist" von "N nicht entscheidbar".
# Exit-Code bleibt 0 (Vertrag aus T003074/T007032: unverifizierbar = verschonen, kein Fehler).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"
  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  REAL_GIT="$(command -v git)"
  mkdir -p "$STUBS"

  git init --bare --quiet "$REMOTE"
  git init --quiet -b main "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"
  mkdir -p "$FIXTURE/scripts"
  echo base > "$FIXTURE/scripts/x.sh"
  git -C "$FIXTURE" add -A && git -C "$FIXTURE" commit --quiet -m base
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Squash-Merge-Realitaet: der Branch-Tip ist KEIN Ancestor von main, main traegt aber
  # denselben Inhalt (eigener Commit).
  git -C "$FIXTURE" checkout --quiet -b fix/sq-T009101
  echo change > "$FIXTURE/scripts/x.sh"
  git -C "$FIXTURE" commit --quiet -am change
  git -C "$FIXTURE" push --quiet origin fix/sq-T009101
  TIP="$(git -C "$FIXTURE" rev-parse HEAD)"
  git -C "$FIXTURE" checkout --quiet main
  echo change > "$FIXTURE/scripts/x.sh"
  git -C "$FIXTURE" commit --quiet -am "squash fix/sq-T009101"
  git -C "$FIXTURE" push --quiet origin main
  git -C "$FIXTURE" fetch --quiet origin

  # gh: kein offener PR; eigener MERGED-PR mit headRefOid == Tip (Positiv-Signal 1).
  cat > "$STUBS/gh" <<STUB
#!/usr/bin/env bash
[ -n "\${GH_FAIL:-}" ] && { echo "error connecting to api.github.com" >&2; exit 1; }
case "\$*" in
  *"--state open"*)   echo '[]' ;;
  *"--head"*"--state merged"*) echo '[{"headRefOid":"$TIP"}]' ;;
  *) echo '[]' ;;
esac
STUB
  printf '#!/usr/bin/env bash\necho %s\n' "'{\"status\":\"done\"}'" > "$STUBS/ticket-stub.sh"
  chmod +x "$STUBS/gh" "$STUBS/ticket-stub.sh"
  export PATH="$STUBS:$PATH" TICKET_SH="$STUBS/ticket-stub.sh"
}

# git-Wrapper, der jeden fetch scheitern laesst (z. B. Ref-Lock durch parallele Session).
_break_fetch() {
  cat > "$STUBS/git" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do [ "\$a" = fetch ] && { echo "fatal: simulated fetch failure" >&2; exit 1; }; done
exec "$REAL_GIT" "\$@"
STUB
  chmod +x "$STUBS/git"
}

@test "T900787 Positiv-Anker: gemergter Squash-Branch wird gereapt" {
  run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/sq-T009101')" -eq 1 ]
}

@test "T900787: fehlender Tracking-Ref bei gescheitertem Fetch ist nicht entscheidbar, nicht T900096" {
  run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/sq-T009101')" -eq 1 ]

  git -C "$FIXTURE" update-ref -d refs/remotes/origin/fix/sq-T009101
  _break_fetch
  run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  keep="$(printf '%s\n' "$output" | grep '^KEEP fix/sq-T009101' || true)"
  [ -n "$keep" ]
  [ "$(printf '%s\n' "$keep" | grep -c 'T900096')" -eq 0 ]
  printf '%s\n' "$output" | grep -qi 'fetch'
  printf '%s\n' "$output" | tail -1 | grep -q 'nicht entscheidbar'
}

@test "T900787: gh-Ausfall erscheint in der Schlusszeile als nicht entscheidbar" {
  run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/sq-T009101')" -eq 1 ]

  GH_FAIL=1 run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/sq-T009101')" -eq 0 ]
  printf '%s\n' "$output" | tail -1 | grep -q '1 .*nicht entscheidbar'
}
