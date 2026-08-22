---
title: "Runtime-nahe Health Goals erweitern — Implementation Plan"
ticket_id: T013429
domains: [ci-cd, infrastructure, website, testing]
status: completed
file_locks:
  - scripts/health-goals-check.sh
  - scripts/lib/runtime-health-measure.py
  - .claude/lib/goals.md
  - .github/workflows/health-goals.yml
  - k3d/monitoring/
  - tests/spec/health-goals/runtime-health-goals.bats
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Runtime-nahe Health Goals erweitern — Implementation Plan

_Ticket: T013429_

## File Structure

```
scripts/lib/runtime-health-measure.py                 # neue fixture-fähige Messlogik
scripts/health-goals-check.sh                         # sechs Goals registrieren/reparieren
.claude/lib/goals.md                                  # Definitionen, Baselines, Befehle
.github/workflows/health-goals.yml                    # Runtime- und Browser-Voraussetzungen
k3d/monitoring/                                       # synthetische Brand-Probes für G-SLO01
tests/fixtures/health-goals/runtime/                   # Prometheus/Flux/Lighthouse/axe-Fixtures
tests/spec/health-goals/runtime-health-goals.bats      # RED/GREEN-Vertragstests
tests/spec/health-goals/id-parity.bats                 # falls feste ID-Erwartungen anzupassen sind
components/website/src/lib/sdlc/goals-data.generated.json # regeneriertes Dashboard-Artefakt
```

## 1. Messverträge zuerst als Tests festschreiben

- [x] Fixture-Sätze für Flux Ready/NotReady/Stale, Prometheus Targets up/down/leer,
      PVC headroom gesund/knapp/fehlend, axe Findings, Lighthouse Scores und
      vollständige/unvollständige SLO-Zeitreihen anlegen.
- [x] `tests/spec/health-goals/runtime-health-goals.bats` hinzufügen. Jeder Subcommand muss
      gesund, verletzt und `n/a` abdecken; leere Kandidatenmengen dürfen nie `0` ergeben.
- [x] ID-Parität für G-FLUX01, G-OBS01, G-CAP01, G-A11Y01 und G-SLO01 sowie die bestehende
      G-FE05-ID absichern.

## 2. G-FLUX01, G-OBS01 und G-CAP01 implementieren

- [x] `scripts/lib/runtime-health-measure.py` mit strengem Ein-Wert-Ausgabeformat und
      Fixture-Eingängen implementieren.
- [x] Flux-Kustomizations und Sources clusterweit auswerten; produktive suspendierte,
      NotReady- und generation-stale Ressourcen zählen.
- [x] Prometheus read-only abfragen und `up == 0` bei nicht-leerer Target-Basis zählen.
- [x] PVC-Headroom aus kubelet-Volume-Metriken für `workspace` und
      `workspace-korczewski` berechnen; Schwelle 20 Prozent.
- [x] Die drei Targets mit `want`-Guard und `-`-Übersetzung in
      `scripts/health-goals-check.sh` registrieren.

## 3. G-A11Y01 und G-FE05 browserbasiert messen

- [x] Kanonische Routendefinition zwischen Playwright-a11y-Test und Health-Messung
      vereinheitlichen, ohne Brand-Domain-Literale in Anwendungscode zu duplizieren.
- [x] axe-Ergebnisse beider Brands maschinenlesbar erfassen und ausschließlich
      `critical`/`serious` summieren; jeder unvollständige Lauf ergibt `-`.
- [x] G-FE05 von Konsolen-`grep` auf Lighthouse-JSON umstellen, beide Brands messen und den
      niedrigeren Performance-Score verwenden.
- [x] Nightly-Workflow mit gepinnter Browser-/LHCI-Einrichtung ergänzen; `--fast` und
      nicht angeforderte `--only`-IDs dürfen keine Browserinstallation oder Audits auslösen.

## 4. Kontinuierliche Probes und G-SLO01 ergänzen

- [x] Vorhandene Prometheus-Probe-Abdeckung verifizieren; falls sie fehlt, einen minimalen
      Blackbox-Exporter und `Probe`-Ressourcen für die beiden öffentlichen Health-Endpunkte
      über die bestehenden Monitoring-Kustomizations hinzufügen.
- [x] G-SLO01 aus den zwei erwarteten `probe_success`-Zeitreihen über sieben Tage ableiten,
      den schlechteren Wert in Promille ausgeben und gegen `>=995` vergleichen.
- [x] Warm-up-Verhalten dokumentieren und testen: fehlende Brand-Serie oder unzureichende
      Historie ergibt `-`.

## 5. Register, Workflow und generierte Daten synchronisieren

- [x] Alle fünf neuen IDs sowie das reparierte G-FE05 in `.claude/lib/goals.md` mit
      Priorität, reproduzierbarem Messbefehl, Target, Messzyklus und anfänglichem Messwert
      dokumentieren. Keine unbekannte Live-Baseline erfinden.
- [x] `health-goals.yml` so erweitern, dass Cluster-, Prometheus- und Browser-Messungen
      fail-closed erreichbar sind und Secrets nicht in Logs erscheinen.
- [x] Goal-Daten regenerieren und ID-/Messwert-Parität prüfen.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Die neuen Fixture-Vertragstests zuerst hinzufügen und
      gegen den unveränderten Messcode ausführen. Sie müssen scheitern, weil die fünf IDs,
      Subcommands und die JSON-basierte G-FE05-Auswertung noch fehlen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/runtime-health-goals.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [x] **Fix-Step (GREEN).** Messwerkzeug, Goal-Registrierung, Monitoring-Probes und Workflow
      implementieren. Danach müssen der neue Vertragstest sowie die bestehende
      Health-Goals-Suite grün sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/runtime-health-goals.bats
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/
bash scripts/openspec.sh validate
```

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```
