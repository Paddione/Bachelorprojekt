---
ticket_id: T000687
plan_ref: docs/superpowers/plans/2026-06-13-devflow-tracking-improvements.md
status: active
date: 2026-06-13
---

# Spec-Frontmatter-Standard

Jede **neue** Spec-Datei unter `docs/superpowers/specs/` erhält am Dateianfang einen
YAML-Frontmatter-Block, damit die Verbindung Spec ↔ Plan ↔ Ticket maschinenlesbar ist
(nicht nur über die Namenskonvention).

## Format

```yaml
---
ticket_id: T000XXX        # oder null, wenn (noch) kein Ticket existiert
plan_ref: docs/superpowers/plans/YYYY-MM-DD-<slug>.md   # oder null
status: active            # active = in Arbeit; completed = abgeschlossen/archiviert
date: YYYY-MM-DD
---
```

## Wer setzt es

- `dev-flow-plan` Schritt 3 (nach dem Brainstorming): setzt den Block auf die frische Spec.
- Maschinell: `bash scripts/plan-frontmatter-hook.sh --spec <spec.md>` ergänzt den Block,
  falls er fehlt (idempotent — vorhandenes Frontmatter bleibt unangetastet).

## Keine retroaktive Migration

Bestehende 100+ Specs bleiben unverändert. Der Standard gilt nur für neue Dateien.

## Verwandt

- `scripts/fix-archive-plan-status.sh` — flippt archivierte **Plan**-Frontmatter
  `active → completed` (analoge Statussemantik für Pläne).
- `scripts/plan-frontmatter-hook.sh` — Plan- und (mit `--spec`) Spec-Frontmatter.
