# Proposal: dora-delivery-pipeline

## Why

Die Software Factory läuft live, aber die Delivery-Pipeline ist nicht durchgängig **messbar** und
**sichtbar**:

- Die alte Tracking-Pipeline wurde entfernt (`tracking-import` CronJob PR #788, `track-pr.yml` PR #993) —
  es gibt **kein** konsolidiertes DORA-Dashboard; `v_timeline` zeigt nur historische Daten bis PR #787.
- DORA-Metriken sind verstreut und unvollständig: `delivery-metrics.ts` berechnet 3 von 4 (Deployment
  Frequency, Lead Time, Change Failure Rate) — **nur für devflow-Tickets**, **MTTR fehlt**.
- Von `dev-flow-execute` ausgeführte Tickets enden auf `qa_review`, für das es **keine Floor-Lane** gibt —
  sie verschwinden mitten in der Pipeline statt sichtbar bis „Shipped" zu wandern. Factory-Tickets enden
  abweichend auf `awaiting_deploy`. Die Post-Merge-Status sind **inkonsistent**.
- Quality-Gate-Ergebnisse (plan-lint, CI) werden **nicht** als Ticket-Metrik erfasst — die Kette ist
  nicht messbar.

Vollständige Analyse: `docs/superpowers/specs/2026-06-22-dora-delivery-pipeline-design.md`.

## What

Ein **vereinheitlichtes „Merge = Abschluss"-Lifecycle** plus messbare, sichtbare Pipeline. Drei gekoppelte
Scheiben, Build-Reihenfolge C → B → A:

- **C (Fundament):** Ticket wandert `plan→implement→verify→deploy`; bei grünem Auto-Merge nach CI wird es
  **direkt geschlossen** (`done · resolution=shipped`) — einheitlich für **Factory + dev-flow-execute (skillbasiert) inkl. Batches**.
  `awaiting_deploy`/`qa_review` entfallen aus dem Happy-Path (Enum-Werte bleiben nicht-destruktiv erhalten).
  Quality-Gate-Ergebnisse werden als `verify`-Phase-Events erfasst. CLAUDE.md wird angepasst.
- **B (Sichtbarkeit):** `factory-floor` zeigt die volle Reise bis `Shipped` (=`done`) für beide Driver inkl.
  parallele Batch-Tickets; die `awaiting_deploy`-Lane wird leer-ausgeblendet.
- **A (Messung):** Neues konsolidiertes **DORA-Dashboard** `/admin/dora` + `/api/admin/dora-metrics` mit allen
  4 kanonischen Metriken (Deployment Frequency = Merges nach main, Lead Time als Median, Change Failure Rate
  als ehrlich deklarierter Proxy, **neu: MTTR** über `type='bug'`-Tickets), vereint über Factory + devflow,
  mit Driver-Breakdown. Admin-only.

**Non-Goals (Folge-Tickets):** Scheibe D (scout-quality/drift/plan-drift als fail-closed CI-Gates);
öffentliche Read-only-DORA-Ansicht; destruktive Enum-Migration.

_Ticket: T001092_
