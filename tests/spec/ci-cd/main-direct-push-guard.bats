#!/usr/bin/env bats
# tests/spec/ci-cd/main-direct-push-guard.bats — Direkt-Push auf main serverseitig ausschliessen [T002889]
#
# HINTERGRUND (belegt, nicht vermutet)
# bbbeaf260 liegt auf origin/main ohne PR-Nummer und ohne durchlaufenes CI-Gate. Der lokale
# Guard .githooks/pre-commit:188 (T002631) existierte zu diesem Zeitpunkt seit fuenf Tagen
# (cb6956bb7, 2026-08-04) — er wurde umgangen. Das ist kein Implementierungsfehler des Guards:
# `git commit --no-verify` ueberspringt die Hook-Datei komplett, bevor eine Zeile darin laeuft.
# Ein pre-commit-Hook kann diese Regel strukturell nicht durchsetzen.
#
# Serverseitig steht die Tuer offen: branches/main/protection meldet enforce_admins.enabled=false
# und fuehrt kein required_pull_request_reviews. Genutzt wird dieser Spalt produktiv von
# .github/workflows/freshness-regen.yml, das mit secrets.GH_PAT (Admin-Token) auscheckt und
# direkt auf main pusht. Derselbe Spalt, zwei Nutzer — er laesst sich nur gemeinsam schliessen.
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4)
#   @test 1  Quelltext-Grep auf .github/workflows/*.yml. Zulaessig und angemessen: das Ergebnis
#            manifestiert sich AUSSCHLIESSLICH in der CI-Konfiguration; es gibt kein Laufzeit-
#            verhalten, das lokal messbar waere, ohne einen echten Workflow auf main auszuloesen.
#   @test 2  Command output verification. Das Pruefskript wird AUSGEFUEHRT und sein exit status
#            plus stdout gegen JSON-Fixtures geprueft — kein Grep auf seine Quelle.
#
# Die Protection-Einstellung selbst ist hier bewusst NICHT als Live-API-Assertion abgebildet:
# das Lesen von branches/*/protection verlangt Admin-Scope, waere in CI also entweder flaky
# oder dauerhaft uebersprungen. Sie wird stattdessen im Verifikationsschritt des Plans mit
# festgehaltener `gh api`-Ausgabe belegt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/freshness-regen.yml"
}

@test "freshness-regen: schreibt ueber einen PR statt direkt auf main zu pushen" {
  # Positiv-Anker (T002356-M1): der Workflow existiert ueberhaupt und hat den Schritt, der
  # die regenerierten Artefakte committet. Ohne diesen Anker waere die Negativ-Aussage
  # unten vakuos erfuellt, sobald die Datei umbenannt oder geloescht wird.
  [ -f "$WF" ]
  run bash -c "grep -c 'git commit' '$WF'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Positiv: es gibt einen PR-erzeugenden Schritt. Das ist die eigentliche Umstellung —
  # zuerst pruefen, dass der gueltige Fall vorhanden ist, dann die Negativ-Aussage.
  run bash -c "grep -Ec 'create-pull-request|gh(-axi)? pr create' '$WF'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Negativ: kein nacktes `git push` mehr, das auf main zeigt. Auf die Zeile eingegrenzt,
  # nicht auf die gesamte Datei — ein `git push` auf einen Feature-Branch bleibt zulaessig.
  run bash -c "grep -nE '^[[:space:]]*git push([[:space:]]*(#.*)?)?[[:space:]]*\$' '$WF' | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -eq 0 ]

  # Positiv: auf dem erzeugten PR wird Auto-Merge aktiviert. Ohne das bliebe der PR
  # liegen und der Bot waere faktisch tot, waehrend die Aussagen oben gruen melden —
  # ein PR-Schritt ohne Auto-Merge ist keine Umstellung, sondern ein Stillstand.
  run bash -c "grep -Ec 'gh(-axi)? pr merge[^\\n]*--auto' '$WF'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Negativ: kein wirksames `[skip ci]` mehr. Unter Required Status Checks meldet ein
  # uebersprungener Lauf nie ein Ergebnis — der PR bliebe unbegrenzt offen.
  # Positiv-Anker dafuer ist der `git commit`-Zaehler ganz oben in diesem Test:
  # ohne ihn waere die Abwesenheit trivial erfuellt, sobald der Schritt verschwindet.
  #
  # Kommentarzeilen sind ausgenommen: der Hinweis IM Workflow, warum die Logik aus
  # T002158 entfallen ist, ist genau das, was eine Wiedereinfuehrung verhindert. Ein
  # dateiweites Verbot wuerde die eigene Begruendung mitverbieten und zum wortlosen
  # Entfernen erziehen. Verboten ist der Marker dort, wo er wirkt.
  run bash -c "grep -v '^[[:space:]]*#' '$WF' | grep -cF '[skip ci]' || true"
  [ "$output" -eq 0 ]
}

@test "check-branch-protection: meldet enforce_admins=false und fehlende PR-Pflicht" {
  SCRIPT="$REPO_ROOT/scripts/check-branch-protection.sh"
  [ -x "$SCRIPT" ]

  # Positiv-Anker: eine konforme Konfiguration wird AKZEPTIERT. Ohne ihn koennte das Skript
  # stumpf immer 1 zurueckgeben und der Negativfall unten waere trotzdem gruen.
  good="$BATS_TEST_TMPDIR/good.json"
  cat >"$good" <<'JSON'
{"enforce_admins":{"enabled":true},
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "required_status_checks":{"contexts":["Security Scan"]}}
JSON
  run "$SCRIPT" --from-json "$good"
  [ "$status" -eq 0 ]

  # Negativfall — exakt der am 2026-08-09 vorgefundene Zustand von origin/main.
  bad="$BATS_TEST_TMPDIR/bad.json"
  cat >"$bad" <<'JSON'
{"enforce_admins":{"enabled":false},
 "required_status_checks":{"contexts":["Security Scan"]}}
JSON
  run "$SCRIPT" --from-json "$bad"
  [ "$status" -ne 0 ]
  # Beide Maengel muessen BENANNT werden, nicht nur einer — sonst schliesst der Operator
  # die eine Luecke und laesst die andere offen.
  [[ "$output" == *"enforce_admins"* ]]
  [[ "$output" == *"required_pull_request_reviews"* ]]
}
