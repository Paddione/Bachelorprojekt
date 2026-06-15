---
title: Local CI Mirror + Baseline Auto-Tighten
slug: local-ci-baseline-sync
date: 2026-06-15
status: active
---

# Local CI Mirror + Baseline Auto-Tighten — Design Spec

## 1. Problem

### 1.1 `task test:all` ist kein CI-Spiegel

Der lokale Entwickler-Workflow endet typischerweise mit `task test:all`. Das ist aber nur eine Teilmenge der CI-Steps. Der vollständige CI-Lauf in `.github/workflows/ci.yml` enthält zusätzlich:

- `node scripts/api-auth-check.mjs --regression` (API-Auth-Regressionsprüfung)
- `task freshness:check` — enthält: `freshness:regenerate` + Diff-Check + `quality:check` (S1–S4-Ratchet) + Baseline-Key-Count-Assertion
- `node --test scripts/build-learning-assets.test.mjs`
- `./scripts/tests/systembrett-template.test.sh`
- Brett typecheck + Unit-Tests (separater CI-Job, ~2 min)
- Website + Arena Vitest (separater CI-Job, ~5 min)

Folge: Ein Entwickler pusht nach `task test:all`, CI failt auf `freshness:check` oder dem S1-Ratchet — der Fehler hätte lokal auffallen können.

### 1.2 Der S1-Ratchet wird nur in `freshness:check` ausgeführt, nicht in `task test:all`

`task test:all` ruft `test:code-quality` auf, das wiederum `quality:check` aufruft — **aber nur als letzten Schritt nach dem vollen BATS-Lauf**. `freshness:check` läuft in CI als separater Step nach `test:all`. Wenn `freshness:regenerate` Artefakte verändert, die den S1-Ratchet beeinflussen, sieht der Entwickler das lokal nicht, solange er nur `task test:all` ausführt.

### 1.3 Baseline bleibt auf altem Wert, wenn eine Datei kleiner wird

`docs/code-quality/baseline.json` enthält eingefrorene Violations: `{ gate, path, metric, frozen_at }`. Das `metric`-Feld ist die Zeilenzahl zum Einfrierzeitpunkt. Wird eine baselinete Datei kleiner, bleibt `baseline.metric` auf dem alten (höheren) Wert stehen.

**Konsequenz:** Die Datei hat ein „verborgenes Wachstumsbudget" — sie kann bis zum alten Baseline-Wert anwachsen, ohne CI zu brechen. Der nächste Entwickler, der die Datei bearbeitet, sieht kein Warnsignal, obwohl die Datei eigentlich schon verbessert wurde.

`quality:baseline:refresh` (existierendes `baseline-refresh.mjs`) löst dieses Problem technisch, wird aber nicht automatisch ausgeführt.

### 1.4 Pre-push Hook ist advisory-only

`.githooks/pre-push` warnt nur bei BATS-Änderungen ohne `repo-index.json`-Update. Es blockiert nie. Entwickler können Pushes durchführen, obwohl `quality:check` fehlschlagen würde.

---

## 2. Lösung: 3 Komponenten

### 2.1 `task ci:local` — Exaktes CI-Spiegelbild

Ein Task, der lokal dieselbe Step-Reihenfolge wie CI ausführt, mit klarer Pass/Fail-Ausgabe pro Step.

**Steps (identisch zu `.github/workflows/ci.yml` `offline-tests` Job):**

1. `task test:all`
2. `node scripts/api-auth-check.mjs --regression --main-map /tmp/api-map-main.json` (benötigt `git fetch origin main`)
3. `task freshness:check` (enthält regenerate + S1–S4 + Baseline-Assertion)
4. `node --test scripts/build-learning-assets.test.mjs`
5. `./scripts/tests/systembrett-template.test.sh`

**Optionale Flags:**

- `--skip-network` / `SKIP_NETWORK=1`: Überspringt Steps 2 (API auth, braucht `origin/main`) und 3 (freshness:check kann git-Operationen machen). Für Offline-Entwicklung.
- `--fast` / `FAST=1`: Führt nur `task test:all` + `task quality:check` aus (~3s). Für schnelle Iterationen.

**Nicht in Scope für `ci:local`:**

- Brett typecheck/Vitest (separater CI-Job, ~7 min): zu langsam für den normalen lokalen Loop. Separat via `npm run typecheck --prefix brett` aufrufbar.
- Security Scan (git-crypt, image-pin): benötigt Netzwerk und git-crypt-Unlock-Status — zu env-spezifisch.
- Commit Lint: PR-only in CI, kein lokaler Äquivalent sinnvoll.

### 2.2 `task quality:tighten` — Baseline Auto-Tighten

Ruft `baseline-refresh.mjs` auf (bereits vorhanden) und commitet das Ergebnis, wenn sich etwas geändert hat.

