# Proposal: expand-runtime-health-goals

## Why

Die Repository-Health-Suite misst Quellcode, Konfiguration, CI, Datenbank und Pod-Zustand
bereits breit, lässt aber mehrere Übergänge zur tatsächlich ausgelieferten Nutzererfahrung
offen. Insbesondere können eine festgefahrene Flux-Reconciliation, ausgefallene Prometheus-
Targets, knapper persistenter Speicher oder Accessibility-Regressions bestehen, ohne ein
eigenes Health Goal zu verletzen. Das vorhandene Lighthouse-Ziel G-FE05 ist zudem im
automatisierten Messlauf strukturell häufig `n/a`, obwohl Lighthouse bereits in CI eingesetzt
wird. Eine längerfristige HTTP-Verfügbarkeitsaussage fehlt vollständig.

## What

- G-FLUX01 zählt nicht bereite oder festgefahrene Flux-Ressourcen im Fleet-Cluster.
- G-OBS01 zählt von Prometheus als `down` gemeldete, aktiv konfigurierte Scrape-Targets.
- G-CAP01 zählt produktive Persistent Volumes mit weniger als 20 Prozent freiem Speicher.
- G-A11Y01 zählt `critical`- und `serious`-Verstöße von axe auf den kanonischen Routen beider
  Brands.
- G-FE05 wird auf eine deterministische Lighthouse-JSON-Auswertung mit klarer Messbasis und
  `n/a`-Semantik umgestellt.
- G-SLO01 misst die HTTP-Verfügbarkeit der öffentlichen Brand-Endpunkte über ein rollierendes
  Sieben-Tage-Fenster und verlangt mindestens 99,5 Prozent.
- Gemeinsame Runtime-Messlogik wird außerhalb von `health-goals-check.sh` gekapselt und mit
  Fixtures gegen leere, fehlerhafte und positive Messgrundlagen getestet.
- Der nächtliche Health-Goals-Workflow erhält die für die sechs Messungen notwendigen,
  read-only Zugänge und Browser-Werkzeuge.

Nicht Teil dieses Changes sind automatische Reparaturen, ein Alert-Delivery-Canary,
Dashboard-Neugestaltung oder eine Änderung der Merge-Gate-Semantik anderer Ziele.

_Ticket: T013429_
