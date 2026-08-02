# Spec Delta: k8-headed-tests

## ADDED Requirements

### REQ-k8-01: Agentischer Playwright-Durchlauf

**GIVEN** eine Implementierung wurde auf den Fleet-Cluster deployed
**WHEN** der Agent einen Headed-Test-Durchlauf startet
**THEN** wird die live ausgelieferte Anwendung in einem echten Browser (Chrome) geprüft

### REQ-k8-02: Kein CI-Pflichtpfad

**GIVEN** der K8-Test existiert
**WHEN** ein PR wird geöffnet oder gemerged
**THEN** der K8-Test wird NICHT als Merge-Gate ausgeführt

### REQ-k8-03: Integration in dev-flow-e2e Skill

**GIVEN** der `dev-flow-e2e` Skill wird aufgerufen
**WHEN** die Implementierung in K7 abgeschlossen ist
**THEN** kann der Skill den K8-Headed-Test als optionale Stufe ausführen

### REQ-k8-04: Vision-gestützte Verifikation (optional)

**GIVEN** der mmproj-Vision-Server läuft auf Port 8094
**WHEN** der Agent visuelle Elemente prüfen muss
**THEN** kann er Screenshots an den Vision-Server senden und die Antwort validieren
