# Proposal: task-context-channel

## Why

Implementer-Agenten werden über die beiden Ausführungspfade ungleich versorgt, und ausgerechnet
der Hochdurchsatz-Pfad ist der schlechtere.

`dev-flow-execute` injiziert das Plan Intel Bundle als Pflicht-Kontext (`SKILL.md:69–72`) plus Plan,
Attachments und Ticket-ID. Die Factory dagegen kennt genau eine Quelle — `task-source.cjs`:
*"OpenSpec tasks.md is the only accepted source"*. Der Factory-Worker bekommt den Plan und sonst
nichts; er läuft unbeaufsichtigt und kann nicht nachfragen, was ihm fehlt.

Zusätzlich existiert das Bundle nur in 12 von 127 Changes (9 %). Ursache ist keine Nachlässigkeit,
sondern eine Lücke im Werkzeug: es gibt einen Filter (`scripts/plan-intel-filter.sh`), aber keinen
Generator. Das Befüllen ist Prosa-Anweisung an den LLM-Orchestrator — sechs Quellen von Hand
abfragen, im teuersten Kontext, der existiert. Der Verschiebeschritt ist zudem fail-soft
(`dev-flow-plan-phases.md:114`, `2>/dev/null || true`), der Ausfall also unsichtbar.

Ein still fehlschlagender Pflichtschritt ist ein optionaler Schritt. Das erklärt die 9 % vollständig.

## What

Ein gemeinsamer Kontext-Assembler für beide Pfade, hybrid aufgebaut:

- **Statischer Kern** — `intel.json`, zur Plan-Zeit von einem Generator deterministisch befüllt,
  committet und im PR reviewbar. Erhält die Reproduzierbarkeit, auf die Retry und Eval-Replay
  (`scripts/factory/eval-replay.mjs`) angewiesen sind.
- **Frische Ergänzung** — zur Dispatch-Zeit, fail-soft: parallele agent-locks, main-Drift seit
  Plan-Erstellung, semantisch ähnliche Changes über den bereits gebauten, aber nirgends
  aufgerufenen Pfad `plan-context.sh:152–163`.

Kern hart, Ergänzung weich, nichts still: fehlt der Kern, bricht der Assembler ab; fällt ein
frisches Signal aus, erscheint ein sichtbarer Marker statt einer weggelassenen Sektion.

Nicht Teil dieses Change: die Backend-Entscheidung (pgvector bleibt — eigenes ADR) und das
CPU-Failover für Embedding/Rerank. Letzteres ist durch den statischen Kern entkoppelt.

Design: `docs/superpowers/specs/2026-07-28-task-context-channel-design.md`

_Ticket: T002420_
