#!/usr/bin/env bats
#
# T005321 — service-health-goals: BATS-Guards fuer die 13 neuen Health-Goals.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Die Tests fuehren die Messung
# tatsaechlich aus und pruefen ihr Verhalten; kein Grep auf Implementierungsmuster.
#

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
  MEASURE="$REPO_ROOT/scripts/lib/runtime-health-measure.py"
  GOALS_MD="$REPO_ROOT/.claude/lib/goals.md"
  CHECK_SH="$REPO_ROOT/scripts/health-goals-check.sh"
}

# ── Positiv-Anker: runtime-health-measure.py ist aufrufbar ─────────────────────

@test "runtime-health-measure.py: alte Messungen noch verfuegbar (Positiv-Anker)" {
  # Sicherstellen, dass der Test nicht vakuos wird, wenn das Hauptskript kaputt ist.
  run python3 "$MEASURE" flux --input /dev/null
  [ "$status" -eq 0 ]
}

# ── P1: Measurement Infrastructure ─────────────────────────────────────────────

@test "svc-probe: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" svc-probe
  [ "$status" -eq 0 ] || {
    echo "FAIL: svc-probe ist keine gueltige measurement choice."
    echo "       argparse gibt 'invalid choice' aus — die Funktion fehlt in main()."
    return 1
  }
  # All production Ingress hosts must be represented in the blackbox Probe.
  [ "$output" = "0" ] || {
    echo "FAIL: svc-probe meldet '${output}' ungedeckte Produktions-Ingresses."
    return 1
  }
}

@test "infra-tcp: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" infra-tcp --input /dev/null
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: infra-tcp gab '${output}' zurueck — erwartet Ganzzahl oder '-'."
    return 1
  }
}

@test "infra-http: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" infra-http --input /dev/null
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: infra-http gab '${output}' zurueck — erwartet Ganzzahl oder '-'."
    return 1
  }
}

@test "service HTTP goals use dedicated measurements" {
  for measurement in svc-oidc svc-nextcloud svc-whiteboard; do
    run python3 "$MEASURE" "$measurement" --input /dev/null
    [ "$status" -eq 0 ] || return 1
    [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || return 1
  done
  grep -q 'runtime_measure svc-oidc' "$CHECK_SH"
  grep -q 'runtime_measure svc-nextcloud' "$CHECK_SH"
  grep -q 'runtime_measure svc-whiteboard' "$CHECK_SH"
}

@test "cron-status: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" cron-status --input /dev/null
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: cron-status gab '${output}' zurueck — erwartet Ganzzahl oder '-'."
    return 1
  }
}

@test "alert-status: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" alert-status
  [ "$status" -eq 0 ]
  # [T900001] E-Mail-Receiver plattformweit deaktiviert — alert-status muss 1 melden
  # (kein aktiver emailConfigs-Receiver). Vorheriger Erwartungswert war 0 [T900001].
  [ "$output" = "1" ] || {
    echo "FAIL: alert-status muss 1 melden (E-Mail-Receiver deaktiviert), bekam '${output}'."
    return 1
  }
}

@test "drift: existiert als measurement choice in runtime-health-measure.py" {
  run python3 "$MEASURE" drift --input /dev/null
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: drift gab '${output}' zurueck — erwartet Ganzzahl oder '-'."
    return 1
  }
}

# ── P3: CronJob Detection Script ──────────────────────────────────────────────

@test "cronjob-check.sh: existiert und ist executable" {
  [ -f "$REPO_ROOT/scripts/lib/cronjob-check.sh" ]
  [ -x "$REPO_ROOT/scripts/lib/cronjob-check.sh" ]
}

@test "cronjob-check.sh: gibt Ganzzahl oder '-' zurueck (fail-closed)" {
  run bash "$REPO_ROOT/scripts/lib/cronjob-check.sh"
  [ "$status" -eq 0 ] || {
    echo "FAIL: cronjob-check.sh ended mit status ${status}."
    return 1
  }
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: cronjob-check.sh gab '${output}' zurueck — erwartet Ganzzahl oder '-'."
    return 1
  }
}

