---
title: "hybrid-github-actions-runners — Implementation Plan"
ticket_id: T012446
domains: [ci-cd, github-actions, test]
status: active
file_locks:
  - .github/workflows/ci.yml
  - .github/workflows/ai-review.yml
  - .github/workflows/auto-enable-automerge.yml
  - .github/workflows/e2e-pr.yml
  - .github/workflows/pr-auto-title.yml
  - tests/spec/ci-cd/hybrid-runner-placement.bats
  - components/website/src/data/test-inventory.json
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# hybrid-github-actions-runners — Implementation Plan

_Ticket: T012446_

## File Structure

| Datei | Änderung |
|---|---|
| `.github/workflows/ci.yml` | portable PR-Gates auf `ubuntu-latest` routen |
| `.github/workflows/ai-review.yml` | portable Ausführung und Secret-/Fork-Grenze prüfen |
| `.github/workflows/auto-enable-automerge.yml` | kleinen Steuerungsjob GitHub-hosted ausführen |
| `.github/workflows/e2e-pr.yml` | gefiltertes PR-E2E GitHub-hosted ausführen, Fork-Secrets absichern |
| `.github/workflows/pr-auto-title.yml` | kleinen Steuerungsjob GitHub-hosted ausführen |
| `tests/spec/ci-cd/hybrid-runner-placement.bats` | Runner-Topologie, Checknamen und Fork-Grenzen schützen |
| `components/website/src/data/test-inventory.json` | generiertes Testinventar aktualisieren |

`opencode.yml` und `arbitration.yml` werden nur als Positivanker gelesen: ihre
`[self-hosted, fleet-gpu]`-Platzierung bleibt unverändert.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/ci-cd/hybrid-runner-placement.bats`
      anlegen. Der Guard muss die definierte portable Jobmenge, die statischen
      Required-Check-Namen und die `fleet-gpu`-Positivanker prüfen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/hybrid-runner-placement.bats
# expected: FAIL — portable Jobs stehen auf dem Basisstand noch auf self-hosted
```

- [x] **Fix-Step (GREEN).** Die Runner-Platzierung und notwendigen Fork-Guards
      implementieren. Der neue BATS-Test muss anschließend bestehen.

## Task 1 — Baseline sichern und roten Guard schreiben

- Lauf `32179927036` über `gh api repos/Paddione/Bachelorprojekt/actions/runs/32179927036/jobs`
  erfassen; pro Job Queue- und Laufzeit berechnen.
- Im neuen BATS-Test Jobblöcke statt bloßer globaler Treffer prüfen.
- Portable Jobs in `ci.yml` vollständig aufzählen und `ubuntu-latest` erwarten.
- Statische Namen der Required Checks als Positivanker prüfen.
- `opencode.yml` und `arbitration.yml` müssen weiterhin `self-hosted` plus `fleet-gpu`
  enthalten.
- Den Test gegen den unveränderten Basisstand ausführen und den roten Zustand belegen.

## Task 2 — Kern-CI auf GitHub-hosted verteilen

In `.github/workflows/ci.yml` die portablen Jobs auf `ubuntu-latest` stellen:

- BATS Unit + Quality Gates
- Manifest Validation
- Factory OpenSpec + Guards (fast)
- Factory spec shards 1–4
- Factory + OpenSpec + Guards (Aggregator)
- Security Scan
- Brett TypeScript
- Vitest (website)
- Lighthouse Performance
- Conventional Commits

Dabei `name`, `if`, `needs`, Matrix, Timeouts, Permissions und Tool-Pins nicht verändern.
Root-freie Installationspfade aus T012414 bleiben gültig und werden nicht zurückgebaut.

## Task 3 — Kleine PR-Workflows migrieren

- `auto-enable-automerge.yml` und `pr-auto-title.yml` auf `ubuntu-latest` stellen.
- `ai-review.yml` auf `ubuntu-latest` stellen und bestätigen, dass der konfigurierte API-
  Endpoint von GitHub-hosted erreichbar ist; Same-Repository-Guard für Secrets/Write-Zugriff
  erhalten.
- `e2e-pr.yml` auf `ubuntu-latest` stellen; secret-abhängige Ausführung bei Forks explizit
  überspringen, ohne den statischen Required-Check-Namen zu verlieren.
- Workflows mit lokaler GPU-Abhängigkeit unverändert lassen.

## Task 4 — Workflow- und Fork-Semantik validieren

```bash
ACTIONLINT_AUTO_INSTALL=1 bash scripts/lint-workflows.sh
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/hybrid-runner-placement.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/self-hosted-fork-guard.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/self-hosted-no-root-install.bats
```

Zusätzlich per `gh workflow` beziehungsweise PR-Lauf prüfen, dass alle bisherigen Checknamen
auftauchen und kein Required Check wegen eines geänderten Namens dauerhaft `Expected` bleibt.

## Task 5 — Testinventar und lokale Gates

```bash
task test:inventory
task test:changed
task workspace:validate
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
```

`components/website/src/data/test-inventory.json` explizit mitstagen. Keine anderen
Freshness-Artefakte blind übernehmen.

## Task 6 — CI messen und Ergebnis dokumentieren

- PR pushen und bis zum vollständigen Ende aller Required Checks beobachten.
- Für den neuen Lauf dieselben Zeitstempel wie in Task 1 abrufen.
- Queue-, Lauf- und Gesamtzeit sowie prozentuale Änderung im PR-Body dokumentieren.
- Ziel: mindestens 40 % kürzere PR-CI-Gesamtdauer.
- Bei roten Jobs nur runnerbedingte Portabilitätsfehler in diesem Change beheben; fachlich
  unabhängige Befunde separat ausweisen.
- Auto-Merge erst nach vollständigem Grün aktivieren beziehungsweise aktiviert lassen.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
```

Lokaler Stand vor dem PR:

- `task workspace:validate`, Workflow-Lint, OpenSpec-Validierung und alle gezielten
  CI-Runner-Guards sind grün.
- `task test:changed` hat 758/758 Unit- und 4231 Spec-Tests ausgeführt. Die sechs
  T012446-Tests sind grün; fünf bekannte hostabhängige Tests sind wegen Live-DB,
  lokaler Modelldateien/LM-Studio und Flux-CLI-Verfügbarkeit rot.
- `freshness:regenerate` aktualisiert das Testinventar korrekt. Die lokal nicht
  erreichbare Ticket-Datenquelle erzeugt für `openspec-status.json` nur `{}`;
  dieses ungültige Artefakt wird nicht übernommen und die CI-Prüfung bleibt offen.
