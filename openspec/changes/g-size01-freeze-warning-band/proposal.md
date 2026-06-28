# Proposal: g-size01-freeze-warning-band

_Ticket: T001291_

## Why

39 In-Scope-Quelldateien befinden sich bei 80–100 % ihres per-Extension S1-Limits aus `docs/code-quality/gates.yaml`. Mehrere stehen exakt am Limit: `scripts/docs-gen/templates.test.mjs` mit 500/500 Zeilen, `website/src/components/factory/DetailPanel.svelte` mit 495/500, `website/src/components/FactoryFloor.svelte` mit 494/500. Jede weitere hinzugefügte Zeile — ein neuer Test-Case, eine erweiterte Props-Schnittstelle, ein zusätzlicher Shell-Check — erzeugt automatisch einen neuen Eintrag in `docs/code-quality/baseline.json` (G-RH01-Schuld) und blockiert die Entwicklerin im falschen Moment: mitten in einem unrelated Feature-PR.

Die Konsequenz wäre ein stagnierendes Warn-Band: heute 39 Dateien auf Schusslinie, morgen 39 eingefrorene Schuld-Einträge mehr. Der Aufwand für präventives Splitten jetzt ist ein Bruchteil des reaktiven Refactorings unter Zeitdruck. Das Muster ist im Repo bereits erprobt — `tickets-db.ts` wurde erfolgreich aus `website-db.ts` ausgegliedert, ohne API-Änderung oder Verhaltensänderung.

## What

**Batch 1** behandelt die 9 Dateien bei ≥ 95 % ihres S1-Limits. Für jede Datei wird genau ein Helper-Modul, ein Test-Subset oder eine Sub-Komponente extrahiert, sodass die ursprüngliche Datei auf unter 80 % des Limits fällt. Kein neues Verhalten, keine API-Änderungen.

Konkret:
- `scripts/docs-gen/templates.test.mjs` (500/500) wird in drei thematische Test-Dateien aufgeteilt: Render-Page-Tests, Section-Index-Tests und Deduplication-Tests.
- `website/src/components/factory/DetailPanel.svelte` (495/500) und `FactoryFloor.svelte` (494/500) erhalten je eine extrahierte Sub-Komponente für klar abgrenzbare UI-Blöcke.
- `scripts/vda/oracle.sh` (492/500) und `scripts/pre-deploy-check.sh` (490/500) lagern ihre reusable Check-Funktionen in eine gesourcte Bibliotheksdatei aus.
- `website/src/components/admin/AdminBookingModal.svelte` (487/500), `scripts/systembrett-generate.mjs` (477/500), `scripts/build-docs.mjs` (476/500) und `website/src/lib/factory-floor.ts` (571/600) folgen demselben Muster.

**Batch 2** schließt direkt an und reduziert 15 weitere Dateien im 80–95 %-Band auf unter 80 %, um das Gesamtziel von ≤ 15 Dateien im Warn-Band zu erreichen. Kandidaten sind unter anderem `scripts/docs-gen/theme.mjs` (462/500), `scripts/build-graph.mjs` (466/500), `website/src/lib/caldav.ts` (549/600), `scripts/migrate.sh` (450/500) und `website/src/lib/messaging-db.ts` (531/600).

Der Measure-Command ist der alleinige Erfolgsindikator und läuft lokal ohne Cluster, Build-Schritt oder externe Abhängigkeit.

## Impact

**Neue Dateien:** 23 extrahierte Helper-Module, Sub-Komponenten und Test-Partials in `scripts/docs-gen/`, `scripts/vda/`, `website/src/components/`, `website/src/lib/` und `tests/e2e/lib/`.

**Geänderte Dateien:** 24 bestehende Quelldateien erhalten reduzierte Zeilenzahlen. Imports werden in den jeweiligen Dateien aktualisiert.

**Risiken:** Gering. Jede Extraktion verschiebt Code ohne Verhaltensänderung. Die extrahierten Module werden im selben Commit importiert. `task test:changed` und `task freshness:check` fangen Brüche sofort ab.

**Out-of-Scope:** Keine Änderungen an Kubernetes-Manifesten, Keycloak-Konfiguration, Datenbank-Schema oder Deployment-Prozessen. `environments/`, `k3d/`, `prod/` und `prod-fleet/` bleiben unberührt.
