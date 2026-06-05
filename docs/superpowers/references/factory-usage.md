# Software Factory — Usage Guide

> **Status (2026-06-05):** Phase 1 Foundation is live.
> ✅ = available now · 🔜 = Phase 2 (cron Dispatcher) · 📋 = Phase 3 (Full Auto-Pilot)
> Plane neue Features mit dem runnable `scripts/factory/pipeline.js` Workflow Script.

## ✅ Phase 1: Pipeline — runnable via Claude Code Workflow Tool

### Quick Start

```bash
# 1. Create a feature ticket
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "Add X feature" \
  --description "Detailed description..." \
  --priority mittel)
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT" | cut -d'|' -f2)
```

### Manual Conflict Check ✅

```bash
bash scripts/factory/conflict-check.sh T000413 "k3d/website.yaml" "website/src/pages/index.astro"
# Returns: [] (no conflicts) or ["T000412"] (conflicts with ticket T000412)
```

### Scout: Semantic Similar-Ticket Search ✅

Ab Phase 1 werden Tickets semantisch embedded (bge-m3 in prod, voyage in dev).
Die Scout-Phase nutzt den TypeScript-CLI:

```bash
# Ähnliche Tickets finden (braucht SESSIONS_DATABASE_URL + GPU-Host)
cd website && npx tsx scripts/find-similar-tickets.mjs "Add real-time notifications" 5
# Gibt JSON-Array aus: [{ticket_id, external_id, chunk, similarity}]
```

Für Backfill bestehender Tickets (einmalig pro Brand):
```bash
SESSIONS_DATABASE_URL=postgresql://website:...@<host>:5432/website \
LLM_ENABLED=true npx tsx website/scripts/backfill-ticket-embeddings.mjs
```

### Checking Factory Metrics ✅

```sql
SELECT * FROM tickets.v_factory_metrics;
```

### Viewing Active Features ✅

```sql
SELECT * FROM tickets.v_active_features;
```

## 🔜 Phase 2: Dispatcher (in Entwicklung)

Der Cron-basierte Dispatcher automatisiert Queue-Polling, Konflikt-Analyse,
### Pipeline Workflow Script ✅

Invokiere `scripts/factory/pipeline.js` via das Claude Code Workflow Tool:
```
args = { title, description, slug, ticket_id, brand: 'mentolder'|'korczewski', timestamp }
```

Oder dokumentierte Invocation via: `task factory:run`

### Manueller Conflict Check ✅

```bash
BRAND=mentolder bash scripts/factory/conflict-check.sh T000413 "k3d/website.yaml"
# Returns: [] (no conflicts) or ["T000412"] (conflicts with ticket T000412)
```

## 🔜 Phase 2: Dispatcher (geplant)

Der Cron-basierte Dispatcher automatisiert Queue-Polling, Konflikt-Analyse,
und Pipeline-Launch. Siehe `scripts/factory/README.md` für die Architektur.

**Noch nicht verfügbar:**
- Automatisches Queue-Polling
- Automatische Konflikt-Analyse vor Pipeline-Start (brand-aware conflict-check ist in Phase 1 manuell/per-pipeline)
- Watchdog (30min Timeout-Erkennung)
- Automatische Metriken-Kommentare

## 📋 Phase 3: Full Auto-Pilot (geplant)

Feature-Request → Deploytes Feature ohne menschliche Intervention.
Siehe Spec `docs/superpowers/specs/2026-06-01-software-factory-design.md` Abschnitt 7.

## Templates ✅

Alle Templates sind unter `scripts/factory/templates/` verfügbar:
- `scout-template.md` — Scout-Phase Output-Format
- `design-template.md` — Design-Phase Output-Format
- `lessons-learned-template.md` — Post-Deploy-Retrospektive

## Review Agents ✅

Prompts unter `scripts/factory/review-*.prompt.md`:
- `review-bug-hunter.prompt.md` — Findet logische Fehler
- `review-security-auditor.prompt.md` — Findet Sicherheitslücken
- `review-pattern-enforcer.prompt.md` — Prüft Projekt-Konventionen

Einsatz über das Workflow-Tool mit `agent()` oder als Standalone-Review-Pass.

## Architektur-Referenz

Siehe `scripts/factory/README.md` für die vollständige Architektur-Übersicht
und den Quickstart-Guide.
