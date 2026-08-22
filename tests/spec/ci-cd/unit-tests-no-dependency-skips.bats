#!/usr/bin/env bats
# tests/spec/ci-cd/unit-tests-no-dependency-skips.bats
# T013674 — kein Unit-Test darf sich selbst aus CI entfernen, weil eine
# Paketmanager-Abhängigkeit fehlt.
#
# Prüfmodus: Source-Grep über Testdateien und Workflow-Definition. Das ist hier die
# angemessene Form und nicht die in tests/CLAUDE.md gerügte Ersatzhandlung: geprüft wird
# eine Konvention über den Testbestand und die CI-Konfiguration selbst — beides
# manifestiert sich ausschliesslich im Quelltext. Es gibt keinen Laufzeitwert, der die
# Aussage "keine Datei tut X" tragen könnte.
#
# WARUM ES DEN GUARD BRAUCHT: ein bats-`skip` ist ein `ok`. Ein Test, der sich bei
# fehlender Abhängigkeit selbst überspringt, macht aus einer nicht durchgeführten
# Installation einen grünen Job. Vier Runtime-Tests in tests/unit/tickets-transition.bats
# taten das bei jedem CI-Lauf, ohne dass es auffiel (dieselbe Klasse wie T002508).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WORKFLOW="${REPO_ROOT}/.github/workflows/ci.yml"
  UNIT_DIR="${REPO_ROOT}/tests/unit"
}

@test "T013674: der test-bats-Job installiert die components/website-Abhaengigkeiten" {
  [ -f "$WORKFLOW" ]

  # Der Job-Block von 'test-bats:' bis zum nächsten Job auf derselben Einrückungsebene.
  # Gegen den Block statt gegen die ganze Datei: 'pnpm' kommt in ci.yml an mehreren
  # Stellen vor (Shard-Job, Vitest-Job), ein Treffer irgendwo belegt nichts über diesen
  # Job.
  local block
  block="$(awk '/^  test-bats:/{f=1} f&&/^  [a-zA-Z][a-zA-Z0-9_-]*:/&&!/^  test-bats:/{exit} f' "$WORKFLOW")"

  # Positiv-Anker: der Block wurde überhaupt gefunden und ist der richtige. Ohne ihn
  # wäre ein leerer Block (umbenannter Job, geänderte Einrückung) von einem fehlenden
  # Setup nicht zu unterscheiden — beide Male fände das grep nichts.
  [ -n "$block" ]
  printf '%s\n' "$block" | grep -qe 'BATS Unit'
  printf '%s\n' "$block" | grep -qe 'npm ci'

  # Die eigentliche Aussage.
  printf '%s\n' "$block" | grep -qe 'pnpm'
  printf '%s\n' "$block" | grep -qe 'components/website'
}

@test "T013674: kein Unit-Test skippt sich wegen einer fehlenden Abhaengigkeit weg" {
  # Positiv-Anker: es gibt überhaupt Dateien zu prüfen. Ohne ihn bestünde der Test
  # vakuos, sobald das Verzeichnis leer wäre oder der Pfad nicht stimmt.
  local total
  total="$(find "$UNIT_DIR" -maxdepth 1 -name '*.bats' -type f | wc -l | tr -d '[:blank:]')"
  [ "$total" -ge 50 ]

  # Zweiter Anker: das Suchmuster trifft überhaupt etwas. Belegt an einer Zeile, die es
  # treffen MUSS, wenn es funktioniert — sonst wäre ein kaputtes Muster von einem
  # sauberen Bestand nicht zu unterscheiden.
  run grep -cE 'skip' -r "$UNIT_DIR" --include='*.bats'
  [ "$status" -eq 0 ]

  local offenders
  offenders="$(grep -rn -E 'skip[[:space:]]+"[^"]*(node_modules|npm install|pnpm install|npm ci)' \
    "$UNIT_DIR" --include='*.bats' || true)"
  if [ -n "$offenders" ]; then
    echo "Tests, die sich wegen fehlender Abhaengigkeiten selbst ueberspringen:" >&2
    printf '%s\n' "$offenders" >&2
  fi
  [ -z "$offenders" ]
}

# KEIN dritter Test "kein Unit-Test installiert selbst". Ein Textmuster über die
# Testdateien kann einen ausgeführten `npm install` nicht von einem unterscheiden, der
# als Suchmuster in einer Assertion steht — tests/unit/knowledge-ingest-manifest.bats:13
# und tests/unit/website-dev-container.bats:107 greppen fremde Dateien auf genau diese
# Zeichenfolge und wären Falschtreffer. Der einzige reale Fall
# (tests/unit/test_art_library_manifest.bats, Installation im setup_file mit `|| skip`)
# wird vom Test oben bereits erfasst, weil seine Skip-Begründung `npm install` nennt.
# Eine Regel, die sich nicht trennscharf prüfen lässt, gehört nicht als Guard ins Repo.
