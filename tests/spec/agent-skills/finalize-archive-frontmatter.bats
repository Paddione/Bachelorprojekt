#!/usr/bin/env bats
# tests/spec/agent-skills/finalize-archive-frontmatter.bats
# SSOT: openspec/specs/agent-skills.md (Delta: archive-frontmatter-completed, T015916)
#
# PRÜFMODUS: gemischt.
# - Tests 1-2: OUTPUT-VERIFIKATION gegen den DB-freien Einstieg
#   `--frontmatter-state <slug>` (Prüfmodus-Muster wie --archive-state, T015783).
# - Tests 3-5: Source-Grep-Ausnahme — die Reihenfolge Frontmatter-Sed vs.
#   `git checkout -B` liegt im Laufzeitpfad hinter Schritt 1 (`ticket.sh get`,
#   Cluster-/DB-Zugriff) und manifestiert sich sonst nur im Archiv-Ergebnis eines
#   vollen Finalize-Laufs mit origin + gh + task. Dieselbe dokumentierte Ausnahme
#   wie tests/spec/agent-skills/finalize-archive-state.bats §Resume-Pfad.
#
# Regression für T015916: Der Frontmatter-Sed lief in Schritt 7 VOR der Archiv-
# Subshell und traf den Haupt-Checkout-Arbeitsbaum; die Subshell archivierte nach
# `git checkout -B ... origin/main` weiterhin `status: active` (9 von 12 archivierten
# Plänen falsch), und der Haupt-Checkout behielt eine uncommittete Änderung, die ein
# `git pull --ff-only` blockierte.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]

  # Fixture-Repo: eigenes git-Repo mit "origin" als lokalem Bare-Remote. Kein
  # Netz, keine DB — der Frontmatter-Zustand wird nur aus dem Arbeitsbaum gelesen.
  FIX="$BATS_TEST_TMPDIR/fix"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  git init -q --bare "$REMOTE"
  git init -q "$FIX"
  git -C "$FIX" config user.email t@example.com
  git -C "$FIX" config user.name test
  git -C "$FIX" remote add origin "$REMOTE"
  mkdir -p "$FIX/openspec/changes/demo-change/specs"
  echo "T015916" > "$FIX/openspec/changes/demo-change/.ticket"
  echo "# demo" > "$FIX/openspec/changes/demo-change/proposal.md"
  printf '# plan\ntitle: demo\nstatus: active\n' > "$FIX/openspec/changes/demo-change/tasks.md"
  git -C "$FIX" add -A
  git -C "$FIX" -c commit.gpgsign=false commit -q -m "seed"
  git -C "$FIX" push -q origin HEAD:main
  git -C "$FIX" fetch -q origin main
}

@test "T015916: --frontmatter-state meldet stale fuer status: active (DB-frei)" {
  cd "$FIX"
  run bash "$FINALIZE" --frontmatter-state demo-change --repo "$FIX"
  [ "$status" -eq 0 ]
  [ "$output" = "stale" ]
}

@test "T015916: --frontmatter-state meldet completed fuer gesetztes Frontmatter" {
  sed -i 's/^status: active$/status: completed/' "$FIX/openspec/changes/demo-change/tasks.md"
  cd "$FIX"
  run bash "$FINALIZE" --frontmatter-state demo-change --repo "$FIX"
  [ "$status" -eq 0 ]
  [ "$output" = "completed" ]
}

# Positiv-Anker: Der Frontmatter-Wechsel existiert ueberhaupt — und zwar als
# Hilfsfunktion mit Aufruf auf dem Archiv-Zielbaum, nicht als verstreuter Sed.
@test "T015916: Frontmatter-Helper wird mit dem Archiv-Baum aufgerufen" {
  run grep -qF '_apply_plan_frontmatter_completed "$ARCHIVE_DIR"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Die Kern-Reihenfolge: checkout -B (Zeile a) < Helper-Aufruf (Zeile b) <
# openspec.sh archive (Zeile c). Genau hier versagte der alte Stand: der Sed
# lag vor der Subshell, der Helper-Aufruf fehlte komplett.
@test "T015916: Frontmatter-Wechsel liegt zwischen checkout -B und archive" {
  local ln_checkout ln_helper ln_archive
  ln_checkout="$(grep -nF 'git checkout -B "$ARCHIVE_BRANCH" origin/main' "$FINALIZE" | head -1 | cut -d: -f1)"
  ln_helper="$(grep -nF '_apply_plan_frontmatter_completed "$ARCHIVE_DIR"' "$FINALIZE" | head -1 | cut -d: -f1)"
  ln_archive="$(grep -nF 'openspec.sh archive "$SLUG"' "$FINALIZE" | head -1 | cut -d: -f1)"
  [ -n "$ln_checkout" ] && [ -n "$ln_helper" ] && [ -n "$ln_archive" ]
  [ "$ln_checkout" -lt "$ln_helper" ]
  [ "$ln_helper" -lt "$ln_archive" ]
}

# Negativ-Aussage mit Positiv-Anker: Der alte Schritt-7-Sed direkt auf
# "$PLAN_FILE" ist entfernt; die Status-Alternation lebt nur noch im Helper.
@test "T015916: der verstreute PLAN_FILE-Sed aus Schritt 7 ist entfernt" {
  # Positiv-Anker: die Alternation existiert genau einmal — im Helper.
  local hits
  hits="$(grep -cF 'active|plan_staged|in_progress|planning' "$FINALIZE")"
  [ "$hits" -eq 1 ]
  # Negativ-Aussage: kein Sed mehr gegen "$PLAN_FILE" mit der Alternation.
  local stray
  stray="$(grep -E 'sed .*planning.*"\$PLAN_FILE"' "$FINALIZE" || true)"
  [ -z "$stray" ]
}
