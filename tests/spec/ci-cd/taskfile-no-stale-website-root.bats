#!/usr/bin/env bats
# Prüfmodus: Source-Grep (Querschnitts-Konvention — der Defekt manifestiert sich
# ausschließlich im Quelltext der Taskfiles; ein Laufzeit-Test müsste die volle
# test:changed-Pipeline ausführen). [T002448-M4 Ausnahme]
#
# Hintergrund T008454: Die Repo-Reorg T006999 verschob website/ nach
# components/website/. Taskfile.yml referenzierte danach weiter 8x `cd website`,
# wodurch task test:changed lokal ALLE Website-JS-Checks still übersprang
# (irreführende Meldung "worktree symlink limitation") — Lint-Fehler erreichten
# erst CI (PR #4674). Dieser Guard verhindert die Wiederkehr toter
# website/-Root-Pfade in Taskfiles.

setup() {
  cd "$BATS_TEST_DIRNAME/../../.."
}

@test "Taskfiles: kein cd auf totes website/-Root-Verzeichnis (T008454)" {
  # Positiv-Anker [T002356-M1]: der korrekte Pfad muss vorkommen — sonst wäre
  # die Negativ-Aussage vakuos (z.B. nach einer weiteren Verschiebung).
  grep -qE 'cd components/website' Taskfile.yml

  # Negativ-Aussage: `cd website` (ohne components/-Präfix) darf nicht mehr
  # vorkommen — das Verzeichnis existiert seit T006999 nicht mehr im Repo-Root.
  run bash -c "grep -nE '\bcd website\b' Taskfile.yml taskfiles/*.yml 2>/dev/null"
  echo "Gefundene stale Pfade: $output"
  [ "$status" -ne 0 ]
}

@test "test:changed: Website-Zweig enthält das ESLint-Gate (T008454)" {
  # Positiv-Anker: der RUN_WEBSITE-Zweig existiert.
  grep -q 'RUN_WEBSITE' Taskfile.yml
  # Das lokale Gegenstück zum fail-closed CI-Gate (eslint . --max-warnings 0)
  # muss im Taskfile verdrahtet sein.
  grep -qE 'cd components/website && pnpm lint' Taskfile.yml
}
