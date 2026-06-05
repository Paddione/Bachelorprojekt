# Software Factory — Komponenten & Architektur

> **Status:** Phase 2 (Dispatcher) — live.
> Phase 3 (Full Auto-Pilot) ist geplant.
> Vorhaben-Ticket: T000413

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────┐
│ TIER 1: DISPATCHER (Phase 2 — live)                     │
│ Queue-Manager · Konflikt-Detektor · Scheduler           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ TIER 2: PIPELINE (Phase 1 — manuell)                    │
│ Scout → Design → Plan → Implement → Verify → Deploy     │
│ Dokumentiert in: pipeline-pattern.md                     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ TIER 3: AGENT POOL (Phase 1 — Workflow Tool)            │
│ Subagenten · Code-Review · Adversarial Panel            │
│ Dokumentiert in: review-*.prompt.md                      │
└─────────────────────────────────────────────────────────┘
```

## Komponenten-Verzeichnis

| Datei | Zweck | Status |
|-------|-------|--------|
| `README.md` | Diese Datei — Architektur & Quickstart | ✅ |
| `pipeline.js` | **Runnable** 6-Phasen Workflow Script (Scout→Deploy) | ✅ Phase 1 |
| `pipeline-pattern.md` | Referenz: 6-Phasen API-Doku (Vorläufer von pipeline.js) | ✅ |
| `templates/scout-template.md` | Scout-Phase Output-Format | ✅ |
| `templates/design-template.md` | Design-Phase Output-Format | ✅ |
| `templates/lessons-learned-template.md` | Post-Deploy-Retrospektive | ✅ |
| `review-bug-hunter.prompt.md` | Adversarial Review: Bug-Suche | ✅ |
| `review-security-auditor.prompt.md` | Adversarial Review: Security-Audit | ✅ |
| `review-pattern-enforcer.prompt.md` | Adversarial Review: Konventions-Prüfung | ✅ |
| `conflict-check.sh` | Konflikt-Detektor (Datei-Overlap), brand-aware | ✅ |
| `dispatcher.js` | Workflow-Dispatcher: Queue-Poll → Konflikt → Schedule → Launch | ✅ Phase 2 |
| `slots.sh` | Slot-Manager: pro-Brand Pool + globales Cap | ✅ Phase 2 |
| `queue.sh` | Queue-Manager: Backlog lesen, Priority+FIFO | ✅ Phase 2 |
| `schedule.sh` | Scheduler: Konflikt-gegatetes Slot-Scheduling | ✅ Phase 2 |
| `watchdog.sh` | Watchdog: 30-min Stale-Eskalation + Slot-Release | ✅ Phase 2 |
| `metrics.sh` | Durchsatz-Zusammenfassung für T000413 | ✅ Phase 2 |
| Canary-Deployment | Layer-4: automatisches Canary-Rollout | 📋 Phase 3 |
| Directory-Heuristic | Layer-4: verzeichnisbasierte Konflikt-Erkennung | 📋 Phase 3 |

## Quickstart (Phase 1 — Manuell)

### 1. Feature-Ticket erstellen

```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type feature --brand mentolder \
  --title "Kurztitel" --description "Beschreibung" --priority mittel)
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```

### 2. Scout-Phase

Exploriere die Codebase mit dem Explore-Agent. Fülle `templates/scout-template.md` aus.
Setze `touched_files` am Ticket:

```bash
psql -U website -d website -c "
UPDATE tickets.tickets SET touched_files = ARRAY['file1','file2']
WHERE external_id = '$TICKET_EXT_ID'"
```

### 3. Konflikt-Check

```bash
bash scripts/factory/conflict-check.sh "$TICKET_EXT_ID"
# Erwartet: [] (keine Konflikte) oder ["T000xxx"] (Konflikt)
```

### 4. Design-Phase (nur bei medium/complex)

Brainstorming → Spec → Adversarial Review.
Fülle `templates/design-template.md` aus.

### 5. Implementieren

Nutze das Workflow-Tool mit dem Muster aus `pipeline-pattern.md`.
Tasks parallelisieren mit `pipeline()` oder `parallel()`.

### 6. Verifizieren & Deployen

- `task test:all` muss grün sein
- PR → Squash-and-Merge
- Deploy-Task via `scripts/task-oracle.sh` ermitteln

## Verwandte Dokumente

- Spec: `docs/superpowers/specs/2026-06-01-software-factory-design.md`
- Plan: `docs/superpowers/plans/2026-06-05-software-factory-phase1.md`
- Usage Guide: `docs/superpowers/references/factory-usage.md`
- Vorhaben: T000413, Ticket: T000420