**Semantik:**
- Für jeden Eintrag in `baseline.json`: wenn `aktuelle Metrik < baseline.metric` → `baseline.metric` auf aktuellen Wert senken + `frozen_at` aktualisieren auf aktuellen Git HEAD SHA.
- Wenn `aktuelle Metrik > baseline.metric` → nichts tun (wäre neue Violation, das ist der Job von `quality:check`).
- Wenn `aktuelle Metrik == baseline.metric` → nichts tun.
- Wenn Eintrag nicht mehr in aktuellen Violations → aus `baseline.json` entfernen (Datei gelöscht oder unter Limit gefallen).

Das ist exakt das, was `baseline-refresh.mjs` (`applyRefresh`) bereits implementiert. `quality:tighten` ist ein dünn-gewrappter Task, der es aufruft, git-statusbasiert prüft ob sich etwas geändert hat, und bei Änderungen einen Commit erstellt.

**Wann aufrufen:**

- Nach Refactorings/Bereinigungen
- Als letzter Schritt in `dev-flow-execute` nach der Verifikationsphase (optional, wenn `baseline.json` verändert ist)
- Manuell via `task quality:tighten`

### 2.3 Pre-push Hook stärken — Blockierend für quality:check

`.githooks/pre-push` wird von advisory-only zu blockierend geändert.

**Neu:** Führt `task quality:check` aus, bevor er den Push zulässt. Exit 1 = Push geblockt.

**Design-Entscheidungen:**

- **Nur `quality:check`, nicht `freshness:check`:** `freshness:check` enthält `freshness:regenerate`, das alle generierten Artefakte neu baut (~20–30s). Das ist zu langsam für jeden Push. `quality:check` läuft in ~3s.
- **Nur `quality:check`, nicht `task test:all`:** BATS-Tests laufen ~30–60s. Das ist akzeptabel für `ci:local`, aber zu viel für jeden Push-Hook.
- **Nur `quality:check`, nicht Brett/Vitest:** Diese haben eigene node_modules, die nicht immer installiert sind (~2–7 min). Zu langsam.
- **`SKIP_CI_CHECK=1` Bypass:** Für Notfälle, Cherry-Picks, WIP-Pushes auf Feature-Branches. Explizit opt-out, kein Standard.
- **Advisory-Check bleibt:** Der bisherige BATS→repo-index-Warn-Check bleibt als zusätzliche Warnung erhalten (ist nicht blockierend).

**Timeout-Überlegung:** `task quality:check` läuft `node scripts/code-quality/check.mjs` — reine Datei-Operationen, kein Netzwerk, kein Node-Testrunner. Typisch <3s. Kein Timeout-Problem.

---

## 3. Nicht in Scope

- Brett typecheck in pre-push (zu langsam: npm ci + tsc)
- Vitest in pre-push (zu langsam: npm ci + vitest)
- `freshness:check` in pre-push (zu langsam: ~30s regenerate)
- `task test:all` in pre-push (zu langsam: BATS ~60s)
- Automatisches Tighten nach jedem Commit (zu viel git-Churn)
- CI-Parallelisierung lokal (Brett/Vitest parallel zu offline-tests): Komplexität nicht gerechtfertigt
- Security Scan lokal: braucht git-crypt-Unlock-Status

---

## 4. Betroffene Dateien

| Datei | Änderungsart | Zweck |
|-------|-------------|-------|
| `.githooks/pre-push` | Modify | Blockierender `quality:check` + `SKIP_CI_CHECK` Bypass |
| `Taskfile.yml` | Modify | Neue Tasks `ci:local` und `quality:tighten` |
| `scripts/code-quality/tighten.mjs` | Create | CLI-Wrapper um `applyRefresh` mit Commit-Option |

`baseline-refresh.mjs` (`applyRefresh`) wird wiederverwendet, nicht dupliziert.

---

## 5. S1-Budget (Zeilenlimits)

| Datei | Ist (wc -l) | Extension | Statisches Limit | Baseline | Budget |
|-------|-------------|-----------|-----------------|---------|--------|
| `.githooks/pre-push` | 32 | `.sh` | 500 | nicht-baselined | **+468** |
| `Taskfile.yml` | 4532 | `.yml` | n/a (kein S1-Gate für .yml) | nicht-baselined | unbegrenzt |
| `scripts/code-quality/tighten.mjs` | neu | `.mjs` | 500 | nicht-baselined | max 500 |

`.githooks/pre-push` hat Extension `.sh`-Semantik (Bash-Skript mit `#!/usr/bin/env bash`), S1-Gate greift auf `.sh`-Limit = 500. Budget sehr komfortabel.

---

## 6. S4-Orphan-Check

`scripts/code-quality/tighten.mjs` muss erreichbar sein:
- Von `Taskfile.yml` via `quality:tighten` Task → referenziert
- Neues Script, kein k3d-Manifest → kein kustomization.yaml-Eintrag nötig
