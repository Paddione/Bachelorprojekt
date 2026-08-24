#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-spec-atlas-allowlist.bats — Spec-Atlas-Allowlist [T015919]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe. Es wird
# NICHT der Quelltext des Skripts gegreppt (T002448-M4).
#
# Szenario (real beobachtet an fix/finalize-archive-self-verify-T015783, PR #5197): Der PR
# ist gemergt, NACH dem Merge wurden Regenerate auf den Branch gepusht — der einzige
# verbleibende Blob-Konflikt zu main ist docs/spec-atlas.md. Weil der Post-Merge-Push die
# Branch-Spitze verschoben hat, feuert das Positiv-Signal 1 (headRefOid == Remote-Tip,
# T007032) nicht; es entscheidet der Allowlist-Blob-Check. docs/spec-atlas.md ist ein
# Generate (task freshness:regenerate → scripts/openspec-atlas.sh, T015012) und gehört in
# die ALLOWLIST — sonst bleibt der Branch dauerhaft KEEP.
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches. Alle Tests
# arbeiten ausschliesslich auf dem Fixture.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  ATLASDIR="$FIXTURE/docs"
  PLANDIR="$FIXTURE/openspec/changes/x"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$ATLASDIR" "$PLANDIR"
  echo "atlas base" > "$ATLASDIR/spec-atlas.md"
  echo "base" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Branch mit Ticket-ID, gemergter PR, danach Post-Merge-Push eines Regenerats:
  # Commit 1 (= gemergter PR-Stand, TIP_MERGED) und Commit 2 (Regenerat-Drift, neuer Tip).
  # Dadurch feuert Positiv-Signal 1 bewusst NICHT (headRefOid != Remote-Tip) und der
  # Allowlist-Blob-Check entscheidet.
  git -C "$FIXTURE" checkout --quiet -b fix/spec-atlas-drift-T999001
  echo "atlas v2" > "$ATLASDIR/spec-atlas.md"
  git -C "$FIXTURE" commit --quiet -am "feature work incl. atlas regen"
  git -C "$FIXTURE" push --quiet origin fix/spec-atlas-drift-T999001
  TIP_MERGED="$(git -C "$FIXTURE" rev-parse HEAD)"
  sleep 1
  echo "atlas post-merge regen" > "$ATLASDIR/spec-atlas.md"
  git -C "$FIXTURE" commit --quiet -am "post-merge atlas regen"
  git -C "$FIXTURE" push --quiet origin fix/spec-atlas-drift-T999001

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  cat > "$STUBS/gh" <<STUB
#!/usr/bin/env bash
branch=""; state=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    --head) branch="\$2"; shift 2 ;;
    --state) state="\$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "\$state" = "open" ]; then echo '[]'; exit 0; fi
if [ "\$state" = "merged" ] && [ -n "\$branch" ]; then
  printf '[{"headRefOid":"%s"}]\n' "$TIP_MERGED"
  exit 0
fi
echo '[]'
exit 0
STUB
  chmod +x "$STUBS/gh"

  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T015919: gemergter Branch, dessen Rest-Divergenz nur docs/spec-atlas.md ist, wird REAP-Kandidat" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'fix/spec-atlas-drift-T999001')" -eq 1 ]
}

@test "T015919: echte Quelldatei-Divergenz neben dem Atlas-Regenerat bleibt KEEP" {
  git -C "$FIXTURE" checkout --quiet fix/spec-atlas-drift-T999001
  mkdir -p "$FIXTURE/src"
  echo "real source change" > "$FIXTURE/src/handler.ts"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "real source divergence"
  git -C "$FIXTURE" push --quiet origin fix/spec-atlas-drift-T999001
  git -C "$FIXTURE" checkout --quiet main

  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/spec-atlas-drift-T999001')" -eq 0 ]
  keep="$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/spec-atlas-drift-T999001' || true)"
  [ -n "$keep" ]
}
