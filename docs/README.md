# Dokumentation (Requirements)

Diese Dokumentation enthält maschinenlesbare Anforderungsdefinitionen (JSON), die als zentrale Source of Truth für das Projekt dienen.

## Live-Dokumentation

Die vollständige, menschenlesbare Dokumentation zu Architektur, Services, Migration und Betrieb finden Sie unter:

👉 **[http://docs.localhost](http://docs.localhost)** (Erfordert laufenden k3d-Cluster)

## Lokale Anforderungen (JSON)

Die Anforderungen sind nach Kategorien in JSON-Dateien strukturiert:

| Datei | Beschreibung |
|-------|--------------|
| [`FA_requirements.json`](requirements/FA_requirements.json) | Funktionale Anforderungen (Messaging, Files, Konferenzen) |
| [`SA_requirements.json`](requirements/SA_requirements.json) | Sicherheitsanforderungen (SSO, Auth, Encryption) |
| [`NFA_requirements.json`](requirements/NFA_requirements.json) | Nicht-funktionale Anforderungen (Performance, Resilienz, Monitoring) |
| [`L_requirements.json`](requirements/L_requirements.json) | Auslieferbare Objekte (Deliverables) |
| [`AK_requirements.json`](requirements/AK_requirements.json) | Abnahmekriterien |
