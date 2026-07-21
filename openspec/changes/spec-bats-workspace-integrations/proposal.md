---
title: "Spec-BATS Coverage (Workspace Integrations)"
ticket_id: "T002012"
domains:
  - "infrastructure"
  - "tests"
status: "planned"
---
# Design Spec: Spec-BATS Coverage (Workspace Integrations)

## WARUM (Intent)
Aktuell fehlen automatisierte BATS-Tests für 5 zentrale Workspace-Integrations-Spezifikationen
(Collabora, LiveKit, Mediaviewer, Nextcloud, Vaultwarden). Diese Lücke reduziert die messbare
Testabdeckung im Integrations-Layer der Plattform. Das Ziel ist es, diese Lücke durch die
systematische Einführung initialer BATS-Tests zu schließen.

## WAS (Scope)
Erstellung von BATS-Testdateien (`tests/spec/<slug>.bats`) für die folgenden 5 Spezifikationen:
1. `collabora-integration.bats`
2. `livekit-integration.bats`
3. `mediaviewer.bats`
4. `nextcloud-integration.bats`
5. `vaultwarden-integration.bats`

Jede dieser Dateien enthält initial mindestens einen `@test`-Block, der die grundlegende
Test-Infrastruktur validiert und die Testsuite erfasst. Dies bildet die Grundlage für spätere
Detail-Tests.

## WIE (Implementation Constraints)
- **Framework:** BATS (`tests/spec/*.bats`).
- **Isolation:** Keine neuen `tests/local/FA-XY-*.bats`-Dateien. Alle Tests folgen exakt dem
  `<slug>` der entsprechenden Spec in `openspec/specs/`.
- **Verification:** Nach der Implementierung müssen `task test:changed`, `task freshness:regenerate`
  und `task freshness:check` erfolgreich durchlaufen.

## ENTSCHEIDUNGEN
- Wir fassen alle 5 Specs in einem einzigen Change zusammen, da es sich um eine homogene
  Erweiterung der BATS-Infrastruktur für den Integrations-Layer handelt.
- Die initialen Tests sind einfache Setup-Validierungen; der Fokus liegt auf der Verankerung
  in der CI-Test-Matrix. Detail-Assertions folgen in Folge-Tickets.
