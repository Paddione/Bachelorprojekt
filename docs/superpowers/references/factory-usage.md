# Software Factory — Usage Guide

> **⚠️ Status:** Dieser Guide beschreibt eine Mischung aus existierenden (✅),
> in Entwicklung befindlichen (🔜) und geplanten (📋) Features.
> **Prüfe den Status-Indikator** bevor du einem Abschnitt folgst.

## ✅ Phase 1: Manual Pipeline Invocation (verfügbar)

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

### Querying Similar Past Tickets ✅

```sql
-- Erfordert bge-m3 Embedding. In der Praxis vom Dispatcher generiert.
SELECT * FROM tickets.fn_find_similar(
  (SELECT embedding FROM tickets.ticket_embeddings WHERE ticket_id = '<uuid>' LIMIT 1),
  5
);
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
und Pipeline-Launch. Siehe `scripts/factory/README.md` für die Architektur.

**Noch nicht verfügbar:**
- Automatisches Queue-Polling
- Automatische Konflikt-Analyse vor Pipeline-Start
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
