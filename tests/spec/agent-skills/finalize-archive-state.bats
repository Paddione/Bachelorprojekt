#!/usr/bin/env bats
# tests/spec/agent-skills/finalize-archive-state.bats
# SSOT: openspec/specs/agent-skills.md (Delta: finalize-archive-self-verify, T015783)
#
# PRÜFMODUS: Output-Verifikation. Anders als
# tests/spec/agent-skills/post-merge-finalize-guards.bats (dokumentierte
# Source-Grep-Ausnahme, weil dort der Laufzeitpfad die Ticket-DB braucht) prüfen
# diese Tests echten Kommando-Output: das Subkommando --archive-state ist genau
# deshalb als eigenständiger, DB-freier Einstieg zugeschnitten (tests/CLAUDE.md).
#
# Regression für T015783: Schritt 8 las die ABWESENHEIT von
# openspec/changes/<slug> als "bereits archiviert?" und meldete [skip] — auch
# dann, wenn der vorige Lauf zwischen `openspec.sh archive` und `git commit`
# abgebrochen war und die Verschiebung nur uncommittet im Arbeitsbaum lag.
# Real beobachtet am 2026-08-24 an T015168/db-identity-guard: Ticket done,
# Change auf origin/main unarchiviert, fertige Archivierung untracked im
# Worktree. Signalklasse: repo-hygiene-ops.md §3 — eine leere Antwort muss von
# einer negativen unterscheidbar sein.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]

  # Fixture-Repo: eigenes git-Repo mit "origin" als lokalem Bare-Remote. Kein
  # Netz, keine DB — der Zustand wird ausschließlich aus Arbeitsbaum und Remote
  # bestimmt.
  FIX="$BATS_TEST_TMPDIR/fix"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  git init -q --bare "$REMOTE"
  git init -q "$FIX"
  git -C "$FIX" config user.email t@example.com
  git -C "$FIX" config user.name test
  git -C "$FIX" remote add origin "$REMOTE"
  mkdir -p "$FIX/openspec/changes/demo-change/specs"
  echo "T015783" > "$FIX/openspec/changes/demo-change/.ticket"
  echo "# demo" > "$FIX/openspec/changes/demo-change/proposal.md"
  git -C "$FIX" add -A
  git -C "$FIX" -c commit.gpgsign=false commit -q -m "seed"
  git -C "$FIX" push -q origin HEAD:main
  git -C "$FIX" fetch -q origin main
}

# Positiv-Anker (T002356-M1): Das Subkommando existiert und antwortet überhaupt.
# Ohne diesen Anker wäre jede Aussage der folgenden Tests auch dann erfüllbar,
# wenn --archive-state gar nicht implementiert wäre und nur leer/rot endete.
@test "T015783: --archive-state meldet pending für einen unarchivierten Change" {
  cd "$FIX"
  run bash "$FINALIZE" --archive-state demo-change --repo "$FIX"
  [ "$status" -eq 0 ]
  [ "$output" = "pending" ]
}

# Der Kern der Regression: Verschiebung vollzogen, nichts committet, kein
# archived-Signal. Heute meldet Schritt 8 hier "[skip] ... bereits archiviert?".
@test "T015783: --archive-state meldet half bei unterbrochener Archivierung" {
  cd "$FIX"
  mkdir -p "$FIX/openspec/changes/archive"
  git -C "$FIX" mv openspec/changes/demo-change \
    openspec/changes/archive/2026-08-24-demo-change
  # Verschiebung ist gestaget, aber NICHT committet — genau der Fundzustand.
  run bash "$FINALIZE" --archive-state demo-change --repo "$FIX"
  [ "$status" -eq 0 ]
  [ "$output" = "half" ]
}

# Der Zielzustand: Archivverzeichnis liegt auf origin/main. Muss weiterhin als
# erledigt gelten, sonst archivierte ein Folgelauf ein zweites Mal.
@test "T015783: --archive-state meldet archived wenn das Archiv auf origin/main liegt" {
  cd "$FIX"
  mkdir -p "$FIX/openspec/changes/archive"
  git -C "$FIX" mv openspec/changes/demo-change \
    openspec/changes/archive/2026-08-24-demo-change
  git -C "$FIX" -c commit.gpgsign=false commit -q -m "archive demo-change"
  git -C "$FIX" push -q origin HEAD:main
  git -C "$FIX" fetch -q origin main
  run bash "$FINALIZE" --archive-state demo-change --repo "$FIX"
  [ "$status" -eq 0 ]
  [ "$output" = "archived" ]
}

