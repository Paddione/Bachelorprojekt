---
ticket: T001840
health_goal: G-SEC06
---

# Tasks: G-SEC06 Container CVE Scanning

## Task 1: Trivy-Scan-Schritt in ci.yml einfügen

**Datei:** `.github/workflows/ci.yml`

Neuer Job/Step nach dem bestehenden Security-Scan:
- `aquasecurity/trivy-action@master` mit `scan-type: 'image'`
- Scan-Ziel: alle Images aus `k3d/` Manifesten (Website, Brett, Sidekick, etc.)
- Severity-Filter: `HIGH,CRITICAL`
- Output: `table` (lesbar) + `sarif` (für GitHub Security-Tab)
- Bei Fund: Advisory erstellen, aber CI nicht blockieren (`continue-on-error: true`)

**Verify:**
1. `yamllint .github/workflows/ci.yml` (kein Syntax-Fehler)
2. `act -l` zeigt neuen Job
3. Manueller Test-Run mit `act push` — Trivy läuft durch

## Task 2: Baseline-Datei anlegen

**Datei:** `.claude/lib/trivy-baseline.json`

- Ersten Scan-Run auf allen Images ausführen
- Ergebnisse als JSON speichern (CVE-ID, Severity, Package, Fixed-Version)
- Datei committen als Ausgangsbasis

**Verify:**
1. Datei existiert und ist valid JSON
2. Enthält mindestens einen Eintrag (oder ist leer bei sauberen Images)

## Task 3: Dokumentation in goals.md aktualisieren

**Datei:** `.claude/lib/goals.md`

- G-SEC06 Current Value auf Ergebnis des Baseline-Scans setzen
- Beschreibung um Trivy-Integration ergänzen

**Verify:**
1. `grep -A2 'G-SEC06' .claude/lib/goals.md` zeigt aktualisierte Werte