# ── P4: Manifest Drift Detection Script ───────────────────────────────────────

@test "manifest-drift-check.sh: existiert und ist executable" {
  [ -f "$REPO_ROOT/scripts/lib/manifest-drift-check.sh" ]
  [ -x "$REPO_ROOT/scripts/lib/manifest-drift-check.sh" ]
}

@test "manifest-drift-check.sh replicas: gibt Ganzzahl oder '-' zurueck" {
  run bash "$REPO_ROOT/scripts/lib/manifest-drift-check.sh" replicas
  [ "$status" -eq 0 ] || {
    echo "FAIL: manifest-drift-check.sh replicas ended mit status ${status}."
    return 1
  }
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: manifest-drift-check.sh replicas gab '${output}' zurueck."
    return 1
  }
}

@test "manifest-drift-check.sh probes: gibt Ganzzahl oder '-' zurueck" {
  run bash "$REPO_ROOT/scripts/lib/manifest-drift-check.sh" probes
  [ "$status" -eq 0 ] || {
    echo "FAIL: manifest-drift-check.sh probes ended mit status ${status}."
    return 1
  }
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: manifest-drift-check.sh probes gab '${output}' zurueck."
    return 1
  }
}

@test "manifest-drift-check.sh sealed: gibt Ganzzahl oder '-' zurueck" {
  run bash "$REPO_ROOT/scripts/lib/manifest-drift-check.sh" sealed
  [ "$status" -eq 0 ] || {
    echo "FAIL: manifest-drift-check.sh sealed ended mit status ${status}."
    return 1
  }
  [[ "$output" =~ ^[0-9]+$ ]] || [[ "$output" == "-" ]] || {
    echo "FAIL: manifest-drift-check.sh sealed gab '${output}' zurueck."
    return 1
  }
}

# ── P2: Goals Registration (id-parity guard) ──────────────────────────────────

# Die 13 neuen Goal-IDs muessen in goals.md VORKOMMEN — id-parity.bats
# (documented_ids()) prueft die H2-Sektionen, also muss jede ID eine
# '## G-XXXX' Zeile haben.

@test "goals.md: alle 13 neuen Goal-IDs als H2-Sektion vorhanden (T005321)" {
  for id in G-SVC01 G-SVC02 G-SVC03 G-SVC04 G-INF01 G-INF02 G-INF03 G-INF04 G-CJ01 G-ALR01 G-DRIFT01 G-DRIFT02 G-DRIFT03; do
    grep -q "^## ${id} " "$GOALS_MD" || {
      echo "FAIL: '$id' fehlt als H2-Sektion in goals.md."
      return 1
    }
  done
}

@test "goals.md: alle 13 neuen Goals haben Was-Beschreibung und Messbefehl" {
  for id in G-SVC01 G-SVC02 G-SVC03 G-SVC04 G-INF01 G-INF02 G-INF03 G-INF04 G-CJ01 G-ALR01 G-DRIFT01 G-DRIFT02 G-DRIFT03; do
    # 'Was:' muss innerhalb der H2-Sektion des Goals stehen (naechste H2 davor).
    grep -A 10 "^## $id" "$GOALS_MD" | grep -q 'Was:' || {
      echo "FAIL: '$id' hat keine 'Was:' Beschreibung in goals.md."
      return 1
    }
    # Messbefehl in backticks muss vorhanden sein.
    grep -A 10 "^## $id" "$GOALS_MD" | grep -q '`' || {
      echo "FAIL: '$id' hat keinen Messbefehl in backticks in goals.md."
      return 1
    }
  done
}

# ── P5: Integration guard (health-goals-check.sh) ─────────────────────────────

@test "health-goals-check.sh: alle 13 neuen Goals als row target integriert" {
  for id in G-SVC01 G-SVC02 G-SVC03 G-SVC04 G-INF01 G-INF02 G-INF03 G-INF04 G-CJ01 G-ALR01 G-DRIFT01 G-DRIFT02 G-DRIFT03; do
    grep -q "row target $id" "$CHECK_SH" || {
      echo "FAIL: 'row target $id' fehlt in health-goals-check.sh."
      return 1
    }
  done
}