# --- Resume-Pfad und Abschluss-Beleg ---------------------------------------
#
# PRÜFMODUS ab hier: Source-Grep. Beide Zusagen liegen im Laufzeitpfad hinter
# Schritt 1 (`ticket.sh get`), der Cluster-/DB-Zugriff braucht und in CI nicht
# existiert — dieselbe dokumentierte Ausnahme wie in
# tests/spec/agent-skills/post-merge-finalize-guards.bats. Ohne diese Tests
# blieben zwei Requirements der Delta-Spec ganz ungeschützt.

# Positiv-Anker (T002356-M1): Der Archiv-Aufruf existiert überhaupt. Ohne ihn
# wäre die Aussage des nächsten Tests auch dann erfüllt, wenn die ganze
# Archiv-Sektion verschwunden wäre.
@test "T015783: Archiv-Sektion ruft openspec.sh archive (Anker)" {
  run grep -qF 'bash scripts/openspec.sh archive "$SLUG"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

@test "T015783: Resume-Pfad überspringt das erneute Archivieren" {
  run grep -qF 'ARCHIVE_RESUME:-0}" == 1' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Gesucht ist der AUFRUF, nicht die Erwähnung: der Kommentar oberhalb des
# Zweigs zitiert die entfernte Zeile absichtlich, damit nachvollziehbar bleibt,
# was dort stand. Ein Grep auf den Meldungstext allein träfe diesen Kommentar
# und wäre rot, obwohl der Defekt behoben ist.
@test "T015783: der ratende mark_skip-Aufruf ist entfernt" {
  run grep -qF 'mark_skip "Schritt 8: Change-Ordner openspec/changes/$SLUG existiert nicht mehr' "$FINALIZE"
  [ "$status" -ne 0 ]
}

@test "T015783: Abschluss wird am Archiv-Branch auf origin belegt" {
  run grep -qF 'ls-remote --exit-code --heads origin "$ARCHIVE_BRANCH"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Der Beleg braucht BEIDE Signale: Branch UND PR. Ein `gh pr list`, dessen
# Exit-Code ungeprüft bleibt, wäre wertlos — "gh konnte nicht antworten" und
# "es gibt keinen PR" liefern dieselbe leere Ausgabe (T002523-M7).
@test "T015783: PR-Beleg wertet den gh-Exit-Code getrennt von der Ausgabe aus" {
  run grep -qF 'if ! _pr_raw="$(gh pr list --head "$ARCHIVE_BRANCH"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Regression aus dem Selbst-Review dieses PRs: liefern beide Kandidaten
# "pending", fiel der Zweig zunächst still durch — Schritt 8 meldete GAR nichts,
# während vorher wenigstens ein [skip] erschien. Stilles Nichtstun im Fix gegen
# stilles Nichtstun.
@test "T015783: unauffindbarer Change-Ordner meldet [warn] statt nichts" {
  run grep -qF 'in keinem Arbeitsbaum gefunden und nichts archiviert' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Das Skript vermeidet jq bewusst (json_field: "grep/sed statt jq"). Der
# PR-Beleg darf diese Entscheidung nicht unterlaufen.
@test "T015783: der PR-Beleg fügt keine jq-Abhängigkeit hinzu" {
  run grep -qE "printf '%s' \"\\\$_pr_raw\" \| jq" "$FINALIZE"
  [ "$status" -ne 0 ]
}

@test "T015783: nicht belegter Abschluss endet als Fehler, nicht als Skip" {
  run grep -qF 'Schritt 8 ohne belegten Abschluss' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Fail-closed: eine nicht durchführbare Messung ist kein Messwert. Ohne
# erreichbares origin darf das Subkommando keinen Zustand behaupten.
@test "T015783: --archive-state urteilt nicht, wenn origin nicht erreichbar ist" {
  cd "$FIX"
  git -C "$FIX" remote set-url origin "$BATS_TEST_TMPDIR/does-not-exist.git"
  run bash "$FINALIZE" --archive-state demo-change --repo "$FIX"
  [ "$status" -ne 0 ]
  [ "$output" != "archived" ]
  [ "$output" != "pending" ]
  [ "$output" != "half" ]
}
