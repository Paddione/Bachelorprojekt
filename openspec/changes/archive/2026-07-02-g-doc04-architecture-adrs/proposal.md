# Proposal: g-doc04-architecture-adrs

_Ticket: T001298_

## Why

Das Projekt enthält mehrere schwer umkehrbare Architekturentscheidungen, die bislang nur verstreut in `CLAUDE.md`, `AGENTS.md` und einzelnen Runbooks erwähnt werden — ohne strukturierte Begründung, Kontext oder dokumentierte Konsequenzen. Bei der Bachelorarbeit-Verteidigung müssen diese Entscheidungen nachvollziehbar erklärt und begründet werden können.

Konkrete Risiken ohne ADRs:
- Die Fleet-Konsolidierung (Phase 3, 2026-05-31) dekommissionierte drei eigenständige Cluster. Ohne ADR fehlt die Begründung, warum ein einheitlicher Cluster zwei Namespaces statt zwei getrennte Cluster verwendet.
- Der Verzicht auf einen GitOps-Reconciler (kein Flux, kein Argo) ist eine bewusste Designentscheidung gegen den Industriestandard — ohne dokumentierten Trade-off schwer verteidigbar.
- Die LLM-Architektur mit fail-closed-Verhalten (keine Cross-Space-Fallbacks zwischen Embedding-Modellen) ist sicherheitskritisch und muss als explizite Entscheidung nachweisbar sein.
- Das Merge=Abschluss-Ticketmodell (T001092) widerspricht üblichen Workflows (kein awaiting\_deploy-Status) und bedarf einer nachvollziehbaren Begründung.
- Der Brand-Namespace-Split ist für das Multi-Mandanten-Modell der Arbeit zentral.

Der Mess-Command `find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l` liefert aktuell `0`. Ziel ist `≥5`.

## What

Es wird ein Verzeichnis `docs/adr/` angelegt mit fünf ADR-Dateien im Nygard-Format (Status, Kontext, Entscheidung, Konsequenzen). Jede Datei dokumentiert eine der fünf prioritären Entscheidungen vollständig und eigenständig.

Fünf zu erstellende ADRs:

1. `docs/adr/ADR-001-fleet-konsolidierung.md` — Zusammenführung aller Marken-Cluster in einen einheitlichen Fleet-Cluster (Phase 3 Decommission, 2026-05-31).
2. `docs/adr/ADR-002-push-basiertes-deploy.md` — Bewusster Verzicht auf einen GitOps-Reconciler (Flux/Argo) zugunsten expliziter Push-Deploys via `task workspace:deploy`.
3. `docs/adr/ADR-003-brand-namespace-split.md` — Trennung der Marken mentolder und korczewski durch Kubernetes-Namespaces statt durch separate Cluster.
4. `docs/adr/ADR-004-llm-fail-closed.md` — LLM-Embedding-Architektur: keine Fallbacks über Vektorraumgrenzen hinweg (bge-m3 vs. voyage-multilingual-2).
5. `docs/adr/ADR-005-merge-equals-abschluss.md` — Ticketmodell: Merge in main schließt ein Ticket direkt (done), kein separater awaiting\_deploy-Status im Happy-Path.

Kein Skript, kein Code, keine Manifest-Änderungen — ausschließlich Markdown-Dokumentation.

## Impact

**Neue Dateien:**
- `docs/adr/ADR-001-fleet-konsolidierung.md`
- `docs/adr/ADR-002-push-basiertes-deploy.md`
- `docs/adr/ADR-003-brand-namespace-split.md`
- `docs/adr/ADR-004-llm-fail-closed.md`
- `docs/adr/ADR-005-merge-equals-abschluss.md`

**Geänderte Dateien:** keine

**Risiken:** gering — reine Dokumentationsarbeit, keine Laufzeitauswirkungen.

**Out-of-Scope:** Änderungen an bestehenden Manifesten, Skripten oder Konfigurationen; ADRs für zukünftige Entscheidungen; Rückwirkende Anpassung von `CLAUDE.md` oder `AGENTS.md`.
