# Proposal: One-Command Dev-Environment

**Ticket:** T002650 | **Typ:** project (EPIC) | **Aufwand:** mittel

## Problem

Nach SDLC-Isolation (ADR-006) laufen alle Komponenten lokal: k3d-Cluster, llm-proxy, bge,
PostgreSQL, Frontend. Aber das Aufsetzen erfordert mehrere manuelle Befehle in richtiger
Reihenfolge — fehleranfällig und zeitaufwendig.

## Ziel

`task dev:up` — ein einziger Befehl, der den kompletten lokalen Stack startet und verifiziert.
`task dev:down` — sauberes Herunterfahren.

## Scope

- **Im Scope:** k3d-Cluster, llm-proxy + Backends, bge-Embedding/Rerank, PostgreSQL + Migrationen,
  Frontend (Astro dev server, BUILD_TARGET=sdlc), Health-Check, dev:down
- **Nicht im Scope:** Remote-Cockpit, Tunnel ins Heimnetz, cross-platform (Windows nativ)

## Abhängigkeiten

- ADR-006 (T002623) — Topologie-Entscheidung, jetzt done
- T002655 (sdlc-up-command) — Kind-Ticket für die Task-Implementierung
- T002656 (Dev-Env: llm-proxy starten) — Kind-Ticket

## Kinder

- **T002655** — `task dev:up` / `task dev:down` implementieren
- **T002656** — llm-proxy + Backends per Systemd starten und Health-Check
