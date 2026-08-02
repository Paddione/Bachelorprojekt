# K8: Optionale agentische Headed-Tests zur Implementierungs-Verifikation

## Purpose

Bonus-Kind der Brain-Architektur (T002430). Eine optionale, agentisch gesteuerte Playwright-Verifikation, mit der eine fertige Implementierung programmatisch gegen die live ausgelieferte Anwendung geprüft wird — nicht als starres Skript, sondern als agentengesteuerter Durchlauf.

## Requirements

### REQ-k8-01: Agentischer Playwright-Durchlauf

**GIVEN** eine Implementierung wurde auf den Fleet-Cluster deployed
**WHEN** der Agent einen Headed-Test-Durchlauf startet
**THEN** wird die live ausgelieferte Anwendung in einem echten Browser (Chrome) geprüft

### REQ-k8-02: Kein CI-Pflichtpfad

**GIVEN** der K8-Test existiert
**WHEN** ein PR wird geöffnet oder gemerged
**THEN** der K8-Test wird NICHT als Merge-Gate ausgeführt (bewusst optional, langsam, flakeanfällig)

### REQ-k8-03: Integration in dev-flow-e2e Skill

**GIVEN** der `dev-flow-e2e` Skill wird aufgerufen
**WHEN** die Implementierung in K7 abgeschlossen ist
**THEN** kann der Skill den K8-Headed-Test als optionale Stufe ausführen

### REQ-k8-04: Vision-gestützte Verifikation (optional)

**GIVEN** der mmproj-Vision-Server läuft auf Port 8094
**WHEN** der Agent visuelle Elemente prüfen muss
**THEN** kann er Screenshots an den Vision-Server senden und die Antwort validieren

## Scope

- Erweiterung des `dev-flow-e2e` Skills um eine optionale Headed-Test-Stufe
- Playwright-Test-Spezifikation, die vom Agenten parametrisiert wird (nicht statisch)
- Anbindung an den bestehenden Vision-Server (Port 8094) für visuelle Checks
- Explizit NICHT im CI-Pfad (`.github/workflows/e2e.yml` bleibt unverändert)

## Abhängigkeiten

- Hängt an K7 (T002466, ✅ done)
- Nutzt bestehende Infrastruktur: `dev-flow-e2e`, `e2e.yml`, Vision-Server
