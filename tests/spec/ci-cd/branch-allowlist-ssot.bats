#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md, openspec/specs/divergence-guard.md
# T002817: eine gemeinsame Quelle fuer ticketlose Branch-Ausnahmen.
#
# PRUEFMODUS: Output-Verifikation [T002448-M4]. Die Tests fuehren den echten
# .githooks/pre-commit in einem Sandbox-Repo AUS und pruefen dessen Exit-Status,
# statt die Guard-Quelltexte zu greppen. Ein Treffer im Quelltext belegt nur, dass
# Text existiert — nicht, dass der Commit durchgeht. Genau diese Luecke liess
# T002817 entstehen: der Drift-Guard aus T002470 verglich Literale und uebersah
# die erst spaeter hinzugekommene --unattended-Allowlist.
#
# RED-Phase: scripts/lib/branch-allowlist.sh existiert noch nicht. Die Tests zum
# Rollup-Branch und zur Lib scheitern; die Positiv-Anker laufen bereits gruen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO/scripts/lib/branch-allowlist.sh"

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  SANDBOX="$TMP/sandbox"
  mkdir -p "$SANDBOX/.githooks" "$SANDBOX/scripts/lib"
  git init -q -b main "$SANDBOX"

  cp "$REPO/.githooks/pre-commit" "$SANDBOX/.githooks/pre-commit"
  cp "$REPO/.gitleaks.toml" "$SANDBOX/.gitleaks.toml" 2>/dev/null || true
  # Die Lib nur kopieren, wenn sie existiert — in der RED-Phase tut sie das nicht,
  # und genau das soll den Rollup-Test rot machen.
  [ -f "$LIB" ] && cp "$LIB" "$SANDBOX/scripts/lib/branch-allowlist.sh"

  # Vorgelagerte Hook-Abschnitte neutralisieren: sie rufen Repo-Skripte auf, die
  # fuer diesen Guard ohne Belang sind. Stubs statt Kopien, damit der Test nicht
  # an fremden Guards scheitert und deren Aenderungen ihn nicht rot faerben.
  for s in agent-lock.sh agent-collision.sh git-crypt-guard.sh guard-bonsai-overwrite.sh openspec-half-archive-check.sh; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$SANDBOX/scripts/$s"
    chmod +x "$SANDBOX/scripts/$s"
  done

  git -C "$SANDBOX" config user.email t@example.com
  git -C "$SANDBOX" config user.name  Tester
  git -C "$SANDBOX" config core.hooksPath .githooks

  export FRESHNESS_HOOK_DISABLED=1 SKIP_BONSAI_GUARD=1
}

teardown() { rm -rf "$TMP"; }

# Committet eine frische Datei auf dem gegebenen Branch. Gibt den Exit-Status
# von `git commit` zurueck — das ist die gemessene Groesse.
commit_on() {
  local branch="$1" file="$2"
  git -C "$SANDBOX" checkout -q -b "$branch" 2>/dev/null || git -C "$SANDBOX" checkout -q "$branch"
  printf 'content\n' > "$SANDBOX/$file"
  git -C "$SANDBOX" add "$file"
  git -C "$SANDBOX" commit -m "chore: probe" >/dev/null 2>&1
}

# ── Positiv-Anker zuerst [T002356-M1] ────────────────────────────────
# Ohne diese beiden bestuende der Rollup-Test auch dann, wenn der Guard
# vollstaendig ausgehaengt waere.

@test "T002817: ein konventionskonformer Branch darf committen" {
  run commit_on fix/anker-T002817 a.txt
  [ "$status" -eq 0 ]
}

@test "T002817: ein NICHT gelisteter ticketloser Branch bleibt blockiert" {
  run commit_on chore/some-other-work b.txt
  [ "$status" -ne 0 ]
}

@test "T002817: die Ablehnung nennt weiterhin die fehlende Ticket-ID" {
  git -C "$SANDBOX" checkout -q -b chore/yet-another-branch
  printf 'content\n' > "$SANDBOX/c.txt"
  git -C "$SANDBOX" add c.txt
  run git -C "$SANDBOX" commit -m "chore: probe"
  [ "$status" -ne 0 ]
  # Auf die Ticket-ID-Zeile eingrenzen: der Sandbox-Pfad steht im Output und
  # koennte Suchbegriffe selbst erfuellen (CLAUDE.md, $output-Matching).
  echo "$output" | grep -iE 'ticket-id|Ticket-ID' | grep -qi 'ticket'
}

# ── RED: die eigentliche Aussage ─────────────────────────────────────

@test "T002817: der gelistete Rollup-Branch darf committen" {
  run commit_on chore/mishap-incident-rollup d.txt
  [ "$status" -eq 0 ]
}

# ── RED: die gemeinsame Quelle selbst ────────────────────────────────

@test "T002817: scripts/lib/branch-allowlist.sh existiert" {
  [ -f "$LIB" ]
}

@test "T002817: branch_is_ticketless erkennt den Rollup-Branch" {
  [ -f "$LIB" ] || skip "Lib fehlt — siehe vorigen Test"
  run bash -c ". '$LIB' && branch_is_ticketless chore/mishap-incident-rollup"
  [ "$status" -eq 0 ]
}

@test "T002817: branch_is_ticketless lehnt einen nicht gelisteten Branch ab" {
  [ -f "$LIB" ] || skip "Lib fehlt — siehe vorigen Test"
  run bash -c ". '$LIB' && branch_is_ticketless chore/some-other-work"
  [ "$status" -ne 0 ]
}

@test "T002817: der Vergleich ist exakt, kein Praefix-Match" {
  [ -f "$LIB" ] || skip "Lib fehlt — siehe vorigen Test"
  # Ein Glob wie chore/mishap-* wuerde diesen Namen faelschlich befreien.
  run bash -c ". '$LIB' && branch_is_ticketless chore/mishap-incident-rollup-extra"
  [ "$status" -ne 0 ]
}

# ── Fehlende Quelldatei degradiert restriktiv, nie permissiv ─────────

@test "T002817: ohne die Lib bleibt der Rollup-Branch blockiert" {
  rm -f "$SANDBOX/scripts/lib/branch-allowlist.sh"
  run commit_on chore/mishap-incident-rollup e.txt
  [ "$status" -ne 0 ]
}

@test "T002817: ohne die Lib committet ein konformer Branch weiterhin" {
  rm -f "$SANDBOX/scripts/lib/branch-allowlist.sh"
  run commit_on fix/anker2-T002817 f.txt
  [ "$status" -eq 0 ]
}
