---
ticket: T001840
health_goal: G-SEC06
---

# G-SEC06: Container Images mit High/Critical CVEs

## Purpose

Container-Images regelmäßig auf Schwachstellen scannen und kritische CVEs patchen, um das Security-Blindspot zu schließen. Kein Scanner (Trivy/Grype/Snyk) existiert aktuell in der CI-Pipeline.

## Requirements

### Requirement: CI-Integration eines Container-Scanners

Der CI-Pipeline muss ein Trivy-Scan-Schritt hinzugefügt werden, der alle Container-Images auf High/Critical CVEs prüft.

**Scenarios:**

GIVEN ein Container-Image wird gebaut
WHEN der CI-Run einen Trivy-Scan durchführt
THEN werden alle High/Critical CVEs geloggt und bei Fund ein Advisory erstellt

GIVEN ein Image hat keine High/Critical CVEs
WHEN der Trivy-Scan abgeschlossen ist
THEN ist der Scan grün (kein Block)

### Requirement: Baseline-Erfassung

Vor dem aktiven Scanning muss eine Bestandsaufnahme der aktuellen CVE-Lage erfolgen, um den Ist-Zustand zu dokumentieren.

**Scenarios:**

GIVEN der erste Trivy-Scan läuft
WHEN die Ergebnisse vorliegen
THEN wird eine Baseline-Datei mit allen erkannten CVEs angelegt

### Requirement: Patching-Strategie

Kritische CVEs müssen behoben werden — entweder durch Image-Updates oder Konfigurationsänderungen.

**Scenarios:**

GIVEN ein CVE mit Severity Critical oder High wird erkannt
WHEN ein patch-Image verfügbar ist
THEN wird das Image-Tag aktualisiert

GIVEN ein CVE ist ein False-Positive oder kann nicht gepatcht werden
WHEN die Dokumentation aktualisiert wird
THEN wird das CVE als akzeptiert markiert mit Begründung

## Non-Goals

- Keine automatische Blockierung des CI bei CVE-Fund (erst Baseline, dann optional Hardening)
- Keine Dependency-Scanning (nur Container-Images)
- Keine Compliance-Reports (DSGVO, SOC2 etc.)
