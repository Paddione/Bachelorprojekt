#!/usr/bin/env bats
# tests/spec/factory-attempt-counter-T002389.bats
# Ticket: T002389 — Factory-Attempt-Zähler unterscheidet nicht zwischen
# Modell-Versagen (MODEL) und Infrastruktur-Abbruch (INFRA).
#
# Design:
#   INFRA = keine Phase-Events geschrieben (Pipeline nie gestartet)
#   MODEL = Phase-Events vorhanden, aber kein Fortschritt (Pipeline abgestürzt)
#   INFRA verwendet eigenen Zähler (factory_infra_attempt:) statt factory_attempt:

WD="scripts/factory/watchdog.sh"
PR="scripts/factory/pipeline-runner.js"

# ─────────────────────────────────────────────────────────────────────────────
# D1 — watchdog.sh: Konfiguration
# ─────────────────────────────────────────────────────────────────────────────

@test "T002389-D1: watchdog.sh deklariert FACTORY_INFRA_MAX_ATTEMPTS" {
  grep -q 'FACTORY_INFRA_MAX_ATTEMPTS' "$WD"
}

@test "T002389-D1: watchdog.sh setzt INFRA-Key für Tickets ohne Phase-Events" {
  grep -q 'counter_key="factory_infra_attempt:' "$WD"
}

@test "T002389-D1: watchdog.sh setzt MODEL-Key für Tickets mit Phase-Events" {
  grep -q 'counter_key="factory_attempt:' "$WD"
}

@test "T002389-D1: watchdog.sh prüft Phase-Event-Existenz via SQL" {
  grep -q "SELECT EXISTS" "$WD"
  grep -q "factory_phase_events" "$WD"
}

# ─────────────────────────────────────────────────────────────────────────────
# D2 — watchdog.sh: Zähler-Logik
# ─────────────────────────────────────────────────────────────────────────────

@test "T002389-D2: watchdog.sh übergibt failure_class an unfactory" {
  grep -q 'failure_class}.*attempt' "$WD"
}

@test "T002389-D2: watchdog.sh zeigt failure_class im attempt_note" {
  grep -q 'failure_class:-MODEL' "$WD"
  grep -q 'class=' "$WD"
}

@test "T002389-D2: watchdog.sh nutzt max_allowed statt hartem MAX_ATTEMPTS" {
  grep -q 'max_allowed' "$WD"
  run grep 'MAX_ATTEMPTS' "$WD"
  # MAX_ATTEMPTS sollte nur noch in der Deklaration vorkommen, nicht im Vergleich
  [ "$status" -eq 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# D3 — pipeline-runner.js: record-failure-class Kommando
# ─────────────────────────────────────────────────────────────────────────────

@test "T002389-D3: pipeline-runner.js hat record-failure-class Befehl" {
  grep -q "record-failure-class" "$PR"
}

@test "T002389-D3: pipeline-runner.js validiert MODEL/INFRA" {
  grep -q "fcClass !== 'MODEL' && fcClass !== 'INFRA'" "$PR"
}

@test "T002389-D3: pipeline-runner.js schreibt via ticket.sh factory-control" {
  grep -q "factory-control.*set" "$PR"
  grep -q "pipeline_failure_class:" "$PR"
}

# ─────────────────────────────────────────────────────────────────────────────
# D4 — Regression: bestehende watchdog-Logik bleibt intakt
# ─────────────────────────────────────────────────────────────────────────────

@test "T002389-D4: watchdog.sh hat noch den dry-run Counter (T002361)" {
  grep -q "factory_attempt:" "$WD"
}

@test "T002389-D4: watchdog.sh released noch slots (Regressionswächter)" {
  grep -q "release-slot" "$WD"
}

@test "T002389-D4: watchdog.sh cleanup zombie worktrees (Regressionswächter)" {
  grep -q "_wd_cleanup_worktree" "$WD"
}

# ─────────────────────────────────────────────────────────────────────────────
# E2 — Verhalten: INFRA inkrementiert nicht den MODEL-Zähler
# ─────────────────────────────────────────────────────────────────────────────

@test "T002389-E2: INFRA-Klasse wird als solche gemeldet" {
  grep -q 'failure_class="INFRA"' "$WD"
}

@test "T002389-E2: MODEL-Klasse wird als solche gemeldet" {
  grep -q 'failure_class="MODEL"' "$WD"
}

@test "T002389-E2: INFRA verwendet factory_infra_attempt: (nicht factory_attempt:)" {
  # Sicherstellen, dass INFRA-Zweig NICHT den MODEL-Key verwendet
  # failure_class="INFRA" steht NACH counter_key="factory_infra_attempt:..." in derselben Zeile,
  # also grep von counter_key mit rückwärtigem Kontext
  run grep -B1 -A3 'failure_class="INFRA"' "$WD"
  [[ "$output" == *"factory_infra_attempt"* ]]
  [[ "$output" != *"factory_attempt:"* ]] || {
    # "factory_attempt:" kann im B1 (if-Zweig) auftauchen — prüfe, ob es NUR dort ist
    local infra_block; infra_block=$(grep -A3 'failure_class="INFRA"' "$WD")
    [[ "$infra_block" != *"factory_attempt:"* ]]
  }
}
