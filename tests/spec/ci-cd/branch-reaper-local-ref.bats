#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-local-ref.bats — lokaler Branch-Ref nach Remote-Delete [T003182]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe sowie den
# tatsächlichen Git-Zustand (lokale und Remote-Refs). Es wird NICHT der Quelltext des Skripts
# gegreppt — ein Muster im Source belegt nur, dass Text existiert, nicht dass das Verhalten
# stimmt (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches, und ein
# Löschlauf ist nicht umkehrbar. Alle Tests hier arbeiten ausschliesslich auf dem Fixture.
#
# Zugesichert wird die SEMANTIK, nicht die Darstellung (T002716): geprüft werden Exit-Code,
# das Präfix DELETED/KEEP (der bestehende Ausgabevertrag, siehe branch-reaper.bats), die
# Existenz bzw. Abwesenheit von Ref-Namen am Remote und im lokalen Repo sowie — als Beleg in
# der Ausgabe — der Hinweis auf die lokale Löschung. Der genaue Wortlaut einer Begründung
# wird nirgends festgeschrieben.
#
# Reihenfolge ist bedeutungstragend: Jeder Test fährt zuerst den Positiv-Anker (lokaler Ref
# auf identischer SHA wird mitentfernt). Fällt er, sind die Negativ-Aussagen darunter
# bedeutungslos, weil eine leere Kandidatenliste sie trivial erfüllt (T002356-M1).
#
# BATS-Detail: `run` überschreibt $output — Ausgabe-Ableitungen (grep auf REAPER-Zeilen)
# werden deshalb IMMER direkt nach dem jeweiligen Reaper-Lauf in eine eigene Variable
# gesichert, BEVOR weitere `run`-Aufrufe folgen.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  # Alle Fixture-Pfade sind ABSOLUT und alle git-Aufrufe nutzen -C. Kein `cd`, keine
  # relativen Verzeichnisse: ein relativ angelegtes openspec/changes/<slug> waere unter
  # `bats -j 6` fuer den validateTree('openspec')-Test sichtbar und faerbte ihn sporadisch rot.
  PLANDIR="$FIXTURE/openspec/changes/x"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$PLANDIR"
  echo "base" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Zwei Branches mit reiner Allowlist-Abweichung (openspec/changes/**). Beide sind lokal
  # UND am Remote vorhanden, beide lokalen Refs zeigen auf denselben SHA wie der jeweilige
  # Remote-Branch — der Ausgangszustand, in dem der lokale Ref mitentfernt werden darf.
  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$PLANDIR/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/plan-T009001
  _branch chore/plan-T009002

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener PR.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: jede angefragte ID ist done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

# Positiv-Anker, von jedem Test zuerst gefahren: Der Lauf OHNE --dry-run entfernt den
# Remote-Branch UND den lokalen Ref, wenn beide auf denselben SHA zeigen.
_anchor_same_sha_reaped() {
  run bash "$REAPER" --ticket T009001 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # DELETED-Zeile mit dem Praefix-Vertrag; der Beleg der lokalen Loeschung steht in ihr.
  # Sofort sichern — die folgenden `run`-Aufrufe ueberschreiben $output.
  del="$(printf '%s\n' "$output" | grep '^DELETED chore/plan-T009001' || true)"
  [ -n "$del" ]
  [ "$(printf '%s\n' "$del" | grep -ci 'lokal')" -eq 1 ]
  # Remote-Ref weg
  [ "$(git ls-remote --heads "$REMOTE" | grep -c 'chore/plan-T009001' || true)" -eq 0 ]
  # Lokaler Ref weg
  run git -C "$FIXTURE" rev-parse --verify --quiet chore/plan-T009001
  [ "$status" -ne 0 ]
}

@test "T003182 Positiv-Anker: lokaler Ref auf identischer SHA wird mitentfernt" {
  _anchor_same_sha_reaped
}

@test "T003182: abweichender lokaler Ref (eigene ungepushte Arbeit) ueberlebt" {
  # Positiv-Anker zuerst: der gültige Fall (identische SHA) läuft durch.
  _anchor_same_sha_reaped

  # Negativ-Aussage: lokaler Branch traegt einen nie gepushten Commit on top — der lokale
  # Ref zeigt auf einen anderen SHA als der (geloeschte) Remote-Branch und muss ueberleben.
  git -C "$FIXTURE" checkout --quiet chore/plan-T009002
  echo "lokal, nie gepusht" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "local only"
  git -C "$FIXTURE" checkout --quiet main

  run bash "$REAPER" --ticket T009002 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Ausgabe-Ableitung sofort sichern (der folgende `run` ueberschreibt $output).
  kept_local="$(printf '%s\n' "$output" | grep '^KEEP local chore/plan-T009002' || true)"
  # Remote-Branch wurde geloescht (der Remote-Teil des Vertrags laeuft wie bisher).
  [ "$(git ls-remote --heads "$REMOTE" | grep -c 'chore/plan-T009002' || true)" -eq 0 ]
  # Der lokale Ref lebt weiter.
  run git -C "$FIXTURE" rev-parse --verify --quiet chore/plan-T009002
  [ "$status" -eq 0 ]
  # Die Ausgabe begruendet das Verschonen des LOKALEN Refs (KEEP local-Praefix).
  [ -n "$kept_local" ]
}

@test "T003182: in einem Worktree ausgecheckter lokaler Ref ueberlebt" {
  # Positiv-Anker zuerst: der gültige Fall (identische SHA) läuft durch.
  _anchor_same_sha_reaped

  # Negativ-Aussage: der lokale Branch ist in einem zweiten Worktree ausgecheckt —
  # `git branch -D` schlaegt fehl, der Ref darf NICHT entfernt werden. Die SHA-Gleichheit
  # allein genuegt als Loeschgrund also nicht: das Scheitern des Delete-Befehls ist kein
  # Fehler, sondern ein dokumentierter KEEP-Fall.
  git -C "$FIXTURE" worktree add --quiet "$BATS_TEST_TMPDIR/wt2" chore/plan-T009002

  run bash "$REAPER" --ticket T009002 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Ausgabe-Ableitung sofort sichern (der folgende `run` ueberschreibt $output).
  kept_local="$(printf '%s\n' "$output" | grep '^KEEP local chore/plan-T009002' || true)"
  # Remote-Branch wurde geloescht.
  [ "$(git ls-remote --heads "$REMOTE" | grep -c 'chore/plan-T009002' || true)" -eq 0 ]
  # Der lokale Ref lebt weiter (ist im Worktree ausgecheckt).
  run git -C "$FIXTURE" rev-parse --verify --quiet chore/plan-T009002
  [ "$status" -eq 0 ]
  # Die Ausgabe begruendet das Verschonen des LOKALEN Refs.
  [ -n "$kept_local" ]
}
