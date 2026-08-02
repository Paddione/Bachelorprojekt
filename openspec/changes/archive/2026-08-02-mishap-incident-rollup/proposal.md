# Proposal: mishap-incident-rollup-T002541

## Why

Fortlaufende Sammlung nicht-kritischer Mishaps aus dem Buffer.
Dieser Plan wird automatisch von `scripts/factory/mishap-rollup.sh` [T002407]
generiert und geupdated, sobald der Rollup-Container neue Batch-Kommentare hat.

## What

Die Batch-Kommentare auf dem Container-Ticket werden in Tasks uebersetzt,
die der Factory-Dispatcher abarbeitet.
