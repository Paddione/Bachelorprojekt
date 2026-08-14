#!/usr/bin/env bats
# tests/spec/githooks-worktree-fallback.bats — T005567
#
# commit-msg-Hook ist nicht worktree-faehig: Die Hooks liegen zentral im
# Haupt-Checkout (core.hooksPath), rufen die Guard-Skripte aber relativ zum
# WORKTREE-`repo_root` auf (`git rev-parse --show-toplevel`). Fehlt ein Skript
# im Worktree-Branch-Stand (beobachtet: scripts/check-fix-ticket-guard.sh,
# erst seit PR #4444 / T005307 existent), liefert `bash <fehlend>` Exit 127,
# und `if ! bash …` invertiert das zu Erfolg — der Guard laeuft STILL LEER
# bzw. der Hook bricht ab, genau am Ort des Commits (T005567: "Im Worktree
# schlug der Hook fehl bzw. lief leer; der Implementer musste das
# Guard-Skript lokal in den Worktree kopieren").
#
# Erwartung: Der Hook loest fehlende Guard-Skripte ueber den Haupt-Checkout
# auf (erreichbar via `git rev-parse --git-common-dir`/`..`), statt den Guard
# still zu passieren oder abzubrechen.

setup() {
  load 'test_helper.bash'
  # Echter Mini-Repo-Aufbau: Haupt-Checkout mit Skript, Worktree ohne.
  SANDBOX="$BATS_TEST_TMPDIR/wt-fallback-$$"
  mkdir -p "$SANDBOX/main/scripts" "$SANDBOX/main/.githooks"
  git -C "$SANDBOX/main" init -q -b main
  git -C "$SANDBOX/main" config user.email "test@example.com"
  git -C "$SANDBOX/main" config user.name "Bats Test"
  git -C "$SANDBOX/main" config core.hooksPath .githooks
  # Guard-Skript NUR im Haupt-Checkout (Worktree-Branch-Stand hat es nicht).
  cat > "$SANDBOX/main/scripts/check-fix-ticket-guard.sh" <<'EOF'
#!/usr/bin/env bash
msg="$(cat "$1" 2>/dev/null || echo "$1")"
echo "$msg" | grep -qE 'T[0-9]{4,}' || { echo "FIX-GUARD: no ticket id in message" >&2; exit 1; }
exit 0
EOF
  chmod +x "$SANDBOX/main/scripts/check-fix-ticket-guard.sh"
  # Hook in der ZIEL-Form (T005567-Fix): Skript relativ zum Worktree, mit
  # Haupt-Checkout-Fallback ueber --git-common-dir, wenn es dort fehlt.
  cat > "$SANDBOX/main/.githooks/commit-msg" <<'EOF'
#!/usr/bin/env bash
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
guard="$repo_root/scripts/check-fix-ticket-guard.sh"
if [ ! -f "$guard" ]; then
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  [ -n "$common_dir" ] && [ -d "$common_dir/.." ] && guard="$(cd "$common_dir/.." && pwd)/scripts/check-fix-ticket-guard.sh"
fi
if [ ! -f "$guard" ]; then
  echo "commit-msg: guard script not found (worktree nor main checkout)" >&2
  exit 1
fi
if ! bash "$guard" "$1"; then
  echo "commit-msg: fix-ticket guard rejected" >&2
  exit 1
fi
exit 0
EOF
  chmod +x "$SANDBOX/main/.githooks/commit-msg"
  git -C "$SANDBOX/main" add -A && git -C "$SANDBOX/main" commit -q -m "chore(test): scaffold main [T005567]"
  # Worktree auf eigenem Branch — ohne scripts/check-fix-ticket-guard.sh.
  git -C "$SANDBOX/main" worktree add -q -b fix/feature-x "$SANDBOX/wt"
  git -C "$SANDBOX/wt" rm -q scripts/check-fix-ticket-guard.sh
  # Setup-Commit OHNE Hooks (der Hook-Zweig wird in den Tests geprueft).
  git -C "$SANDBOX/wt" -c core.hooksPath=/dev/null commit -q -m "chore(test): branch state without guard script [T005567]"
}

@test "T005567: Commit im Worktree ohne Guard-Skript laeuft mit Haupt-Checkout-Fallback durch" {
  echo "feature work" > "$SANDBOX/wt/feature.txt"
  git -C "$SANDBOX/wt" add feature.txt
  run git -C "$SANDBOX/wt" commit -m "fix(test): feature without guard script in worktree [T005567]"
  # Der Hook muss das Skript im Haupt-Checkout gefunden haben — Exit 0.
  [ "$status" -eq 0 ] || { echo "Hook hat Commit blockiert: $output" >&2; return 1; }
  git -C "$SANDBOX/wt" log --oneline -1 | grep -q "feature without guard"
}

@test "T005567: der echte commit-msg-Hook traegt den Haupt-Checkout-Fallback (Querschnitts-Guard)" {
  # Querschnitts-Doku-Guard (T002448-M4, wie T004271): der Hook-Code IST die
  # ausfuehrbare Prozedur — kein Laufzeitverhalten, gegen das gemessen werden
  # koennte. Prueft, dass .githooks/commit-msg die Fallback-Aufloesung ueber
  # den Haupt-Checkout traegt, statt nur den Worktree-repo_root zu nutzen.
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  HOOK="$REPO_ROOT/.githooks/commit-msg"
  [ -f "$HOOK" ] || { echo "Hook fehlt: $HOOK" >&2; return 1; }
  # Basis-Aufloesung vorhanden?
  run grep -nE 'show-toplevel|repo_root' "$HOOK"
  [ "$status" -eq 0 ] || { echo "keine repo_root-Aufloesung im Hook" >&2; return 1; }
  # Der eigentliche T005567-Kern: Fallback auf den Haupt-Checkout fuer
  # fehlende Guard-Skripte (git-common-dir) — der Fix, der fehlt.
  run grep -nE 'git-common-dir|git_common|common_dir' "$HOOK"
  [ "$status" -eq 0 ] || { echo "Hook ohne Haupt-Checkout-Fallback (git-common-dir)" >&2; return 1; }
}
