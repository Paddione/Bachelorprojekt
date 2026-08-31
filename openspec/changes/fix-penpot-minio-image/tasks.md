---
title: Penpot-MinIO-Image reparieren
ticket_id: T900026
domains:
  - bachelorprojekt-infra
status: plan_staged
---

# fix-penpot-minio-image — Implementation Plan

## File Structure

| Datei | Änderung |
|---|---|
| `tests/spec/fleet-operations/penpot-manifests.bats` | Bestehenden Manifest-Test um den ungültigen und den verifizierten Release-Tag ergänzen |
| `k3d/penpot.yaml` | Nicht existierenden MinIO-Tag durch den verifizierten offiziellen Release ersetzen |
| `docs/runbooks/penpot.md` | Ausgelieferten MinIO-Release und das ImagePullBackOff-Fehlerbild dokumentieren |
| `openspec/changes/fix-penpot-minio-image/specs/fleet-operations.md` | Verfügbarkeitsanforderung als Delta festhalten |
| `components/website/src/data/test-inventory.json` | Testinventar nach Änderung des bestehenden BATS-Tests regenerieren |

S1: Die drei bestehenden Quelldateien sind nicht baselined; für `.bats`, `.yaml` und `.md`
ist in `docs/code-quality/gates.yaml` kein S1-Zeilenlimit registriert. Der Fix bleibt dennoch
klein und legt keine Baseline-Ausnahme an.

## Task 1 — Regressionstest im roten Zustand belegen

Der bereits erweiterte BATS-Test verweigert den nicht existierenden Tag und verlangt den mit
`docker manifest inspect` sowie dem offiziellen MinIO-Release belegten Tag
`RELEASE.2025-04-22T22-12-26Z`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
# expected: FAIL — ausschließlich T900026 schlägt gegen den alten Image-Tag fehl
```

## Task 2 — MinIO-Release korrigieren und Runbook synchronisieren

In `k3d/penpot.yaml` den MinIO-Tag auf `RELEASE.2025-04-22T22-12-26Z` ändern. Keine
manuelle Änderung am Flux-gemanagten Deployment durchführen. Den Komponenten-Eintrag im
Runbook angleichen und beim Troubleshooting ergänzen, dass `ImagePullBackOff` mit Registry-
`NotFound` zuerst gegen den manifestierten Tag geprüft wird.

Danach den gezielten Test erneut ausführen; alle Assertions müssen grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
```

## Task 3 — Render und Live-Rollout prüfen

Den Produktionsrender validieren, nach dem Merge die OCI-Auslieferung und Flux-Reconciliation
beobachten und erst dann die öffentliche Domain abnehmen:

```bash
task workspace:validate
kubectl --context fleet rollout status deployment/penminio -n workspace --timeout=5m
kubectl --context fleet rollout status deployment/penpot -n workspace --timeout=5m
curl -sSI https://design.mentolder.de/
```

Erwartet sind Ready-Pods, kein HTTP 503 und ein erreichbarer Penpot-Einstieg. Der vollständige
OIDC-Login bleibt eine interaktive Abnahme mit einem berechtigten Nutzerkonto.

## Task 4 — Finale Verifikation

Das Testinventar nach der Teständerung aktualisieren und alle Pflicht-Gates ausführen:

```bash
task test:inventory
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

