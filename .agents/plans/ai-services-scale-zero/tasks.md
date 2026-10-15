---
title: KI-Dienste bei null Replikas betriebsbereit vorhalten
ticket_id: none-retired
domains: [infra, deployment, test]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# ai-services-scale-zero — Implementation Plan

Zweck: T016544 durch standardmaessig deaktivierte, ueber GitOps aktivierbare
KI-Deployments ersetzen. Basis `c978307a0104891ae83159ec2e926855182241ba`.
Worktree: `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/feature/ai-services-scale-zero`.

## File Structure

- Modify `prod-fleet/mentolder/kustomization.yaml`: aktuell 384 Zeilen,
  nicht gebaselined, S1-Schwelle 800; echte Verkleinerung durch entfernte Deletes.
- Modify `tests/py/unit/test_dead_node_affinity.py`: aktuell 142 Zeilen,
  nicht gebaselined, S1-Schwelle 800; veraltete Abwesenheits-Ausnahmen entfernen.
- Create `tests/py/spec/fleet/test_ai_services_scale_zero.py`: unter 120 Zeilen,
  S1-Schwelle 800; gerenderte Default- und Aktivierungsvertraege.
- Create `tests/local/SA-23.sh`: unter 40 Zeilen, S1-Schwelle 800;
  offline Manifesttest fuer den bestehenden lokalen Test-Runner.
- Create `docs/runbooks/ai-services-scale-zero.md`: Aktivierung, Abschaltung,
  Abhaengigkeiten und Grenzen der Replikation.

## Vertrag und vorhandene Entscheidungen

Sechs Deployments: whisper, talk-transcriber, talk-recording, bge-embed,
bge-embed-bulk, bge-rerank. Fleet-Mentolder rendert alle mit replicas=0.
Bestehende Services, Modell-PVCs und die vier von T016544 entfernten
NetworkPolicies bleiben vorhanden. Die zwei externen llm-gateway-IngressRoutes
bleiben entfernt. Keine Aenderung an Devmesh oder eingefrorenem Korczewski.
Vorhandene Images, Secrets, Sicherheitskontexte und Scheduling-Vorgaben bleiben
erhalten. Keine neuen Flux-CRDs, kein HPA und keine KEDA-Installation.

Aktivierung: Betreiber aendert count in der vorhandenen Fleet-Kustomization
per GitOps von 0 auf 1. Ein darueberliegendes Kustomize-Overlay muss ebenfalls
aktivieren koennen. Abschaltung setzt die Werte wieder auf 0. Ein manuelles
kubectl scale ist nicht dauerhaft, weil Flux den Git-Zustand wiederherstellt.
RWO-/local-path-Modell-PVCs und zustandsbehaftete Talk-Prozesse begrenzen
horizontale Skalierung; Verfuegbarkeit von 0 auf 1 ist zugesichert, N Replikas
ohne zusaetzliche Architekturarbeit nicht. PVCs/Services bestehen auch bei 0.

## Task 1: RED

- [x] `bash scripts/pytest-run.sh tests/py/spec/fleet/test_ai_services_scale_zero.py -q`
  (pytest), expected: FAIL. Beleg: drei Fehler wegen fehlender Deployments,
  Services und nicht anwendbarer Aktivierung; unveraenderte Base besteht.

## Task 2: Manifest und Betriebsvertrag

- [x] Sechs Deployment-Deletes, fuenf Service-Deletes, vier NetworkPolicy-Deletes
  und zwei PVC-Deletes aus dem T016544-Block entfernen.
- [x] Die zwei IngressRoute-Deletes behalten. Top-Level replicas mit sechs
  expliziten count: 0 anlegen. Veraltete Kommentare ersetzen.
- [x] Unit-Guard: absichtliche KI-Abwesenheit nicht weiter erlauben und den
  obsoleten Whisper-Abwesenheitstest durch die neue Rendering-Suite ersetzen.
- [x] Offline SA-23 anlegen und Betriebs-Runbook schreiben.
- [x] Neue Rendering-Suite, Dead-Node-Guard und vorhandene Endpunkt-Guards
  muessen bestehen. Test-Override muss alle sechs Deployments auf 1 rendern.

Beleg Task 2: RED erneut 3 failed/1 passed. Danach Rendering-Suite,
Dead-Node-Guard und Endpunkt-Guards: 10 passed. SA-23 direkt offline: 4 passed.
Aktivierungs-Test korrigiert: relative Overlay-Ressource statt von Kustomize
abgelehntem absolutem Pfad; Service-Selektoren gegen Pod-Labels mitgeprüft.
Gesamt-Runner nicht ausgeführt: local initialisiert Stack/Testdaten vor SA-23.

## Task 3: Verify und Lieferung

- [ ] `./tests/runner.sh local SA-23`
- [ ] `task test:changed` ohne Produktions-Zugriff ausfuehren; vorhandene
  Umgebungsfehler gesondert belegen, keine Tests oder Gates abschwaechen.
- [ ] `task freshness:regenerate`, Artefakte gezielt committen.
- [ ] `task freshness:check` und `task workspace:validate`.
- [ ] Commit-Range und PR-Scope lokal pruefen, PR erstellen und CI verfolgen.
  Keine manuelle Live-Aktivierung oder Skalierung aus dieser Aufgabe.
