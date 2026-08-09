#!/usr/bin/env bats
# tests/spec/ci-cd/automerge-run-scope.bats — Umfang der CI-Laeufe nach einem Merge [T002780]
#
# Pruefmodus: Source-Grep auf .github/workflows/*.yml. Das ist hier der
# dokumentierte Ausnahmefall der Test-Resultats-Konvention (T002448-M4) — der
# Gegenstand IST die CI-Konfiguration; ein Laufzeit-Output existiert lokal nicht.
#
# Hintergrund: Jeder Merge loeste einen zweiten, vollen CI-Lauf auf main aus.
# Gemessen am 2026-08-09 an den Runs 31286839218 und 31286415279: allein die vier
# Spec-Shards ~13 Runner-Minuten, obwohl der PR-Lauf dieselben Dateien Minuten
# vorher geprueft hatte. Die Tests hier halten die drei Schnitte fest, damit sie
# nicht unbemerkt zurueckwandern.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CI="$REPO_ROOT/.github/workflows/ci.yml"
}

@test "automerge-scope: push-auf-main prueft das Merge-Delta, nicht die volle Suite" {
  local block
  block=$(awk '/^  test-factory-shard:/{flag=1; next} /^  [a-z]/ && flag {exit} flag' "$CI")

  # Positiv-Anker (T002356-M1): der Block existiert ueberhaupt.
  [ -n "$block" ] || {
    echo "FAIL: Job-Block 'test-factory-shard:' nicht gefunden."
    return 1
  }

  # Der Vorgaenger-Commit ist der einzige moegliche Diff-Bezugspunkt auf main:
  # dort ist HEAD == origin/main, der Default-Diff in find-changed-tests.sh also
  # leer. Fehlt BEFORE_SHA, faellt der Job zwangslaeufig wieder auf den Vollauf.
  echo "$block" | grep -qF 'github.event.before' || {
    echo "FAIL: test-factory-shard nutzt github.event.before nicht — auf main"
    echo "      gibt es dann keinen Diff-Bezugspunkt und die volle Suite laeuft"
    echo "      bei JEDEM Merge erneut."
    return 1
  }

  # Die Uebergabe an die Auswahl laeuft ueber die dafuer vorgesehene Naht.
  echo "$block" | grep -qF 'FIND_CHANGED_TESTS_FILES' || {
    echo "FAIL: das Merge-Delta wird nicht an find-changed-tests.sh uebergeben."
    return 1
  }

  # Fail-closed: Nullen-SHA (Force-Push / erster Push) darf NICHT als gueltiger
  # Bezugspunkt durchgehen — der Diff waere sonst gegen den leeren Baum und
  # wuerde faelschlich alles auswaehlen, oder schlimmer, gar nichts.
  echo "$block" | grep -qF '0000000000000000000000000000000000000000' || {
    echo "FAIL: kein Guard gegen den Null-SHA von github.event.before."
    return 1
  }
}

@test "automerge-scope: Lighthouse laeuft nur auf PRs" {
  local block
  block=$(awk '/^  lighthouse:/{flag=1; next} /^  [a-z]/ && flag {exit} flag' "$CI")

  [ -n "$block" ] || {
    echo "FAIL: Job-Block 'lighthouse:' nicht gefunden."
    return 1
  }

  echo "$block" | grep -qF "github.event_name == 'pull_request'" || {
    echo "FAIL: Lighthouse ist nicht auf pull_request beschraenkt."
    echo "      Der Job ist continue-on-error und auditiert die LIVE-URL — nach"
    echo "      einem Merge misst er einen Stand, der noch gar nicht deployt ist."
    return 1
  }
}

@test "automerge-scope: release-please erzeugt keinen push+PR-Doppellauf" {
  local rp="$REPO_ROOT/.github/workflows/release-please.yml"

  # Positiv-Anker: der Workflow existiert und benutzt einen eigenen Token.
  # Genau das ist die Vorbedingung dafuer, dass der push-Zweig entfallen durfte —
  # mit dem Default-GITHUB_TOKEN wuerde GitHubs Loop-Prevention den
  # pull_request-Trigger unterdruecken und der PR bekaeme gar keinen Lauf.
  [ -f "$rp" ] || {
    echo "FAIL: .github/workflows/release-please.yml fehlt."
    return 1
  }
  grep -qE 'token:\s*\$\{\{\s*secrets\.GH_PAT' "$rp" || {
    echo "FAIL: release-please laeuft nicht mehr unter secrets.GH_PAT."
    echo "      Mit dem Default-GITHUB_TOKEN feuert der pull_request-Trigger fuer"
    echo "      Bot-PRs nicht; der aus ci.yml entfernte push-Zweig fuer"
    echo "      'release-please--branches--main' waere dann wieder noetig."
    return 1
  }

  # Der push-Zweig darf nicht zurueckkehren, solange die Vorbedingung gilt:
  # er erzeugte pro Release-PR einen zweiten, identischen Lauf.
  ! grep -vE '^\s*#' "$CI" | grep -qF 'release-please--branches--main' || {
    echo "FAIL: 'release-please--branches--main' steht wieder als push-Branch in"
    echo "      ci.yml — das erzeugt einen Doppellauf neben dem pull_request-Lauf."
    return 1
  }
}
