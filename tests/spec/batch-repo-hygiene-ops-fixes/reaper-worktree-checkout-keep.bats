#!/usr/bin/env bats
# SA-batch-repo-hygiene-ops-fixes-T012445 (#1)
# branch-reaper.sh muss einen Branch, der in einem lebenden Worktree ausgecheckt
# ist, VOR allen anderen Pruefungen als KEEP fuehren — sonst loescht der Sweep den
# Remote-Ref einer laufenden Session und merkt es erst hinterher ("KEEP local …").
#
# Prüfmodus: Output-Verifikation — der Sweep laeuft als Prozess mit gemocktem git
# (ls-remote/worktree), die KEEP-Zeile im stdout ist die Zusicherung.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  REAPER="$REPO/scripts/branch-reaper.sh"
}

@test "branch-reaper KEEPs branches checked out in a live worktree" {
  run bash -c '
    git() {
      case "$1" in
        ls-remote) printf "%s\trefs/heads/feature/wt-live-T012445\n" \
          "0000000000000000000000000000000000000001"; return 0 ;;
        worktree) printf "worktree /tmp/some-main\nHEAD 0000000\nbranch refs/heads/feature/wt-live-T012445\n\n"; return 0 ;;
        *) command git "$@" ;;
      esac
    }
    export -f git
    bash "'"$REAPER"'" --sweep --dry-run 2>&1
  '
  [ "$status" -eq 0 ] || { echo "Sweep scheiterte: $output"; false; }
  # Positiv-Aussage: der Branch wird verschont, mit eigener Begründung.
  [[ "$output" == *"KEEP feature/wt-live-T012445"* ]] || { echo "KEEP fehlt: $output"; false; }
  [[ "$output" == *"in einem Worktree ausgecheckt"* ]] || { echo "Begruendung fehlt: $output"; false; }
}
