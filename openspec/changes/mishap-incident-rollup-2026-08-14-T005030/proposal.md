# Proposal: mishap-incident-rollup-2026-08-14-T005030

## Why

Fortlaufende Sammlung nicht-kritischer Mishaps aus dem Buffer.
Dieser Plan wird automatisch von `scripts/factory/mishap-rollup.sh` [T002407]
pro Zyklus generiert, sobald der Rollup-Container neue Batch-Kommentare hat.

## What

Die Batch-Kommentare auf dem Container-Ticket werden in Tasks uebersetzt,
die der Factory-Dispatcher abarbeitet.
