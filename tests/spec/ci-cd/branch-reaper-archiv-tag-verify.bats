#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-archiv-tag-verify.bats
# T007067 Mishap 3+4 — branch-reaper meldet "Archiv-Tag konnte nicht gepusht
# werden", der Tag liegt aber auf origin (False Negative).
#
# Beobachtet 2026-08-15 (repo-hygiene-Sweep): Der Reaper meldete für
# feature/unterstuetzermodelle-e2b-slot-T007055 "KEEP — Archiv-Tag konnte nicht
# gepusht werden, kein Delete". Direkt danach zeigte
# `git ls-remote --tags origin refs/tags/reaped/...` den Tag exakt am Branch-Tip.
# Entweder ging der Push doch durch (Server hat den Ref uebernommen, der Client
# meldete einen Fehler) oder ein paralleler Prozess pushte ihn. Das fail-closed-
# Ergebnis war korrekt, aber die Meldung widersprach dem beobachteten Endzustand.
#
# Erwartung: Vor dem KEEP verifiziert der Reaper den Tag-Zustand gegen origin
# (ls-remote). Liegt der Tag dort am Branch-SHA, ist das Sicherheitsnetz erfuellt
# und der Delete darf laufen — fail-closed bleibt: ohne Tag auf origin kein Delete.
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION gegen ein Wegwerf-Git-Repo
# (gleiches Muster wie branch-reaper-local-ref.bats, T002448-M4).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

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

  # Branch mit reiner Allowlist-Abweichung (openspec/changes/**) — ein
  # loeschbarer Kandidat (Ticket done, kein offener PR).
  git -C "$FIXTURE" checkout --quiet -b chore/plan-T009005
  echo "abweichend" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "plan only"
  git -C "$FIXTURE" push --quiet origin chore/plan-T009005
  SHA="$(git -C "$FIXTURE" rev-parse chore/plan-T009005)"

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener PR.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009005 ist done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"

  # Delegierender git-Stub (T007067): simuliert den transienten Client-Fehler
  # beim Archiv-Tag-Push — `git push <remote> <sha>:refs/tags/...` schlaegt mit
  # Exit 1 fehl, obwohl der Server den Ref bereits uebernommen hat (bzw. ein
  # paralleler Prozess ihn pushte). Alle anderen git-Aufrufe delegieren an das
  # echte git. Wird nur im jeweiligen Reaper-Lauf per PATH vorangestellt.
  GITSTUB="$BATS_TEST_TMPDIR/gitstub"
  mkdir -p "$GITSTUB"
  REAL_GIT="$(command -v git)"
  cat > "$GITSTUB/git" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do
  if [ "\$a" = "push" ]; then
    for r in "\$@"; do
      case "\$r" in
        *:refs/tags/*)
          echo "gitstub: transient tag-push failure (simuliert)" >&2
          exit 1 ;;
      esac
    done
  fi
done
exec "$REAL_GIT" "\$@"
STUB
  chmod +x "$GITSTUB/git"
}

# Positiv-Anker: Ohne Störung wird der Branch geloescht — der Reaper pusht den
# Archiv-Tag selbst und das Sicherheitsnetz ist erfuellt.
@test "T007067 Positiv-Anker: Branch ohne Störung wird geloescht (Archiv-Tag gepusht)" {
  run bash "$REAPER" --ticket T009005 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  del="$(printf '%s\n' "$output" | grep '^DELETED chore/plan-T009005' || true)"
  [ -n "$del" ]
  # Remote-Branch weg, Archiv-Tag liegt vor.
  [ "$(git ls-remote --heads "$REMOTE" | grep -c 'chore/plan-T009005' || true)" -eq 0 ]
  [ -n "$(git ls-remote --tags "$REMOTE" "refs/tags/reaped/chore/plan-T009005" || true)" ]
}

# T007067: Der Tag-Push schlaegt fehl (pre-receive-Hook lehnt refs/tags ab),
# aber der Tag liegt bereits auf origin am Branch-SHA (paralleler Prozess /
# transienter Push-Fehler, Server hat den Ref uebernommen). Der Reaper darf
# NICHT "KEEP — Archiv-Tag konnte nicht gepusht werden" melden, sondern muss
# den Tag-Zustand gegen origin verifizieren und den Delete fortsetzen —
# das Sicherheitsnetz ist erfuellt.
@test "T007067: Tag liegt trotz Push-Fehler auf origin am Branch-SHA — Delete laeuft weiter" {
  # Tag auf origin am Branch-SHA vorlegen (simuliert parallelen Prozess bzw.
  # vom Server uebernommenen Push).
  git -C "$FIXTURE" push --quiet origin "$SHA:refs/tags/reaped/chore/plan-T009005"

  # git-Stub im PATH: der Archiv-Tag-Push des Reapers schlaegt transient fehl,
  # obwohl der Tag auf origin liegt — das T007067-Szenario (False Negative).
  run env PATH="$GITSTUB:$PATH" bash "$REAPER" --ticket T009005 --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  # Ausgabe-Ableitung sofort sichern (der folgende `run` ueberschreibt $output).
  out="$output"

  # KEINE KEEP-Meldung wegen "Archiv-Tag konnte nicht gepusht werden".
  [ -z "$(printf '%s\n' "$out" | grep 'KEEP.*Archiv-Tag konnte nicht gepusht' || true)" ]

  # Der Delete lief durch: Remote-Branch weg, Archiv-Tag liegt am Branch-SHA.
  [ "$(git ls-remote --heads "$REMOTE" | grep -c 'chore/plan-T009005' || true)" -eq 0 ]
  tag_sha="$(git ls-remote --tags "$REMOTE" "refs/tags/reaped/chore/plan-T009005" | cut -f1)"
  [ "$tag_sha" = "$SHA" ]
}

# Negativ-Anker: Der Tag-Push schlaegt fehl UND der Tag liegt NICHT auf origin
# (oder am falschen SHA) — dann bleibt fail-closed: KEEP, kein Delete.
@test "T007067 Negativ: Tag-Push-Fehler ohne Tag auf origin — KEEP bleibt erhalten" {
  run env PATH="$GITSTUB:$PATH" bash "$REAPER" --ticket T009005 --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  out="$output"

  # KEEP-Meldung mit Push-Grund ist korrekt.
  [ -n "$(printf '%s\n' "$out" | grep 'KEEP.*Archiv-Tag konnte nicht gepusht' || true)" ]

  # Branch bleibt erhalten (fail-closed), kein Archiv-Tag entstanden.
  [ -n "$(git ls-remote --heads "$REMOTE" | grep 'chore/plan-T009005' || true)" ]
  [ -z "$(git ls-remote --tags "$REMOTE" "refs/tags/reaped/chore/plan-T009005" || true)" ]
}
